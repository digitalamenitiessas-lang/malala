"use server";

import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client/postgres";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope, esAdmin, isSucursalAllowed } from "@/lib/auth/access";
import {
  conteoStockItems as conteoItemsTable,
  conteosStock as conteosTable,
  insumoProveedores as insumoProveedoresTable,
  insumos as insumosTable,
  movimientosStock as movimientosTable,
  profiles as profilesTable,
  proveedores as proveedoresTable,
  stockSucursal as stockTable,
} from "@/lib/db/schema";
import {
  armarReporteStock,
  calcularConteo,
  consumoDiario,
  saldoEnMomento,
  sugerirCompra,
  validarEntradaConteo,
  type ConceptoStock,
  type MovimientoCalculo,
  type ParametrosCompra,
  type SugerenciaCompra,
} from "@/lib/stock-control";
import type { SaldoStock } from "@/lib/stock-ubicacion";
import { failure, type ActionResult } from "./_helpers";

/** Lo que las pantallas de control necesitan de cada insumo. */
export type InsumoControl = {
  id: string;
  nombre: string;
  codigo?: string;
  tipo: "bacha" | "venta";
  unidad_medida: string;
  tamano_envase: number;
  precio_envase: number;
  precio_unitario: number | null;
  umbral_stock_bajo: number;
  /** El primero alfabético, si tiene varios. */
  proveedor: string | null;
};

async function puedeVer(sucursalId: string): Promise<boolean> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  return scope.puedeVerStock && isSucursalAllowed(scope, sucursalId);
}

async function insumosDeSucursal(sucursalId: string): Promise<InsumoControl[]> {
  const db = getDb();
  const [rows, provs] = await Promise.all([
    db
      .select()
      .from(insumosTable)
      .where(and(eq(insumosTable.sucursalId, sucursalId), eq(insumosTable.activo, true)))
      .orderBy(asc(insumosTable.nombre)),
    db
      .select({ insumoId: insumoProveedoresTable.insumoId, nombre: proveedoresTable.nombre })
      .from(insumoProveedoresTable)
      .innerJoin(insumosTable, eq(insumoProveedoresTable.insumoId, insumosTable.id))
      .innerJoin(proveedoresTable, eq(insumoProveedoresTable.proveedorId, proveedoresTable.id))
      .where(eq(insumosTable.sucursalId, sucursalId))
      .orderBy(asc(proveedoresTable.nombre)),
  ]);
  const proveedorDe = new Map<string, string>();
  for (const p of provs) if (!proveedorDe.has(p.insumoId)) proveedorDe.set(p.insumoId, p.nombre);
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    codigo: r.codigo ?? undefined,
    tipo: r.tipo,
    unidad_medida: r.unidadMedida,
    tamano_envase: r.tamanoEnvase,
    precio_envase: r.precioEnvase,
    precio_unitario: r.precioUnitario ?? null,
    umbral_stock_bajo: r.umbralStockBajo,
    proveedor: proveedorDe.get(r.id) ?? null,
  }));
}

async function stockActual(sucursalId: string): Promise<Map<string, SaldoStock>> {
  const rows = await getDb()
    .select()
    .from(stockTable)
    .where(eq(stockTable.sucursalId, sucursalId));
  return new Map(rows.map((r) => [r.insumoId, { cantidad: r.cantidad, deposito: r.cantidadDeposito }]));
}

/** Los movimientos de la sucursal posteriores a un instante (exclusive). */
async function movimientosDesde(sucursalId: string, instante: string): Promise<MovimientoCalculo[]> {
  const rows = await getDb()
    .select({
      insumo_id: movimientosTable.insumoId,
      tipo: movimientosTable.tipo,
      cantidad: movimientosTable.cantidad,
      ref_tipo: movimientosTable.refTipo,
      ubicacion: movimientosTable.ubicacion,
      fecha: movimientosTable.fecha,
    })
    .from(movimientosTable)
    .where(
      and(
        eq(movimientosTable.sucursalId, sucursalId),
        gt(movimientosTable.fecha, new Date(instante)),
      ),
    );
  return rows.map((r) => ({ ...r, fecha: r.fecha.toISOString() }));
}

