import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import {
  promocionItems as promocionItemsTable,
  servicios as serviciosTable,
  servicioSucursal as servicioSucursalTable,
} from "@/lib/db/schema";
import { getActiveSucursalForUser, requireUser } from "@/lib/auth/session";
import { promocionSchema } from "@/lib/validations/promocion";
import type { Promocion, PromocionComponente } from "@/lib/types";
import { revalidarCatalogoServicios } from "./_helpers";

export { estaVigente } from "@/lib/promo-vigencia";

const PROMO_RUBRO = "PROMOS";

function createId() {
  return crypto.randomUUID();
}

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; errors: Record<string, string[]> };

function fieldErrors(err: unknown): Record<string, string[]> {
  if (err && typeof err === "object" && "issues" in err) {
    const issues = (
      err as { issues: { path: (string | number)[]; message: string }[] }
    ).issues;
    const out: Record<string, string[]> = {};
    for (const issue of issues) {
      const key = issue.path[0] != null ? String(issue.path[0]) : "_";
      (out[key] ??= []).push(issue.message);
    }
    return out;
  }
  return { _: ["Error desconocido"] };
}

function parse(formData: FormData) {
  return promocionSchema.safeParse({
    nombre: formData.get("nombre"),
    precio_lista: formData.get("precio_lista"),
    precio_efectivo: formData.get("precio_efectivo"),
    comision_default_pct: formData.get("comision_default_pct"),
    duracion_min: formData.get("duracion_min") || undefined,
    vence_el: formData.get("vence_el"),
    activo: formData.get("activo") === "on" || formData.get("activo") === "true",
    componentes: formData.getAll("componentes").map(String).filter(Boolean),
  });
}

/** Arma el detalle de componentes de un conjunto de promos en una sola query. */
async function loadComponentes(
  promoIds: string[],
): Promise<Map<string, PromocionComponente[]>> {
  const byPromo = new Map<string, PromocionComponente[]>();
  if (promoIds.length === 0) return byPromo;

  const db = getDb();
  const rows = await db
    .select({
      promoId: promocionItemsTable.promoServicioId,
      orden: promocionItemsTable.orden,
      servicioId: serviciosTable.id,
      nombre: serviciosTable.nombre,
      precioLista: serviciosTable.precioLista,
      comisionPct: serviciosTable.comisionDefaultPct,
    })
    .from(promocionItemsTable)
    .innerJoin(
      serviciosTable,
      eq(promocionItemsTable.componenteServicioId, serviciosTable.id),
    )
    .where(inArray(promocionItemsTable.promoServicioId, promoIds))
    .orderBy(asc(promocionItemsTable.orden));

  for (const row of rows) {
    const list = byPromo.get(row.promoId) ?? [];
    list.push({
      servicio_id: row.servicioId,
      nombre: row.nombre,
      precio_lista: row.precioLista,
      comision_default_pct: row.comisionPct,
      orden: row.orden,
    });
    byPromo.set(row.promoId, list);
  }
  return byPromo;
}

function mapPromocion(
  row: typeof serviciosTable.$inferSelect,
  componentes: PromocionComponente[],
): Promocion {
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
    es_promo: row.esPromo,
    vence_el: row.venceEl ?? undefined,
    componentes,
  };
}

export async function listPromociones(opts?: {
  incluirInactivas?: boolean;
  /** Si se pasa, solo promos habilitadas en esa sucursal (membresía servicio_sucursal). */
  sucursalId?: string;
}): Promise<Promocion[]> {
  const db = getDb();
  const where = opts?.incluirInactivas
    ? eq(serviciosTable.esPromo, true)
    : and(eq(serviciosTable.esPromo, true), eq(serviciosTable.activo, true));
  let rows = await db
    .select()
    .from(serviciosTable)
    .where(where)
    .orderBy(asc(serviciosTable.nombre));

  if (opts?.sucursalId) {
    const miembros = await db
      .select({ servicioId: servicioSucursalTable.servicioId })
      .from(servicioSucursalTable)
      .where(eq(servicioSucursalTable.sucursalId, opts.sucursalId));
    const habilitados = new Set(miembros.map((m) => m.servicioId));
    rows = rows.filter((r) => habilitados.has(r.id));
  }

  const componentes = await loadComponentes(rows.map((r) => r.id));
  return rows.map((r) => mapPromocion(r, componentes.get(r.id) ?? []));
}

