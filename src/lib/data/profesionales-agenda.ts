"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client/postgres";
import { createSupabaseAdminClient } from "@/lib/db/client/supabase-admin";
import {
  empleados as empleadosTable,
  profesionalesAgenda as profesionalesAgendaTable,
} from "@/lib/db/schema";
import { getProfesionalAgendaConfig } from "@/lib/data/profesionales-horarios";
import type { Usuario } from "@/lib/types";

function createId() {
  return crypto.randomUUID();
}

export type ActionResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string[]> };

/** Solo admin/superadmin y encargada gestionan profesionales. */
function puedeGestionar(rol: Usuario["rol"]) {
  return rol === "admin" || rol === "superadmin" || rol === "encargada";
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Habilita a un empleado como profesional reservable en una sucursal: crea su
 * fila en `profesionales_agenda`. Sin esto, el empleado no aparece al reservar
 * online. Aísla por rol y por sucursal.
 */
export async function createProfesionalAgenda(
  empleadoId: string,
  formData: FormData,
): Promise<ActionResult> {
  "use server";
  const user = await requireUser();
  if (!puedeGestionar(user.rol)) {
    return { ok: false, errors: { _: ["No autorizado"] } };
  }

  const sucursalId = String(formData.get("sucursal_id") ?? "");
  const especialidad = String(formData.get("especialidad") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || "#8a9a5b";
  const prioridad = Number(formData.get("prioridad") ?? 0);

  const scope = buildAccessScope(user);
  if (!sucursalId || !isSucursalAllowed(scope, sucursalId)) {
    return { ok: false, errors: { sucursal_id: ["Sucursal inválida"] } };
  }
  if (!especialidad) {
    return { ok: false, errors: { especialidad: ["Indicá la especialidad"] } };
  }
  if (!HEX.test(color)) {
    return { ok: false, errors: { color: ["Color inválido"] } };
  }
  if (!Number.isInteger(prioridad) || prioridad < 0) {
    return { ok: false, errors: { prioridad: ["Prioridad inválida"] } };
  }

  const db = getDb();

  const [empleado] = await db
    .select({ id: empleadosTable.id })
    .from(empleadosTable)
    .where(eq(empleadosTable.id, empleadoId))
    .limit(1);
  if (!empleado) {
    return { ok: false, errors: { _: ["Empleado no encontrado"] } };
  }

  // Una sola agenda por empleado+sucursal.
  const [existente] = await db
    .select({ id: profesionalesAgendaTable.id })
    .from(profesionalesAgendaTable)
    .where(
      and(
        eq(profesionalesAgendaTable.empleadoId, empleadoId),
        eq(profesionalesAgendaTable.sucursalId, sucursalId),
      ),
    )
    .limit(1);
  if (existente) {
    return {
      ok: false,
      errors: { _: ["Este empleado ya está habilitado en esa sucursal"] },
    };
  }

  await db.insert(profesionalesAgendaTable).values({
    id: createId(),
    empleadoId,
    sucursalId,
    especialidad,
    avatarUrl: "",
    color,
    bio: null,
    prioridad,
    activoPublico: true,
  });

  revalidatePath(`/catalogos/empleados/${empleadoId}`);
  revalidatePath("/turnos");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Corrige los datos de una agenda ya creada.
 *
 * Hasta ahora una agenda se creaba y quedaba congelada: especialidad, color y
 * prioridad no se podían tocar nunca más. Un color repetido o una especialidad
 * mal escrita obligaba a pedir que lo arreglen por base. Es de lo primero que
 * una encargada quiere cambiar después de ver la agenda armada.
 *
 * No se puede mover de sucursal ni de empleado: eso no es corregir un dato, es
 * otra agenda.
 */
export async function updateProfesionalAgenda(
  agendaId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!puedeGestionar(user.rol)) {
    return { ok: false, errors: { _: ["No autorizado"] } };
  }

  const especialidad = String(formData.get("especialidad") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const prioridad = Number(formData.get("prioridad") ?? 0);

  if (!especialidad) {
    return { ok: false, errors: { especialidad: ["Indicá la especialidad"] } };
  }
  if (!HEX.test(color)) {
    return { ok: false, errors: { color: ["Color inválido"] } };
  }
  if (!Number.isInteger(prioridad) || prioridad < 0) {
    return { ok: false, errors: { prioridad: ["Prioridad inválida"] } };
  }

  const db = getDb();
  const [agenda] = await db
    .select({
      id: profesionalesAgendaTable.id,
      empleadoId: profesionalesAgendaTable.empleadoId,
      sucursalId: profesionalesAgendaTable.sucursalId,
    })
    .from(profesionalesAgendaTable)
    .where(eq(profesionalesAgendaTable.id, agendaId))
    .limit(1);
  if (!agenda) return { ok: false, errors: { _: ["Agenda no encontrada"] } };

  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, agenda.sucursalId)) {
    return { ok: false, errors: { _: ["No tenés acceso a esa sucursal"] } };
  }

  await db
    .update(profesionalesAgendaTable)
    .set({ especialidad, color, prioridad })
    .where(eq(profesionalesAgendaTable.id, agendaId));

  revalidatePath(`/catalogos/empleados/${agenda.empleadoId}`);
  revalidatePath("/turnos");
  revalidatePath("/");
  return { ok: true };
}

/** Muestra/oculta al profesional en la reserva online (toggle activo_publico). */
export async function toggleProfesionalAgendaActivo(
  agendaId: string,
): Promise<ActionResult> {
  "use server";
  const user = await requireUser();
  if (!puedeGestionar(user.rol)) {
    return { ok: false, errors: { _: ["No autorizado"] } };
  }

  const agenda = await getProfesionalAgendaConfig(agendaId);
  if (!agenda) return { ok: false, errors: { _: ["No encontrado"] } };

  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, agenda.sucursal_id)) {
    return { ok: false, errors: { _: ["No autorizado para esta sucursal"] } };
  }

  const db = getDb();
  await db
    .update(profesionalesAgendaTable)
    .set({ activoPublico: !agenda.activo_publico })
    .where(eq(profesionalesAgendaTable.id, agendaId));

  revalidatePath(`/catalogos/empleados/${agenda.empleado_id}`);
  revalidatePath(`/turnos/profesionales/${agendaId}`);
  revalidatePath("/turnos");
  revalidatePath("/");
  return { ok: true };
}