function agruparPorInsumo(movs: MovimientoCalculo[]): Map<string, MovimientoCalculo[]> {
  const out = new Map<string, MovimientoCalculo[]>();
  for (const m of movs) {
    const lista = out.get(m.insumo_id) ?? [];
    lista.push(m);
    out.set(m.insumo_id, lista);
  }
  return out;
}

// --- Conteo ------------------------------------------------------------------

export type FilaConteo = InsumoControl & {
  /** Lo que decía el sistema en el momento del conteo, en unidad base. */
  sistema: SaldoStock;
};

/** Los insumos de la sucursal con lo que había en `instante`. */
export async function datosConteo(sucursalId: string, instante: string): Promise<FilaConteo[]> {
  if (!(await puedeVer(sucursalId))) return [];
  const [insumos, actual, movs] = await Promise.all([
    insumosDeSucursal(sucursalId),
    stockActual(sucursalId),
    movimientosDesde(sucursalId, instante),
  ]);
  const porInsumo = agruparPorInsumo(movs);
  return insumos.map((i) => ({
    ...i,
    sistema: saldoEnMomento(
      actual.get(i.id) ?? { cantidad: 0, deposito: 0 },
      porInsumo.get(i.id) ?? [],
      instante,
    ),
  }));
}

const numeroOpcional = z.number().nullable().optional();

const conteoSchema = z.object({
  sucursal_id: z.string().min(1),
  fecha: z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), "Fecha inválida"),
  contado_por: z.string().trim().max(80).optional(),
  nota: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        insumo_id: z.string().min(1),
        envases: numeroOpcional,
        deposito: numeroOpcional,
        exhibicion: numeroOpcional,
      }),
    )
    .max(2000),
});

export type ConteoInput = z.infer<typeof conteoSchema>;

/** Hasta cuántos días para atrás se puede fechar un conteo. */
const DIAS_ATRAS_MAX = 31;

/**
 * Aplica un conteo: por cada producto cargado, la diferencia entre lo contado y
 * lo que había a la hora del conteo se suma al stock de hoy. Lo vendido
 * después de contar sigue descontado.
 *
 * El movimiento queda con la fecha del conteo, así el stock reconstruido para
 * cualquier momento posterior parte de lo contado.
 */
