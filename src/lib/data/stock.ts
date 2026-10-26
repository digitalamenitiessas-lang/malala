"use server";

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import {
  empleados as empleadosTable,
  insumos as insumosTable,
  movimientosStock as movimientosStockTable,
  profiles as profilesTable,
  stockSucursal as stockSucursalTable,
  sucursales as sucursalesTable,
} from "@/lib/db/schema";
import {
  ajusteManualSchema,
  retiroUsoInternoSchema,
} from "@/lib/validations/stock";
import { costoRetiroUsoInterno } from "@/lib/stock-uso-interno";
import { failure, fieldErrors, requireRole, type ActionResult } from "./_helpers";
import type {
  Insumo,
  MovimientoStock,
  StockSucursal,
  TipoMovimientoStock,
} from "@/lib/types";

function createId() {
  return crypto.randomUUID();
}

function mapInsumo(row: typeof insumosTable.$inferSelect): Insumo {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    nombre: row.nombre,
    codigo: row.codigo ?? undefined,
    unidad_medida: row.unidadMedida,
    tamano_envase: row.tamanoEnvase,
    precio_envase: row.precioEnvase,
    precio_unitario: row.precioUnitario ?? null,
    rinde: row.rinde ?? undefined,
    umbral_stock_bajo: row.umbralStockBajo,
    activo: row.activo,
    tipo: row.tipo,
    vendible: row.vendible,
    precio_venta: row.precioVenta ?? undefined,
    precio_venta_efectivo: row.precioVentaEfectivo ?? undefined,
  };
}

function mapStock(row: typeof stockSucursalTable.$inferSelect): StockSucursal {
  return {
    id: row.id,
    insumo_id: row.insumoId,
    sucursal_id: row.sucursalId,
    cantidad: row.cantidad,
  };
}

function mapMovimiento(
  row: typeof movimientosStockTable.$inferSelect,
): MovimientoStock {
  return {
    id: row.id,
    insumo_id: row.insumoId,
    sucursal_id: row.sucursalId,
    tipo: row.tipo,
    cantidad: row.cantidad,
    motivo: row.motivo ?? undefined,
    ref_tipo: row.refTipo ?? undefined,
    ref_id: row.refId ?? undefined,
    usuario_id: row.usuarioId,
    fecha: row.fecha.toISOString(),
    costo_unitario: row.costoUnitario ?? undefined,
    empleado_id: row.empleadoId ?? undefined,
  };
}

type DbTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export type StockRow = {
  insumo: Insumo;
  cantidad: number;
  estado: "ok" | "bajo" | "negativo";
};

export async function listStockBySucursal(
  sucursalId: string,
): Promise<StockRow[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerStock || !isSucursalAllowed(scope, sucursalId)) {
    return [];
  }

  const db = getDb();
  // Cada insumo pertenece a una sola sucursal: el stock de la sede son sus insumos.
  const insumosRows = await db
    .select()
    .from(insumosTable)
    .where(
      and(
        eq(insumosTable.activo, true),
        eq(insumosTable.sucursalId, sucursalId),
      ),
    )
    .orderBy(asc(insumosTable.nombre));
  const stockRows = await db
    .select()
    .from(stockSucursalTable)
    .where(eq(stockSucursalTable.sucursalId, sucursalId));

  const stockByInsumo = new Map(stockRows.map((item) => [item.insumoId, item]));

  return insumosRows
    .map((row) => {
      const insumo = mapInsumo(row);
      const stock = stockByInsumo.get(insumo.id);
      const cantidad = stock?.cantidad ?? 0;
      let estado: StockRow["estado"] = "ok";
      if (cantidad < 0) estado = "negativo";
      else if (cantidad < insumo.umbral_stock_bajo) estado = "bajo";
      return { insumo, cantidad, estado };
    })
    .sort((a, b) => {
      const order = { negativo: 0, bajo: 1, ok: 2 };
      if (a.estado !== b.estado) return order[a.estado] - order[b.estado];
      return a.insumo.nombre.localeCompare(b.insumo.nombre);
    });
}

