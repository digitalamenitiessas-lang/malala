import { and, asc, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client/postgres";
import {
  servicios as serviciosTable,
  servicioSucursal as servicioSucursalTable,
} from "@/lib/db/schema";
import { getActiveSucursalForUser, requireUser } from "@/lib/auth/session";
import { servicioSchema } from "@/lib/validations/servicio";
import { esCodigoDuplicado, revalidarCatalogoServicios } from "./_helpers";
import type { Servicio } from "@/lib/types";

const CODIGO_REPETIDO = {
  ok: false as const,
  errors: { codigo: ["Ese código ya lo usa otro servicio"] },
};

function createId() {
  return crypto.randomUUID();
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
    visible_reserva: row.visibleReserva,
    duracion_min: row.duracionMin ?? undefined,
    descripcion_corta: row.descripcionCorta ?? undefined,
    destacado_pct: row.destacadoPct ?? undefined,
    es_promo: row.esPromo,
    vence_el: row.venceEl ?? undefined,
  };
}

export async function listServicios(opts?: {
  incluirInactivos?: boolean;
  /** Si se pasa, solo servicios habilitados en esa sucursal (membresía). */
  sucursalId?: string;
  /** Búsqueda por nombre o por código de planilla ("PEL100"). */
  q?: string;
}): Promise<Servicio[]> {
  const db = getDb();
  // Las promociones también son filas de `servicios` (es_promo=true) pero se
  // gestionan en su propio catálogo; acá se excluyen.
  const filtros = [eq(serviciosTable.esPromo, false)];
  if (!opts?.incluirInactivos) filtros.push(eq(serviciosTable.activo, true));
  if (opts?.q) {
    const patron = `%${opts.q}%`;
    filtros.push(
      or(ilike(serviciosTable.nombre, patron), ilike(serviciosTable.codigo, patron))!,
    );
  }

  const rows = await db
    .select()
    .from(serviciosTable)
    .where(and(...filtros))
    .orderBy(asc(serviciosTable.rubro), asc(serviciosTable.nombre));

  if (opts?.sucursalId) {
    const miembros = await db
      .select({ servicioId: servicioSucursalTable.servicioId })
      .from(servicioSucursalTable)
      .where(eq(servicioSucursalTable.sucursalId, opts.sucursalId));
    const habilitados = new Set(miembros.map((m) => m.servicioId));
    return rows.filter((r) => habilitados.has(r.id)).map(mapServicio);
  }

  return rows.map(mapServicio);
}

/**
 * Membresía servicio↔sucursal para todo el catálogo. La usa la reserva pública
 * para mostrar en cada sucursal solo los servicios habilitados ahí.
 */
export async function listServiciosSucursalesAll(): Promise<
  { servicio_id: string; sucursal_id: string }[]
> {
  const db = getDb();
  const rows = await db
    .select({
      servicioId: servicioSucursalTable.servicioId,
      sucursalId: servicioSucursalTable.sucursalId,
    })
    .from(servicioSucursalTable);
  return rows.map((r) => ({
    servicio_id: r.servicioId,
    sucursal_id: r.sucursalId,
  }));
}

/** Rubros ya usados por servicios (no promos), para elegir en el alta/edición. */
export async function listRubrosServicios(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ rubro: serviciosTable.rubro })
    .from(serviciosTable)
    .where(eq(serviciosTable.esPromo, false))
    .orderBy(asc(serviciosTable.rubro));
  return rows.map((r) => r.rubro).filter((r): r is string => Boolean(r));
}

export interface CodigoSugerido {
  rubro: string;
  /** El último que usaron en ese rubro, para que se vea de dónde sale. */
  ultimo: string;
  /** El siguiente libre, respetando el formato y salteando los ocupados. */
  siguiente: string;
}

const FORMATO_CODIGO = /^([A-Za-z]+)(\d+)$/;

/**
 * Último código usado en cada rubro y cuál sigue.
 *
 * El salón numera con letras de familia + dígitos (PEL, NAI, CEP, FAC…), y
 * dentro de cada familia usa un bloque por rubro: los cortes van por PEL100,
 * los lavados por PEL200, los adicionales por PEL700. Por eso la sugerencia va
 * POR RUBRO y no como un único "último código": lo que sigue después de PEL705
 * no sirve para dar de alta un corte.
 *
 * Cuando un rubro tiene códigos de familias distintas gana la más usada, que es
 * la que la persona va a querer continuar.
 */
export async function getCodigosSugeridos(): Promise<CodigoSugerido[]> {
  const db = getDb();
  const rows = await db
    .select({ rubro: serviciosTable.rubro, codigo: serviciosTable.codigo })
    .from(serviciosTable);

  const ocupados = new Set(
    rows.map((r) => r.codigo?.trim().toUpperCase()).filter(Boolean) as string[],
  );

  // rubro -> prefijo -> { cantidad, mayor, ancho }
  const porRubro = new Map<
    string,
    Map<string, { cantidad: number; mayor: number; ancho: number }>
  >();

  for (const row of rows) {
    const codigo = row.codigo?.trim().toUpperCase();
    if (!codigo || !row.rubro) continue;
    const m = FORMATO_CODIGO.exec(codigo);
    if (!m) continue;
    const [, prefijo, digitos] = m;
    const familias = porRubro.get(row.rubro) ?? new Map();
    const actual = familias.get(prefijo) ?? { cantidad: 0, mayor: -1, ancho: digitos.length };
    actual.cantidad += 1;
    actual.mayor = Math.max(actual.mayor, Number(digitos));
    actual.ancho = Math.max(actual.ancho, digitos.length);
    familias.set(prefijo, actual);
    porRubro.set(row.rubro, familias);
  }

  const salida: CodigoSugerido[] = [];
  for (const [rubro, familias] of porRubro) {
    // La familia dominante del rubro; a igualdad, la de número más alto.
    const [prefijo, datos] = [...familias].sort(
      (a, b) => b[1].cantidad - a[1].cantidad || b[1].mayor - a[1].mayor,
    )[0];

    const arma = (n: number) => `${prefijo}${String(n).padStart(datos.ancho, "0")}`;
    let n = datos.mayor + 1;
    // Saltea los que ya existen en otro rubro de la misma familia.
    while (ocupados.has(arma(n))) n += 1;

    salida.push({ rubro, ultimo: arma(datos.mayor), siguiente: arma(n) });
  }

  return salida.sort((a, b) => a.rubro.localeCompare(b.rubro));
}