export async function aplicarConteo(
  input: ConteoInput,
): Promise<ActionResult & { id?: string }> {
  const user = await requireUser();
  if (!esAdmin(user.rol) && user.rol !== "encargada") {
    return failure("Solo la encargada o un administrador pueden cargar un conteo.");
  }
  const parsed = conteoSchema.safeParse(input);
  if (!parsed.success) return failure("Los datos del conteo no son válidos.");
  const data = parsed.data;

  const sucursalActiva = await getActiveSucursal();
  if (!sucursalActiva || data.sucursal_id !== sucursalActiva.id) {
    return failure("Solo podés cargar el conteo de tu sucursal activa.");
  }

  const fecha = new Date(data.fecha);
  const ahora = Date.now();
  if (fecha.getTime() > ahora + 5 * 60_000) {
    return failure("La hora del conteo no puede ser futura.");
  }
  if (fecha.getTime() < ahora - DIAS_ATRAS_MAX * 86_400_000) {
    return failure(`El conteo no puede ser de hace más de ${DIAS_ATRAS_MAX} días.`);
  }
  for (const item of data.items) {
    const error = validarEntradaConteo(item);
    if (error) return failure(error);
  }

  const insumos = new Map(
    (await insumosDeSucursal(data.sucursal_id)).map((i) => [i.id, i]),
  );
  const items = data.items.filter((i) => insumos.has(i.insumo_id));
  if (items.length === 0) return failure("No hay ningún producto contado.");

  const db = getDb();
  const conteoId = crypto.randomUUID();
  const fechaTexto = fecha.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const motivo = `Conteo del ${fechaTexto}${data.contado_por ? ` (${data.contado_por})` : ""}`;

  let cargados = 0;
  await db.transaction(async (tx) => {
    await tx.insert(conteosTable).values({
      id: conteoId,
      sucursalId: data.sucursal_id,
      fecha,
      usuarioId: user.id,
      contadoPor: data.contado_por || null,
      nota: data.nota || null,
    });

    const ids = items.map((i) => i.insumo_id);
    // Las filas de stock se bloquean: una venta en el medio no se pisa.
    const stockRows = await tx
      .select()
      .from(stockTable)
      .where(and(eq(stockTable.sucursalId, data.sucursal_id), inArray(stockTable.insumoId, ids)))
      .for("update");
    const stockPorInsumo = new Map(stockRows.map((r) => [r.insumoId, r]));
    const movs = agruparPorInsumo(
      (
        await tx
          .select({
            insumo_id: movimientosTable.insumoId,
            tipo: movimientosTable.tipo,
            cantidad: movimientosTable.cantidad,
            ref_tipo: movimientosTable.refTipo,
            ubicacion: movimientosTable.ubicacion,
            fecha: movimientosTable.fecha,
          })
          .from(movimientosTable)
          .where(
            and(
              eq(movimientosTable.sucursalId, data.sucursal_id),
              inArray(movimientosTable.insumoId, ids),
              gt(movimientosTable.fecha, fecha),
            ),
          )
      ).map((r) => ({ ...r, fecha: r.fecha.toISOString() })),
    );

    for (const item of items) {
      const insumo = insumos.get(item.insumo_id)!;
      const fila = stockPorInsumo.get(insumo.id);
      const actual = { cantidad: fila?.cantidad ?? 0, deposito: fila?.cantidadDeposito ?? 0 };
      const sistema = saldoEnMomento(actual, movs.get(insumo.id) ?? [], data.fecha);
      const r = calcularConteo(insumo, sistema, item);
      if (!r) continue;
      cargados++;

      await tx.insert(conteoItemsTable).values({
        id: crypto.randomUUID(),
        conteoId,
        insumoId: insumo.id,
        sistema: sistema.cantidad,
        contado: r.contado.cantidad,
        sistemaDeposito: insumo.tipo === "venta" ? sistema.deposito : null,
        contadoDeposito: insumo.tipo === "venta" ? r.contado.deposito : null,
        costoUnitario: insumo.precio_unitario,
      });
      if (r.diferencia === 0 && r.diferenciaDeposito === 0) continue;

      if (fila) {
        await tx
          .update(stockTable)
          .set({
            cantidad: sql`${stockTable.cantidad} + ${r.diferencia}`,
            cantidadDeposito: sql`greatest(0, ${stockTable.cantidadDeposito} + ${r.diferenciaDeposito})`,
          })
          .where(eq(stockTable.id, fila.id));
      } else {
        await tx.insert(stockTable).values({
          id: crypto.randomUUID(),
          insumoId: insumo.id,
          sucursalId: data.sucursal_id,
          cantidad: r.diferencia,
          cantidadDeposito: Math.max(0, r.diferenciaDeposito),
        });
      }

      // En reventa, un movimiento por lugar: la bitácora y el reporte separan
      // depósito y góndola.
      const partes: { cantidad: number; ubicacion: "deposito" | "exhibicion" | null }[] =
        insumo.tipo === "venta"
          ? [
              { cantidad: r.diferenciaDeposito, ubicacion: "deposito" },
              { cantidad: r.diferenciaExhibicion, ubicacion: "exhibicion" },
            ]
          : [{ cantidad: r.diferencia, ubicacion: null }];
      for (const p of partes) {
        if (p.cantidad === 0) continue;
        await tx.insert(movimientosTable).values({
          id: crypto.randomUUID(),
          insumoId: insumo.id,
          sucursalId: data.sucursal_id,
          tipo: "ajuste_manual",
          cantidad: p.cantidad,
          motivo,
          refTipo: "conteo",
          refId: conteoId,
          usuarioId: user.id,
          fecha,
          costoUnitario: insumo.precio_unitario,
          ubicacion: p.ubicacion,
        });
      }
    }
    if (cargados === 0) throw new SinItems();
  }).catch((e) => {
    if (e instanceof SinItems) return;
    throw e;
  });
  if (cargados === 0) return failure("No hay ningún producto contado.");

  revalidatePath("/stock");
  revalidatePath("/stock/movimientos");
  revalidatePath("/stock/conteos");
  revalidatePath("/dashboard");
  return { ok: true, id: conteoId, message: `Conteo cargado: ${cargados} productos` };
}

class SinItems extends Error {}

