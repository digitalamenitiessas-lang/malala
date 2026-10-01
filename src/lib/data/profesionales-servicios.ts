"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { buildAccessScope, isSucursalAllowed, esAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client/postgres";
import {
  profesionalesServicios as profesionalesServiciosTable,
  servicios as serviciosTable,
  servicioSucursal as servicioSucursalTable,
} from "@/lib/db/schema";
import type { ProfesionalServicio, Servicio } from "@/lib/types";
import { getProfesionalAgendaConfig } from "./profesionales-horarios";

function createId() {
  return crypto.randomUUID();
}

function mapProfesionalServicio(
  row: typeof profesionalesServiciosTable.$inferSelect,
): ProfesionalServicio {
  return {
    id: row.id,
    empleado_id: row.empleadoId,
    sucursal_id: row.sucursalId,
    servicio_id: row.servicioId,
  };
}

export type ActionResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string[]> };

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  );
}

export async function listProfesionalServicios(
  empleadoId: string,
  sucursalId: string,
): Promise<ProfesionalServicio[]> {
  const db = getDb();
  try {
    const rows = await db
      .select()
      .from(profesionalesServiciosTable)
      .where(
        and(
          eq(profesionalesServiciosTable.empleadoId, empleadoId),
          eq(profesionalesServiciosTable.sucursalId, sucursalId),
        ),
      )
      .orderBy(asc(profesionalesServiciosTable.servicioId));
    return rows.map(mapProfesionalServicio);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function listProfesionalesServiciosBySucursal(
  sucursalId: string,
): Promise<ProfesionalServicio[]> {
  const db = getDb();
  try {
    const rows = await db
      .select()
      .from(profesionalesServiciosTable)
      .where(eq(profesionalesServiciosTable.sucursalId, sucursalId))
      .orderBy(
        asc(profesionalesServiciosTable.empleadoId),
        asc(profesionalesServiciosTable.servicioId),
      );
    return rows.map(mapProfesionalServicio);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function listProfesionalesServiciosAll(): Promise<
  ProfesionalServicio[]
> {
  const db = getDb();
  try {
    const rows = await db.select().from(profesionalesServiciosTable);
    return rows.map(mapProfesionalServicio);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function listServiciosPublicosElegibles(
  sucursalId?: string,
): Promise<Servicio[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(serviciosTable)
    .where(and(eq(serviciosTable.activo, true), eq(serviciosTable.esPromo, false)))
    .orderBy(asc(serviciosTable.rubro), asc(serviciosTable.nombre));

  // Membresía por sucursal: un profesional solo puede hacer servicios
  // habilitados en su sucursal. Sin sucursalId se devuelven todos (compat).
  let visibles = rows;
  if (sucursalId) {
    const miembros = await db
      .select({ servicioId: servicioSucursalTable.servicioId })
      .from(servicioSucursalTable)
      .where(eq(servicioSucursalTable.sucursalId, sucursalId));
    const habilitados = new Set(miembros.map((m) => m.servicioId));
    visibles = rows.filter((row) => habilitados.has(row.id));
  }

  return visibles.map((row) => ({
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
  }));
}

async function requireAgendaAccess(agendaId: string) {
  const user = await requireUser();
  if (!esAdmin(user.rol) && user.rol !== "encargada") {
    return { agenda: null, error: "No autorizado" };
  }

  const agenda = await getProfesionalAgendaConfig(agendaId);
  if (!agenda) {
    return { agenda: null, error: "Profesional no encontrado" };
  }

  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, agenda.sucursal_id)) {
    return { agenda: null, error: "No tienes acceso a esa sucursal" };
  }

  return { agenda, error: null };
}

export async function replaceProfesionalServicios(
  agendaId: string,
  formData: FormData,
): Promise<ActionResult> {
  "use server";
  const { agenda, error } = await requireAgendaAccess(agendaId);
  if (error || !agenda) {
    return { ok: false, errors: { _: [error ?? "No autorizado"] } };
  }

  const servicioIds = Array.from(
    new Set(formData.getAll("servicio_id").map(String).filter(Boolean)),
  );

  const db = getDb();
  const serviciosValidos = servicioIds.length
    ? await db
        .select({ id: serviciosTable.id })
        .from(serviciosTable)
        .where(
          and(
            inArray(serviciosTable.id, servicioIds),
            eq(serviciosTable.activo, true),
            eq(serviciosTable.esPromo, false),
          ),
        )
    : [];

  if (serviciosValidos.length !== servicioIds.length) {
    return {
      ok: false,
      errors: { servicio_id: ["Hay servicios inválidos en la selección"] },
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(profesionalesServiciosTable)
      .where(
        and(
          eq(profesionalesServiciosTable.empleadoId, agenda.empleado_id),
          eq(profesionalesServiciosTable.sucursalId, agenda.sucursal_id),
        ),
      );

    if (servicioIds.length > 0) {
      await tx.insert(profesionalesServiciosTable).values(
        servicioIds.map((servicioId) => ({
          id: createId(),
          empleadoId: agenda.empleado_id,
          sucursalId: agenda.sucursal_id,
          servicioId,
        })),
      );
    }
  });

  revalidatePath(`/turnos/profesionales/${agendaId}`);
  revalidatePath("/turnos");
  revalidatePath("/catalogos/empleados");
  revalidatePath("/");
  return { ok: true };
}