export async function getServicio(servicioId: string): Promise<Servicio | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(serviciosTable)
    .where(eq(serviciosTable.id, servicioId))
    .limit(1);
  return row ? mapServicio(row) : null;
}

export type ActionResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string[]> };

function fieldErrors(err: unknown): Record<string, string[]> {
  if (err && typeof err === "object" && "issues" in err) {
    const issues = (
      err as { issues: { path: (string | number)[]; message: string }[] }
    ).issues;
    const out: Record<string, string[]> = {};
    for (const issue of issues) {
      const key = issue.path.join(".") || "_";
      (out[key] ??= []).push(issue.message);
    }
    return out;
  }
  return { _: ["Error desconocido"] };
}

function parse(formData: FormData) {
  return servicioSchema.safeParse({
    rubro: formData.get("rubro"),
    nombre: formData.get("nombre"),
    codigo: formData.get("codigo"),
    precio_lista: formData.get("precio_lista"),
    precio_efectivo: formData.get("precio_efectivo"),
    duracion_min: formData.get("duracion_min"),
    activo: formData.get("activo") === "on" || formData.get("activo") === "true",
    visible_reserva:
      formData.get("visible_reserva") === "on" ||
      formData.get("visible_reserva") === "true",
  });
}

export async function createServicio(formData: FormData): Promise<ActionResult> {
  "use server";
  const user = await requireUser();
  if (user.rol !== "admin") {
    return { ok: false, errors: { _: ["Solo admin puede crear servicios"] } };
  }

  const parsed = parse(formData);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const db = getDb();
  const servicioId = createId();
  try {
    await db.insert(serviciosTable).values({
      id: servicioId,
      rubro: parsed.data.rubro,
      nombre: parsed.data.nombre,
      codigo: parsed.data.codigo ?? null,
      precioLista: parsed.data.precio_lista,
      precioEfectivo: parsed.data.precio_efectivo,
      comisionDefaultPct: 0, // la comisión la define el % del empleado
      duracionMin: parsed.data.duracion_min,
      activo: parsed.data.activo,
      visibleReserva: parsed.data.visible_reserva,
    });
  } catch (err) {
    if (esCodigoDuplicado(err)) return CODIGO_REPETIDO;
    throw err;
  }

  // Membresía: el servicio queda habilitado en la sucursal activa del admin.
  const sucursalActiva = await getActiveSucursalForUser(user);
  if (sucursalActiva) {
    await db.insert(servicioSucursalTable).values({
      id: createId(),
      servicioId,
      sucursalId: sucursalActiva.id,
    });
  }

  revalidarCatalogoServicios();
  return { ok: true };
}

export async function updateServicio(
  servicioId: string,
  formData: FormData,
): Promise<ActionResult> {
  "use server";
  const user = await requireUser();
  if (user.rol !== "admin") {
    return { ok: false, errors: { _: ["Solo admin puede editar servicios"] } };
  }

  const parsed = parse(formData);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: serviciosTable.id })
    .from(serviciosTable)
    .where(eq(serviciosTable.id, servicioId))
    .limit(1);
  if (!existing) {
    return { ok: false, errors: { _: ["Servicio no encontrado"] } };
  }

  try {
    await db
      .update(serviciosTable)
      .set({
        rubro: parsed.data.rubro,
        nombre: parsed.data.nombre,
        codigo: parsed.data.codigo ?? null,
        precioLista: parsed.data.precio_lista,
        precioEfectivo: parsed.data.precio_efectivo,
        // comisionDefaultPct ya no se gestiona desde el servicio.
        duracionMin: parsed.data.duracion_min,
        activo: parsed.data.activo,
        visibleReserva: parsed.data.visible_reserva,
      })
      .where(eq(serviciosTable.id, servicioId));
  } catch (err) {
    if (esCodigoDuplicado(err)) return CODIGO_REPETIDO;
    throw err;
  }

  revalidarCatalogoServicios();
  return { ok: true };
}

export async function toggleServicioActivo(
  servicioId: string,
): Promise<ActionResult> {
  "use server";
  const user = await requireUser();
  if (user.rol !== "admin") {
    return { ok: false, errors: { _: ["Solo admin"] } };
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(serviciosTable)
    .where(eq(serviciosTable.id, servicioId))
    .limit(1);
  if (!row) return { ok: false, errors: { _: ["No encontrado"] } };

  await db
    .update(serviciosTable)
    .set({ activo: !row.activo })
    .where(eq(serviciosTable.id, servicioId));

  revalidarCatalogoServicios();
  return { ok: true };
}