export type ConteoResumen = {
  id: string;
  fecha: string;
  cargado_en: string;
  usuario_nombre: string;
  contado_por?: string;
  nota?: string;
  productos: number;
  con_diferencia: number;
  /** Σ (contado − sistema) × costo. */
  valor_diferencia: number;
  valor_faltante: number;
  valor_sobrante: number;
};

export async function listConteos(sucursalId: string): Promise<ConteoResumen[]> {
  if (!(await puedeVer(sucursalId))) return [];
  const dif = sql`(${conteoItemsTable.contado} - ${conteoItemsTable.sistema}) * coalesce(${conteoItemsTable.costoUnitario}, 0)`;
  const rows = await getDb()
    .select({
      id: conteosTable.id,
      fecha: conteosTable.fecha,
      cargadoEn: conteosTable.cargadoEn,
      usuario: profilesTable.nombre,
      contadoPor: conteosTable.contadoPor,
      nota: conteosTable.nota,
      productos: sql<number>`count(${conteoItemsTable.id})::int`,
      conDiferencia: sql<number>`count(*) filter (where ${conteoItemsTable.contado} <> ${conteoItemsTable.sistema} or ${conteoItemsTable.contadoDeposito} is distinct from ${conteoItemsTable.sistemaDeposito})::int`,
      valor: sql<number>`coalesce(sum(${dif}), 0)::float8`,
      faltante: sql<number>`coalesce(sum(least(${dif}, 0)), 0)::float8`,
      sobrante: sql<number>`coalesce(sum(greatest(${dif}, 0)), 0)::float8`,
    })
    .from(conteosTable)
    .leftJoin(conteoItemsTable, eq(conteoItemsTable.conteoId, conteosTable.id))
    .leftJoin(profilesTable, eq(profilesTable.userId, conteosTable.usuarioId))
    .where(eq(conteosTable.sucursalId, sucursalId))
    .groupBy(conteosTable.id, profilesTable.nombre)
    .orderBy(desc(conteosTable.fecha))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    fecha: r.fecha.toISOString(),
    cargado_en: r.cargadoEn.toISOString(),
    usuario_nombre: r.usuario ?? "—",
    contado_por: r.contadoPor ?? undefined,
    nota: r.nota ?? undefined,
    productos: r.productos,
    con_diferencia: r.conDiferencia,
    valor_diferencia: r.valor,
    valor_faltante: r.faltante,
    valor_sobrante: r.sobrante,
  }));
}

export type ConteoDetalle = Omit<
  ConteoResumen,
  "productos" | "con_diferencia" | "valor_diferencia" | "valor_faltante" | "valor_sobrante"
> & {
  sucursal_id: string;
  items: {
    insumo: InsumoControl;
    sistema: number;
    contado: number;
    sistema_deposito: number | null;
    contado_deposito: number | null;
    costo_unitario: number | null;
  }[];
};

export async function getConteo(id: string): Promise<ConteoDetalle | null> {
  const db = getDb();
  const [cab] = await db
    .select({ conteo: conteosTable, usuario: profilesTable.nombre })
    .from(conteosTable)
    .leftJoin(profilesTable, eq(profilesTable.userId, conteosTable.usuarioId))
    .where(eq(conteosTable.id, id))
    .limit(1);
  if (!cab || !(await puedeVer(cab.conteo.sucursalId))) return null;
  const [items, insumos] = await Promise.all([
    db.select().from(conteoItemsTable).where(eq(conteoItemsTable.conteoId, id)),
    insumosDeSucursal(cab.conteo.sucursalId),
  ]);
  const porId = new Map(insumos.map((i) => [i.id, i]));
  // Un insumo desactivado después del conteo no está en la lista de activos.
  const faltan = items.filter((i) => !porId.has(i.insumoId)).map((i) => i.insumoId);
  if (faltan.length) {
    const extra = await db.select().from(insumosTable).where(inArray(insumosTable.id, faltan));
    for (const r of extra) {
      porId.set(r.id, {
        id: r.id,
        nombre: r.nombre,
        codigo: r.codigo ?? undefined,
        tipo: r.tipo,
        unidad_medida: r.unidadMedida,
        tamano_envase: r.tamanoEnvase,
        precio_envase: r.precioEnvase,
        precio_unitario: r.precioUnitario ?? null,
        umbral_stock_bajo: r.umbralStockBajo,
        proveedor: null,
      });
    }
  }
  return {
    id: cab.conteo.id,
    sucursal_id: cab.conteo.sucursalId,
    fecha: cab.conteo.fecha.toISOString(),
    cargado_en: cab.conteo.cargadoEn.toISOString(),
    usuario_nombre: cab.usuario ?? "—",
    contado_por: cab.conteo.contadoPor ?? undefined,
    nota: cab.conteo.nota ?? undefined,
    items: items
      .filter((i) => porId.has(i.insumoId))
      .map((i) => ({
        insumo: porId.get(i.insumoId)!,
        sistema: i.sistema,
        contado: i.contado,
        sistema_deposito: i.sistemaDeposito,
        contado_deposito: i.contadoDeposito,
        costo_unitario: i.costoUnitario,
      }))
      .sort((a, b) => a.insumo.nombre.localeCompare(b.insumo.nombre)),
  };
}