/**
 * Aplica un delta al stock de un insumo en una sucursal y registra el movimiento.
 * Debe ejecutarse dentro de una transacción cuando forma parte de un flujo mayor.
 */
export async function applyMovementTx(
  tx: DbTx,
  args: {
    insumo_id: string;
    sucursal_id: string;
    delta: number;
    tipo: TipoMovimientoStock;
    motivo?: string;
    ref_tipo?: string;
    ref_id?: string;
    usuario_id: string;
    /** Costo por unidad base a congelar en el movimiento (uso interno). */
    costo_unitario?: number;
    empleado_id?: string;
  },
): Promise<{ stock: StockSucursal; movimiento: MovimientoStock }> {
  const [existing] = await tx
    .select()
    .from(stockSucursalTable)
    .where(
      and(
        eq(stockSucursalTable.insumoId, args.insumo_id),
        eq(stockSucursalTable.sucursalId, args.sucursal_id),
      ),
    )
    .limit(1);

  const nextCantidad = (existing?.cantidad ?? 0) + args.delta;
  let stockRow: typeof stockSucursalTable.$inferSelect;

  if (existing) {
    const [updated] = await tx
      .update(stockSucursalTable)
      .set({ cantidad: nextCantidad })
      .where(eq(stockSucursalTable.id, existing.id))
      .returning();
    stockRow = updated;
  } else {
    const [inserted] = await tx
      .insert(stockSucursalTable)
      .values({
        id: createId(),
        insumoId: args.insumo_id,
        sucursalId: args.sucursal_id,
        cantidad: nextCantidad,
      })
      .returning();
    stockRow = inserted;
  }

  const [movimientoRow] = await tx
    .insert(movimientosStockTable)
    .values({
      id: createId(),
      insumoId: args.insumo_id,
      sucursalId: args.sucursal_id,
      tipo: args.tipo,
      cantidad: args.delta,
      motivo: args.motivo ?? null,
      refTipo: args.ref_tipo ?? null,
      refId: args.ref_id ?? null,
      usuarioId: args.usuario_id,
      fecha: new Date(),
      costoUnitario: args.costo_unitario ?? null,
      empleadoId: args.empleado_id ?? null,
    })
    .returning();

  return {
    stock: mapStock(stockRow),
    movimiento: mapMovimiento(movimientoRow),
  };
}

/**
 * NO SE EXPORTA, y es a propósito: este archivo tiene "use server" en la línea
 * 1, así que todo export async es un endpoint invocable desde afuera. Estando
 * exportada, cualquiera podía reescribir el stock de cualquier sucursal —
 * recibe sucursal_id y usuario_id del que llama, o sea que además falsificaba
 * la autoría del movimiento, que es la fuente de la auditoría de stock.
 *
 * Sus llamadores son createAjusteManual y createRetiroUsoInterno, acá abajo,
 * que validan rol.
 */
async function applyMovement(args: {
  insumo_id: string;
  sucursal_id: string;
  delta: number;
  tipo: TipoMovimientoStock;
  motivo?: string;
  ref_tipo?: string;
  ref_id?: string;
  usuario_id: string;
  costo_unitario?: number;
  empleado_id?: string;
}): Promise<{ stock: StockSucursal; movimiento: MovimientoStock }> {
  const db = getDb();
  return db.transaction((tx) => applyMovementTx(tx, args));
}