const AVATAR_BUCKET = "profesionales";
const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4 MB

/** Autoriza por rol + sucursal sobre una agenda existente. */
async function authorizeAgenda(agendaId: string) {
  const user = await requireUser();
  if (!puedeGestionar(user.rol)) {
    return { error: "No autorizado", agenda: null } as const;
  }
  const agenda = await getProfesionalAgendaConfig(agendaId);
  if (!agenda) return { error: "Profesional no encontrado", agenda: null } as const;
  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, agenda.sucursal_id)) {
    return { error: "No autorizado para esta sucursal", agenda: null } as const;
  }
  return { error: null, agenda } as const;
}

/**
 * Sube la foto del profesional a Supabase Storage (bucket público) y guarda la
 * URL en `avatar_url`. Se muestra en la reserva online. Aislado por rol y por
 * sucursal.
 */
export async function setProfesionalAvatar(
  agendaId: string,
  formData: FormData,
): Promise<ActionResult> {
  "use server";
  const { error, agenda } = await authorizeAgenda(agendaId);
  if (error || !agenda) {
    return { ok: false, errors: { _: [error ?? "No autorizado"] } };
  }

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errors: { avatar: ["Elegí una imagen"] } };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, errors: { avatar: ["El archivo debe ser una imagen"] } };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, errors: { avatar: ["La imagen supera los 4 MB"] } };
  }

  const admin = createSupabaseAdminClient();
  // Crea el bucket público si no existe (idempotente; ignora "ya existe").
  await admin.storage
    .createBucket(AVATAR_BUCKET, { public: true })
    .catch(() => undefined);

  const ext =
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  // Path con timestamp para evitar problemas de caché al reemplazar la foto.
  const path = `${agendaId}/${Date.now()}.${ext}`;
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (uploadError) {
    return { ok: false, errors: { _: ["No se pudo subir la imagen"] } };
  }

  const { data } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  const db = getDb();
  await db
    .update(profesionalesAgendaTable)
    .set({ avatarUrl: data.publicUrl })
    .where(eq(profesionalesAgendaTable.id, agendaId));

  revalidatePath(`/turnos/profesionales/${agendaId}`);
  revalidatePath(`/catalogos/empleados/${agenda.empleado_id}`);
  revalidatePath("/");
  return { ok: true };
}

/** Quita la foto del profesional (vuelve a iniciales en la reserva). */
export async function removeProfesionalAvatar(
  agendaId: string,
): Promise<ActionResult> {
  "use server";
  const { error, agenda } = await authorizeAgenda(agendaId);
  if (error || !agenda) {
    return { ok: false, errors: { _: [error ?? "No autorizado"] } };
  }

  const db = getDb();
  await db
    .update(profesionalesAgendaTable)
    .set({ avatarUrl: "" })
    .where(eq(profesionalesAgendaTable.id, agendaId));

  revalidatePath(`/turnos/profesionales/${agendaId}`);
  revalidatePath(`/catalogos/empleados/${agenda.empleado_id}`);
  revalidatePath("/");
  return { ok: true };
}