// --- Reporte del período -------------------------------------------------------

export type FilaReporte = {
  insumo: InsumoControl;
  inicial: SaldoStock;
  final: SaldoStock;
  conceptos: Record<ConceptoStock, number>;
};

/** `desde`/`hasta` son instantes ISO (inclusive). */
export async function reporteStock(
  sucursalId: string,
  desde: string,
  hasta: string,
): Promise<FilaReporte[]> {
  if (!(await puedeVer(sucursalId))) return [];
  const [insumos, actual, movs] = await Promise.all([
    insumosDeSucursal(sucursalId),
    stockActual(sucursalId),
    // Desde un instante antes, para que `gt` incluya los de `desde` justo.
    movimientosDesde(sucursalId, new Date(new Date(desde).getTime() - 1).toISOString()),
  ]);
  const filas = armarReporteStock(insumos, actual, movs, desde, hasta);
  const porId = new Map(insumos.map((i) => [i.id, i]));
  return filas.map((f) => ({ ...f, insumo: porId.get(f.insumo_id)! }));
}

// --- Consumo y reposición ------------------------------------------------------

export type FilaCompra = {
  insumo: InsumoControl;
  stock: number;
  sugerencia: SugerenciaCompra;
};

export async function sugerenciasCompra(
  sucursalId: string,
  dias: number,
  p: ParametrosCompra,
): Promise<FilaCompra[]> {
  if (!(await puedeVer(sucursalId))) return [];
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const [insumos, actual, movs] = await Promise.all([
    insumosDeSucursal(sucursalId),
    stockActual(sucursalId),
    movimientosDesde(sucursalId, desde),
  ]);
  const porInsumo = agruparPorInsumo(movs);
  return insumos.map((insumo) => {
    const stock = actual.get(insumo.id)?.cantidad ?? 0;
    const diario = consumoDiario(porInsumo.get(insumo.id) ?? [], insumo.tipo, dias);
    return {
      insumo,
      stock,
      sugerencia: sugerirCompra({ stock, consumoDiario: diario, tamanoEnvase: insumo.tamano_envase }, p),
    };
  });
}

const umbralesSchema = z.object({
  sucursal_id: z.string().min(1),
  umbrales: z
    .array(z.object({ insumo_id: z.string().min(1), umbral: z.number().min(0) }))
    .min(1)
    .max(2000),
});

/** Guarda los umbrales de stock bajo elegidos (en unidad base). */
export async function guardarUmbrales(
  input: z.infer<typeof umbralesSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!esAdmin(user.rol)) return failure("Solo un administrador puede cambiar los umbrales.");
  const parsed = umbralesSchema.safeParse(input);
  if (!parsed.success) return failure("Los umbrales no son válidos.");
  const sucursalActiva = await getActiveSucursal();
  if (!sucursalActiva || parsed.data.sucursal_id !== sucursalActiva.id) {
    return failure("Solo podés cambiar los umbrales de tu sucursal activa.");
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const u of parsed.data.umbrales) {
      await tx
        .update(insumosTable)
        .set({ umbralStockBajo: u.umbral })
        .where(
          and(eq(insumosTable.id, u.insumo_id), eq(insumosTable.sucursalId, parsed.data.sucursal_id)),
        );
    }
  });
  revalidatePath("/stock");
  revalidatePath("/stock/compras");
  revalidatePath("/catalogos/insumos");
  return { ok: true, message: `Umbrales guardados: ${parsed.data.umbrales.length} productos` };
}