export async function createAjusteManual(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin"]);
  const parsed = ajusteManualSchema.safeParse({
    insumo_id: formData.get("insumo_id"),
    sucursal_id: formData.get("sucursal_id"),
    cantidad: formData.get("cantidad"),
    motivo: formData.get("motivo"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  // El ajuste manual solo puede aplicarse sobre la sucursal activa de la sesión.
  const sucursalActiva = await getActiveSucursal();
  if (!sucursalActiva || parsed.data.sucursal_id !== sucursalActiva.id) {
    return failure("Solo podés ajustar el stock de tu sucursal activa.");
  }

  await applyMovement({
    insumo_id: parsed.data.insumo_id,
    sucursal_id: parsed.data.sucursal_id,
    delta: parsed.data.cantidad,
    tipo: "ajuste_manual",
    motivo: parsed.data.motivo,
    usuario_id: user.id,
  });

  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Un producto de venta que se saca de la góndola para usarlo en el salón (ej.
 * el Twel de Question). Antes se cargaba como ajuste manual y en la bitácora no
 * se distinguía de un faltante.
 *
 * Baja el stock y deja el costo congelado, para el reporte de consumo interno.
 * NO genera egreso: la plata ya salió cuando se compró el producto.
 */
export async function createRetiroUsoInterno(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const parsed = retiroUsoInternoSchema.safeParse({
    insumo_id: formData.get("insumo_id"),
    sucursal_id: formData.get("sucursal_id"),
    empleado_id: formData.get("empleado_id"),
    cantidad: formData.get("cantidad"),
    motivo: formData.get("motivo"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const data = parsed.data;

  const sucursalActiva = await getActiveSucursal();
  if (!sucursalActiva || data.sucursal_id !== sucursalActiva.id) {
    return failure("Solo podés retirar stock de tu sucursal activa.");
  }

  const db = getDb();
  const [insumo] = await db
    .select()
    .from(insumosTable)
    .where(eq(insumosTable.id, data.insumo_id))
    .limit(1);
  if (!insumo || insumo.sucursalId !== data.sucursal_id) {
    return failure("El producto no es de esta sucursal.");
  }
  // Los de bacha ya se consumen por receta: retirarlos acá los contaría dos
  // veces en el costo del salón.
  if (insumo.tipo !== "venta") {
    return failure("Solo se retiran para uso interno los productos de venta.");
  }

  const [empleado] = await db
    .select({ id: empleadosTable.id, activo: empleadosTable.activo })
    .from(empleadosTable)
    .where(eq(empleadosTable.id, data.empleado_id))
    .limit(1);
  if (!empleado?.activo) {
    return { ok: false, errors: { empleado_id: ["Empleada no válida"] } };
  }

  // La cantidad viene en ENVASES, como en las compras; el stock se lleva en la
  // unidad base del insumo.
  const { delta, costoUnitario } = costoRetiroUsoInterno(
    {
      tamanoEnvase: insumo.tamanoEnvase,
      precioEnvase: insumo.precioEnvase,
      precioUnitario: insumo.precioUnitario,
    },
    data.cantidad,
  );

  await applyMovement({
    insumo_id: insumo.id,
    sucursal_id: data.sucursal_id,
    delta,
    tipo: "uso_interno",
    motivo: data.motivo,
    usuario_id: user.id,
    costo_unitario: costoUnitario,
    empleado_id: empleado.id,
  });

  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  revalidatePath("/reportes/resultados");
  revalidatePath("/dashboard");
  return { ok: true };
}

export type ConsumoInternoRow = {
  insumo_id: string;
  insumo_nombre: string;
  empleado_id: string | null;
  empleado_nombre: string;
  /** En unidad base del insumo (positivo). */
  cantidad: number;
  costo: number;
};

/**
 * Lo que se retiró de productos de venta para usar en el salón, a costo,
 * agrupado por producto y empleada. Es informativo: ese costo ya está dentro de
 * las compras del período en que se compró el producto.
 */
export async function listConsumoInterno(filtros: {
  sucursalId?: string;
  desde?: string;
  hasta?: string;
}): Promise<ConsumoInternoRow[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerReportes) return [];
  if (filtros.sucursalId && !isSucursalAllowed(scope, filtros.sucursalId)) {
    return [];
  }

  const filters = [
    eq(movimientosStockTable.tipo, "uso_interno"),
    inArray(movimientosStockTable.sucursalId, scope.sucursalIdsPermitidas),
  ];
  if (filtros.sucursalId) {
    filters.push(eq(movimientosStockTable.sucursalId, filtros.sucursalId));
  }
  if (filtros.desde) {
    filters.push(gte(movimientosStockTable.fecha, new Date(filtros.desde)));
  }
  if (filtros.hasta) {
    filters.push(lte(movimientosStockTable.fecha, new Date(filtros.hasta)));
  }

  const db = getDb();
  const rows = await db
    .select({
      insumoId: movimientosStockTable.insumoId,
      insumoNombre: insumosTable.nombre,
      empleadoId: movimientosStockTable.empleadoId,
      empleadoNombre: empleadosTable.nombre,
      cantidad: movimientosStockTable.cantidad,
      costoUnitario: movimientosStockTable.costoUnitario,
    })
    .from(movimientosStockTable)
    .innerJoin(insumosTable, eq(movimientosStockTable.insumoId, insumosTable.id))
    .leftJoin(
      empleadosTable,
      eq(movimientosStockTable.empleadoId, empleadosTable.id),
    )
    .where(and(...filters));

  const agrupado = new Map<string, ConsumoInternoRow>();
  for (const row of rows) {
    const key = `${row.insumoId}|${row.empleadoId ?? ""}`;
    const cur = agrupado.get(key) ?? {
      insumo_id: row.insumoId,
      insumo_nombre: row.insumoNombre,
      empleado_id: row.empleadoId,
      empleado_nombre: row.empleadoNombre ?? "Sin indicar",
      cantidad: 0,
      costo: 0,
    };
    // La cantidad del movimiento es negativa (es una salida).
    const cantidad = -row.cantidad;
    cur.cantidad += cantidad;
    cur.costo += cantidad * (row.costoUnitario ?? 0);
    agrupado.set(key, cur);
  }
  return [...agrupado.values()].sort((a, b) => b.costo - a.costo);
}

export type MovimientoConDetalle = MovimientoStock & {
  insumo_nombre: string;
  sucursal_nombre: string;
  usuario_nombre: string;
  empleado_nombre?: string;
};

export async function listMovimientos(opts?: {
  sucursalId?: string;
  insumoId?: string;
  limit?: number;
}): Promise<MovimientoConDetalle[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerStock) return [];

  if (opts?.sucursalId && !isSucursalAllowed(scope, opts.sucursalId)) {
    return [];
  }

  const filters = [
    inArray(movimientosStockTable.sucursalId, scope.sucursalIdsPermitidas),
  ];
  if (opts?.sucursalId) {
    filters.push(eq(movimientosStockTable.sucursalId, opts.sucursalId));
  }
  if (opts?.insumoId) {
    filters.push(eq(movimientosStockTable.insumoId, opts.insumoId));
  }

  const db = getDb();
  const rows = await db
    .select({
      movimiento: movimientosStockTable,
      insumoNombre: insumosTable.nombre,
      sucursalNombre: sucursalesTable.nombre,
      usuarioNombre: profilesTable.nombre,
      empleadoNombre: empleadosTable.nombre,
    })
    .from(movimientosStockTable)
    .innerJoin(insumosTable, eq(movimientosStockTable.insumoId, insumosTable.id))
    .innerJoin(
      sucursalesTable,
      eq(movimientosStockTable.sucursalId, sucursalesTable.id),
    )
    .leftJoin(
      profilesTable,
      eq(movimientosStockTable.usuarioId, profilesTable.userId),
    )
    .leftJoin(
      empleadosTable,
      eq(movimientosStockTable.empleadoId, empleadosTable.id),
    )
    .where(and(...filters))
    .orderBy(desc(movimientosStockTable.fecha))
    .limit(opts?.limit ?? 200);

  return rows.map((row) => ({
    ...mapMovimiento(row.movimiento),
    insumo_nombre: row.insumoNombre,
    sucursal_nombre: row.sucursalNombre,
    usuario_nombre: row.usuarioNombre ?? "Sistema",
    empleado_nombre: row.empleadoNombre ?? undefined,
  }));
}