export async function getPromocion(id: string): Promise<Promocion | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(serviciosTable)
    .where(and(eq(serviciosTable.id, id), eq(serviciosTable.esPromo, true)))
    .limit(1);
  if (!row) return null;
  const componentes = await loadComponentes([id]);
  return mapPromocion(row, componentes.get(id) ?? []);
}

async function assertComponentesValidos(ids: string[]): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: serviciosTable.id })
    .from(serviciosTable)
    .where(
      and(inArray(serviciosTable.id, ids), eq(serviciosTable.esPromo, false)),
    );
  return rows.length === ids.length;
}

export async function createPromocion(formData: FormData): Promise<ActionResult> {
  "use server";
  const user = await requireUser();
  if (user.rol !== "admin") {
    return { ok: false, errors: { _: ["Solo admin puede crear promociones"] } };
  }

  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  if (!(await assertComponentesValidos(parsed.data.componentes))) {
    return { ok: false, errors: { componentes: ["Servicio inválido en la combinación"] } };
  }

  const db = getDb();
  const promoId = createId();
  await db.transaction(async (tx) => {
    await tx.insert(serviciosTable).values({
      id: promoId,
      rubro: PROMO_RUBRO,
      nombre: parsed.data.nombre,
      precioLista: parsed.data.precio_lista,
      precioEfectivo: parsed.data.precio_efectivo,
      comisionDefaultPct: parsed.data.comision_default_pct,
      activo: parsed.data.activo,
      duracionMin: parsed.data.duracion_min ?? null,
      esPromo: true,
      venceEl: parsed.data.vence_el ?? null,
    });
    await tx.insert(promocionItemsTable).values(
      parsed.data.componentes.map((servicioId, i) => ({
        id: createId(),
        promoServicioId: promoId,
        componenteServicioId: servicioId,
        orden: i,
      })),
    );

    // Membresía: la promo (servicio) queda habilitada en la sucursal activa.
    const sucursalActiva = await getActiveSucursalForUser(user);
    if (sucursalActiva) {
      await tx.insert(servicioSucursalTable).values({
        id: createId(),
        servicioId: promoId,
        sucursalId: sucursalActiva.id,
      });
    }
  });

  revalidarCatalogoServicios();
  return { ok: true, id: promoId };
}

export async function updatePromocion(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  "use server";
  const user = await requireUser();
  if (user.rol !== "admin") {
    return { ok: false, errors: { _: ["Solo admin puede editar promociones"] } };
  }

  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  if (!(await assertComponentesValidos(parsed.data.componentes))) {
    return { ok: false, errors: { componentes: ["Servicio inválido en la combinación"] } };
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: serviciosTable.id })
    .from(serviciosTable)
    .where(and(eq(serviciosTable.id, id), eq(serviciosTable.esPromo, true)))
    .limit(1);
  if (!existing) return { ok: false, errors: { _: ["Promoción no encontrada"] } };

  await db.transaction(async (tx) => {
    await tx
      .update(serviciosTable)
      .set({
        nombre: parsed.data.nombre,
        precioLista: parsed.data.precio_lista,
        precioEfectivo: parsed.data.precio_efectivo,
        comisionDefaultPct: parsed.data.comision_default_pct,
        activo: parsed.data.activo,
        duracionMin: parsed.data.duracion_min ?? null,
        venceEl: parsed.data.vence_el ?? null,
      })
      .where(eq(serviciosTable.id, id));
    await tx
      .delete(promocionItemsTable)
      .where(eq(promocionItemsTable.promoServicioId, id));
    await tx.insert(promocionItemsTable).values(
      parsed.data.componentes.map((servicioId, i) => ({
        id: createId(),
        promoServicioId: id,
        componenteServicioId: servicioId,
        orden: i,
      })),
    );
  });

  revalidarCatalogoServicios();
  revalidatePath(`/catalogos/promociones/${id}`);
  return { ok: true, id };
}

export async function togglePromocionActiva(id: string): Promise<ActionResult> {
  "use server";
  const user = await requireUser();
  if (user.rol !== "admin") {
    return { ok: false, errors: { _: ["Solo admin"] } };
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(serviciosTable)
    .where(and(eq(serviciosTable.id, id), eq(serviciosTable.esPromo, true)))
    .limit(1);
  if (!row) return { ok: false, errors: { _: ["No encontrada"] } };

  await db
    .update(serviciosTable)
    .set({ activo: !row.activo })
    .where(eq(serviciosTable.id, id));

  revalidarCatalogoServicios();
  return { ok: true, id };
}
