"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { requireSupabaseRuntime } from "@/lib/db/env";
import {
  insumos as insumosTable,
  recetas as recetasTable,
  servicios as serviciosTable,
  servicioSucursal as servicioSucursalTable,
} from "@/lib/db/schema";
import type { Insumo, Receta, Servicio } from "@/lib/types";
import { recetaItemSchema } from "@/lib/validations/receta";
import { getActiveSucursalForUser } from "@/lib/auth/session";
import { fieldErrors, requireRole, type ActionResult } from "./_helpers";

export interface RecetaResumen {
  servicio: Servicio;
  cantidadInsumos: number;
  costoTotal: number;
  /** Líneas que vinieron como propuesta de la planilla y nadie confirmó. */
  propuestas: number;
  /** Líneas cuyo insumo todavía no tiene precio: el costo queda incompleto. */
  sinPrecio: number;
}

export interface RecetaItemDetalle {
  receta: Receta;
  insumo: Insumo;
  costo: number;
}

function mapServicio(row: typeof serviciosTable.$inferSelect): Servicio {
  return {
    id: row.id,
    rubro: row.rubro,
    nombre: row.nombre,
    codigo: row.codigo ?? undefined,
    precio_lista: row.precioLista,
    precio_efectivo: row.precioEfectivo,
    comision_default_pct: row.comisionDefaultPct,
    activo: row.activo,
    duracion_min: row.duracionMin ?? undefined,
    descripcion_corta: row.descripcionCorta ?? undefined,
    destacado_pct: row.destacadoPct ?? undefined,
  };
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
    precio_unitario: row.precioUnitario,
    rinde: row.rinde ?? undefined,
    umbral_stock_bajo: row.umbralStockBajo,
    activo: row.activo,
    tipo: row.tipo,
    vendible: row.vendible,
    precio_venta: row.precioVenta ?? undefined,
    precio_venta_efectivo: row.precioVentaEfectivo ?? undefined,
  };
}

function mapReceta(row: typeof recetasTable.$inferSelect): Receta {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    servicio_id: row.servicioId,
    insumo_id: row.insumoId,
    cantidad: row.cantidad,
    confirmada: row.confirmada,
  };
}

async function loadCatalogs(sucursalId?: string) {
  const db = getDb();
  const [serviciosRows, insumosRows, recetasRows] = await Promise.all([
    db
      .select()
      .from(serviciosTable)
      .orderBy(asc(serviciosTable.rubro), asc(serviciosTable.nombre)),
    db
      .select()
      .from(insumosTable)
      .where(sucursalId ? eq(insumosTable.sucursalId, sucursalId) : undefined)
      .orderBy(asc(insumosTable.nombre)),
    db
      .select()
      .from(recetasTable)
      .where(sucursalId ? eq(recetasTable.sucursalId, sucursalId) : undefined),
  ]);

  return {
    servicios: serviciosRows.map(mapServicio),
    insumos: insumosRows.map(mapInsumo),
    recetas: recetasRows.map(mapReceta),
  };
}

export async function listRecetasResumen(opts?: {
  sucursalId?: string;
}): Promise<RecetaResumen[]> {
  requireSupabaseRuntime(
    "Las recetas del sistema solo se cargan desde Supabase.",
  );

  const { servicios, insumos, recetas } = await loadCatalogs(opts?.sucursalId);
  const insumoMap = new Map(insumos.map((item) => [item.id, item]));

  let serviciosVisibles = servicios;
  if (opts?.sucursalId) {
    const miembros = await getDb()
      .select({ servicioId: servicioSucursalTable.servicioId })
      .from(servicioSucursalTable)
      .where(eq(servicioSucursalTable.sucursalId, opts.sucursalId));
    const habilitados = new Set(miembros.map((m) => m.servicioId));
    serviciosVisibles = servicios.filter((s) => habilitados.has(s.id));
  }

  return serviciosVisibles
    .filter((servicio) => servicio.activo)
    .map((servicio) => {
      const items = recetas.filter((receta) => receta.servicio_id === servicio.id);
      const costoTotal = items.reduce((acc, receta) => {
        const insumo = insumoMap.get(receta.insumo_id);
        if (!insumo || insumo.precio_unitario == null) return acc;
        return acc + receta.cantidad * insumo.precio_unitario;
      }, 0);
      const sinPrecio = items.filter((receta) => {
        const insumo = insumoMap.get(receta.insumo_id);
        return !insumo || insumo.precio_unitario == null;
      }).length;
      return {
        servicio,
        cantidadInsumos: items.length,
        costoTotal,
        propuestas: items.filter((receta) => receta.confirmada === false).length,
        sinPrecio,
      };
    });
}

