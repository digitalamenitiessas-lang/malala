"use server";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import {
  insumos as insumosTable,
  movimientosStock as movimientosStockTable,
  profiles as profilesTable,
  stockSucursal as stockSucursalTable,
  sucursales as sucursalesTable,
} from "@/lib/db/schema";
import { ajusteManualSchema } from "@/lib/validations/stock";
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
 * Su único llamador es createAjusteManual, acá abajo, que sí valida admin.
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

export type MovimientoConDetalle = MovimientoStock & {
  insumo_nombre: string;
  sucursal_nombre: string;
  usuario_nombre: string;
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
    .where(and(...filters))
    .orderBy(desc(movimientosStockTable.fecha))
    .limit(opts?.limit ?? 200);

  return rows.map((row) => ({
    ...mapMovimiento(row.movimiento),
    insumo_nombre: row.insumoNombre,
    sucursal_nombre: row.sucursalNombre,
    usuario_nombre: row.usuarioNombre ?? "Sistema",
  }));
}
