/**
 * Helpers compartidos por la capa de datos.
 */
import { requireUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import type { Rol, Usuario } from "@/lib/types";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; errors: Record<string, string[]>; message?: string };

export function fieldErrors(err: unknown): Record<string, string[]> {
  if (err && typeof err === "object" && "issues" in err) {
    const issues = (
      err as { issues: { path: (string | number)[]; message: string }[] }
    ).issues;
    const out: Record<string, string[]> = {};
    for (const i of issues) {
      const key = i.path.join(".") || "_";
      (out[key] ??= []).push(i.message);
    }
    return out;
  }
  return { _: ["Error desconocido"] };
}

export function failure(msg: string): ActionResult {
  return { ok: false, errors: { _: [msg] }, message: msg };
}

export function success(message?: string): ActionResult {
  return message ? { ok: true, message } : { ok: true };
}

/**
 * Postgres tira 23505 (unique_violation) cuando se repite un código de planilla
 * (ver los índices de drizzle/0026_codigos_unicos.sql). Sin esto, escribir un
 * código que ya existe reventaba el server action con una excepción cruda en vez
 * de marcar el campo en el formulario.
 *
 * OJO CON EL `cause`: drizzle 0.45 no propaga el error de postgres tal cual, lo
 * envuelve en un DrizzleQueryError y deja el PostgresError —el único que tiene
 * `code` y `constraint_name`— colgado de `.cause`. Mirar sólo el error de arriba
 * devolvía siempre false y esta función no servía para nada. Se recorre la
 * cadena para no depender de cuántas capas envuelva la versión de turno.
 */
export function esCodigoDuplicado(err: unknown): boolean {
  let actual: unknown = err;
  for (let nivel = 0; nivel < 5 && actual; nivel++) {
    if (typeof actual !== "object") return false;
    const e = actual as {
      code?: unknown;
      constraint_name?: unknown;
      detail?: unknown;
      cause?: unknown;
    };
    if (
      e.code === "23505" &&
      /codigo/i.test(`${e.constraint_name ?? ""} ${e.detail ?? ""}`)
    ) {
      return true;
    }
    actual = e.cause;
  }
  return false;
}

export async function requireRole(roles: Rol[]): Promise<Usuario> {
  const user = await requireUser();
  // superadmin es superset de admin: si el endpoint permite admin, también permite superadmin
  const efectivos: Rol[] = roles.includes("admin")
    ? ([...roles, "superadmin"] as Rol[])
    : roles;
  if (!efectivos.includes(user.rol)) {
    throw new Error(`Permiso denegado. Se requiere: ${roles.join(", ")}`);
  }
  return user;
}

export function normPhone(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  // Convertir a E.164 si parece argentino sin código país (heurística simple)
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  // Si arranca con 0 o 15, asumir Argentina
  if (/^\d{8,}$/.test(digits)) return `+549${digits.replace(/^0|^15/, "")}`;
  return digits;
}

export function s(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const t = input.trim();
  return t || undefined;
}

/**
 * Revalida todas las pantallas que muestran el catálogo de servicios.
 *
 * Existe porque el bug es silencioso y se repite: se edita el precio de un
 * servicio, se ve bien en Catálogos, y la pantalla de venta sigue ofreciendo
 * el precio viejo porque nadie revalidó esa ruta. Como no falla nada, se
 * factura mal sin que salte ningún error.
 *
 * Las promociones entran acá porque son servicios con otra etiqueta
 * (`es_promo`), así que las mismas pantallas las leen.
 */
export function revalidarCatalogoServicios() {
  revalidatePath("/catalogos/servicios");
  // El alta sugiere el siguiente código libre: sin revalidarla, después de
  // crear un servicio seguiría proponiendo el mismo y chocaría por repetido.
  revalidatePath("/catalogos/servicios/nuevo");
  revalidatePath("/catalogos/promociones");
  revalidatePath("/catalogos");
  revalidatePath("/ventas/nueva");
  revalidatePath("/turnos");
  // La landing pública: ahí se reserva online y se muestran precios.
  revalidatePath("/");
}