export async function getRecetaItems(
  servicioId: string,
  sucursalId: string,
): Promise<RecetaItemDetalle[]> {
  requireSupabaseRuntime(
    "Las recetas del sistema solo se cargan desde Supabase.",
  );

  const db = getDb();
  const recetaRows = await db
    .select()
    .from(recetasTable)
    .where(
      and(
        eq(recetasTable.servicioId, servicioId),
        eq(recetasTable.sucursalId, sucursalId),
      ),
    );
  if (recetaRows.length === 0) return [];

  const insumoIds = recetaRows.map((item) => item.insumoId);
  const insumosRows = await db
    .select()
    .from(insumosTable)
    .where(inArray(insumosTable.id, insumoIds))
    .orderBy(asc(insumosTable.nombre));
  const insumoMap = new Map(insumosRows.map((item) => [item.id, mapInsumo(item)]));

  return recetaRows
    .map((row) => {
      const insumo = insumoMap.get(row.insumoId);
      if (!insumo) return null;
      const receta = mapReceta(row);
      const costo =
        insumo.precio_unitario != null ? receta.cantidad * insumo.precio_unitario : 0;
      return { receta, insumo, costo };
    })
    .filter((item): item is RecetaItemDetalle => item != null)
    .sort((a, b) => a.insumo.nombre.localeCompare(b.insumo.nombre));
}

export async function listRecetasByServicio(
  servicioId: string,
  sucursalId: string,
): Promise<Receta[]> {
  const items = await getRecetaItems(servicioId, sucursalId);
  return items.map((item) => item.receta);
}

export interface ServicioDeInsumo {
  servicio: Servicio;
  receta_id: string;
  cantidad: number;
  costo: number;
}

/**
 * Vista inversa de la receta: dado un insumo, en qué servicios se usa y con qué
 * cantidad/costo. Solo servicios (no promociones).
 */
export async function listServiciosByInsumo(
  insumoId: string,
): Promise<ServicioDeInsumo[]> {
  requireSupabaseRuntime(
    "Las recetas del sistema solo se cargan desde Supabase.",
  );

  const db = getDb();
  const [insumoRow] = await db
    .select()
    .from(insumosTable)
    .where(eq(insumosTable.id, insumoId))
    .limit(1);
  if (!insumoRow) return [];
  const precioUnitario = insumoRow.precioUnitario;

  const rows = await db
    .select({ receta: recetasTable, servicio: serviciosTable })
    .from(recetasTable)
    .innerJoin(serviciosTable, eq(recetasTable.servicioId, serviciosTable.id))
    .where(
      and(
        eq(recetasTable.insumoId, insumoId),
        eq(serviciosTable.esPromo, false),
      ),
    )
    .orderBy(asc(serviciosTable.rubro), asc(serviciosTable.nombre));

  return rows.map((row) => ({
    servicio: mapServicio(row.servicio),
    receta_id: row.receta.id,
    cantidad: row.receta.cantidad,
    costo: precioUnitario != null ? row.receta.cantidad * precioUnitario : 0,
  }));
}

export async function upsertRecetaItem(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin"]);
  requireSupabaseRuntime(
    "La edicion de recetas requiere Supabase configurado.",
  );
  const parsed = recetaItemSchema.safeParse({
    servicio_id: formData.get("servicio_id"),
    insumo_id: formData.get("insumo_id"),
    cantidad: formData.get("cantidad"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  // La receta se carga en la sucursal activa: cada sede tiene la suya.
  const sucursalActiva = await getActiveSucursalForUser(user);
  if (!sucursalActiva) {
    return { ok: false, errors: { _: ["No hay una sucursal activa seleccionada"] } };
  }

  const db = getDb();
  // El insumo debe pertenecer a la sucursal activa (no se mezclan sedes).
  const [insumoRow] = await db
    .select({ sucursalId: insumosTable.sucursalId, tipo: insumosTable.tipo })
    .from(insumosTable)
    .where(eq(insumosTable.id, parsed.data.insumo_id))
    .limit(1);
  if (!insumoRow || insumoRow.sucursalId !== sucursalActiva.id) {
    return {
      ok: false,
      errors: { insumo_id: ["El insumo no pertenece a la sucursal activa"] },
    };
  }
  // Las recetas solo usan productos de bacha (los de venta van solo a ventas).
  if (insumoRow.tipo !== "bacha") {
    return {
      ok: false,
      errors: { insumo_id: ["Solo se pueden usar productos de bacha en recetas"] },
    };
  }

  const existingRows = await db
    .select()
    .from(recetasTable)
    .where(
      and(
        eq(recetasTable.servicioId, parsed.data.servicio_id),
        eq(recetasTable.sucursalId, sucursalActiva.id),
      ),
    )
    .limit(500);
  const duplicate = existingRows.find(
    (item) => item.insumoId === parsed.data.insumo_id,
  );

  if (duplicate) {
    // Si alguien toca la cantidad desde la app, la línea deja de ser una
    // propuesta de la planilla: la está confirmando el salón.
    await db
      .update(recetasTable)
      .set({ cantidad: parsed.data.cantidad, confirmada: true })
      .where(eq(recetasTable.id, duplicate.id));
  } else {
    await db.insert(recetasTable).values({
      id: crypto.randomUUID(),
      sucursalId: sucursalActiva.id,
      servicioId: parsed.data.servicio_id,
      insumoId: parsed.data.insumo_id,
      cantidad: parsed.data.cantidad,
    });
  }

  revalidatePath("/catalogos/recetas");
  revalidatePath(`/catalogos/recetas/${parsed.data.servicio_id}`);
  revalidatePath("/ventas");
  revalidatePath("/stock");
  return { ok: true };
}

/**
 * Marca como confirmada toda la receta de un servicio. Es el botón que usa el
 * salón cuando revisa una receta que vino propuesta en la planilla y la da por
 * buena, sin tener que tocar línea por línea.
 */
export async function confirmarRecetaServicio(
  servicioId: string,
  sucursalId: string,
): Promise<ActionResult> {
  await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime(
    "La edicion de recetas requiere Supabase configurado.",
  );

  await getDb()
    .update(recetasTable)
    .set({ confirmada: true })
    .where(
      and(
        eq(recetasTable.servicioId, servicioId),
        eq(recetasTable.sucursalId, sucursalId),
      ),
    );

  revalidatePath("/catalogos/recetas");
  revalidatePath(`/catalogos/recetas/${servicioId}`);
  return { ok: true };
}

export async function removeRecetaItem(
  recetaId: string,
): Promise<ActionResult> {
  await requireRole(["admin"]);
  requireSupabaseRuntime(
    "La edicion de recetas requiere Supabase configurado.",
  );

  const db = getDb();
  const [row] = await db
    .select()
    .from(recetasTable)
    .where(eq(recetasTable.id, recetaId))
    .limit(1);
  if (!row) return { ok: false, errors: { _: ["No encontrado"] } };

  await db.delete(recetasTable).where(eq(recetasTable.id, recetaId));

  revalidatePath("/catalogos/recetas");
  revalidatePath(`/catalogos/recetas/${row.servicioId}`);
  revalidatePath("/ventas");
  revalidatePath("/stock");
  return { ok: true };
}

/**
 * Reemplaza la receta completa de un servicio. Las líneas quedan confirmadas:
 * si alguien la editó desde la app, ya no es una propuesta de la planilla.
 */
export async function replaceRecetasServicio(
  servicioId: string,
  sucursalId: string,
  items: Array<{ insumo_id: string; cantidad: number }>,
): Promise<ActionResult> {
  await requireRole(["admin"]);
  requireSupabaseRuntime(
    "La edicion de recetas requiere Supabase configurado.",
  );

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(recetasTable)
      .where(
        and(
          eq(recetasTable.servicioId, servicioId),
          eq(recetasTable.sucursalId, sucursalId),
        ),
      );
    if (items.length > 0) {
      await tx.insert(recetasTable).values(
        items.map((item) => ({
          id: crypto.randomUUID(),
          sucursalId,
          servicioId,
          insumoId: item.insumo_id,
          cantidad: item.cantidad,
        })),
      );
    }
  });

  revalidatePath("/catalogos/recetas");
  revalidatePath(`/catalogos/recetas/${servicioId}`);
  revalidatePath("/ventas");
  revalidatePath("/stock");
  return { ok: true };
}
