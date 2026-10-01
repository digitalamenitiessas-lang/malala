import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { buildAccessScope, isSucursalAllowed, esAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client/postgres";
import {
  empleados as empleadosTable,
  profesionalesAgenda as profesionalesAgendaTable,
  profesionalesHorarios as profesionalesHorariosTable,
  sucursales as sucursalesTable,
} from "@/lib/db/schema";
import type { ProfesionalAgenda, ProfesionalHorario } from "@/lib/types";

function createId() {
  return crypto.randomUUID();
}

function mapProfesionalHorario(
  row: typeof profesionalesHorariosTable.$inferSelect,
): ProfesionalHorario {
  return {
    id: row.id,
    empleado_id: row.empleadoId,
    sucursal_id: row.sucursalId,
    dia_semana: row.diaSemana,
    apertura: row.apertura,
    cierre: row.cierre,
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

export async function listProfesionalHorarios(
  empleadoId: string,
  sucursalId: string,
): Promise<ProfesionalHorario[]> {
  const db = getDb();
  try {
    const rows = await db
      .select()
      .from(profesionalesHorariosTable)
      .where(
        and(
          eq(profesionalesHorariosTable.empleadoId, empleadoId),
          eq(profesionalesHorariosTable.sucursalId, sucursalId),
        ),
      )
      .orderBy(
        asc(profesionalesHorariosTable.diaSemana),
        asc(profesionalesHorariosTable.apertura),
      );
    return rows.map(mapProfesionalHorario);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function listProfesionalesHorariosBySucursal(
  sucursalId: string,
): Promise<ProfesionalHorario[]> {
  const db = getDb();
  try {
    const rows = await db
      .select()
      .from(profesionalesHorariosTable)
      .where(eq(profesionalesHorariosTable.sucursalId, sucursalId))
      .orderBy(
        asc(profesionalesHorariosTable.empleadoId),
        asc(profesionalesHorariosTable.diaSemana),
        asc(profesionalesHorariosTable.apertura),
      );
    return rows.map(mapProfesionalHorario);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function listProfesionalesHorariosAll(): Promise<ProfesionalHorario[]> {
  const db = getDb();
  try {
    const rows = await db.select().from(profesionalesHorariosTable);
    return rows.map(mapProfesionalHorario);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export interface ProfesionalAgendaConfig extends ProfesionalAgenda {
  empleado_nombre: string;
  sucursal_nombre: string;
}

function mapAgendaConfigRow(row: {
  agenda: typeof profesionalesAgendaTable.$inferSelect;
  empleadoNombre: string;
  sucursalNombre: string;
}): ProfesionalAgendaConfig {
  return {
    id: row.agenda.id,
    empleado_id: row.agenda.empleadoId,
    sucursal_id: row.agenda.sucursalId,
    especialidad: row.agenda.especialidad,
    avatar_url: row.agenda.avatarUrl,
    color: row.agenda.color,
    bio: row.agenda.bio ?? undefined,
    prioridad: row.agenda.prioridad,
    activo_publico: row.agenda.activoPublico,
    empleado_nombre: row.empleadoNombre,
    sucursal_nombre: row.sucursalNombre,
  };
}

export async function listProfesionalAgendaConfigsByEmpleado(
  empleadoId: string,
  opts?: { sucursalIds?: string[] },
): Promise<ProfesionalAgendaConfig[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const sucursalIds = opts?.sucursalIds?.length
    ? opts.sucursalIds.filter((id) => scope.sucursalIdsPermitidas.includes(id))
    : scope.sucursalIdsPermitidas;

  if (!scope.puedeVerGlobal && sucursalIds.length === 0) return [];

  const db = getDb();
  const rows = await db
    .select({
      agenda: profesionalesAgendaTable,
      empleadoNombre: empleadosTable.nombre,
      sucursalNombre: sucursalesTable.nombre,
    })
    .from(profesionalesAgendaTable)
    .innerJoin(
      empleadosTable,
      eq(profesionalesAgendaTable.empleadoId, empleadosTable.id),
    )
    .innerJoin(
      sucursalesTable,
      eq(profesionalesAgendaTable.sucursalId, sucursalesTable.id),
    )
    .where(
      and(
        eq(profesionalesAgendaTable.empleadoId, empleadoId),
        !scope.puedeVerGlobal || sucursalIds.length > 0
          ? inArray(profesionalesAgendaTable.sucursalId, sucursalIds)
          : undefined,
      ),
    )
    .orderBy(
      asc(sucursalesTable.nombre),
      asc(profesionalesAgendaTable.prioridad),
      asc(profesionalesAgendaTable.especialidad),
    );

  return rows.map(mapAgendaConfigRow);
}

export async function getProfesionalAgendaConfig(
  agendaId: string,
): Promise<ProfesionalAgendaConfig | null> {
  const db = getDb();
  const [row] = await db
    .select({
      agenda: profesionalesAgendaTable,
      empleadoNombre: empleadosTable.nombre,
      sucursalNombre: sucursalesTable.nombre,
    })
    .from(profesionalesAgendaTable)
    .innerJoin(
      empleadosTable,
      eq(profesionalesAgendaTable.empleadoId, empleadosTable.id),
    )
    .innerJoin(
      sucursalesTable,
      eq(profesionalesAgendaTable.sucursalId, sucursalesTable.id),
    )
    .where(eq(profesionalesAgendaTable.id, agendaId))
    .limit(1);

  if (!row) return null;

  return mapAgendaConfigRow(row);
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

async function requireAgendaAccess(agendaId: string) {
  const user = await requireUser();
  if (!esAdmin(user.rol) && user.rol !== "encargada") {
    return { user, agenda: null, error: "No autorizado" };
  }

  const agenda = await getProfesionalAgendaConfig(agendaId);
  if (!agenda) {
    return { user, agenda: null, error: "Profesional no encontrado" };
  }

  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, agenda.sucursal_id)) {
    return { user, agenda: null, error: "No tienes acceso a esa sucursal" };
  }

  return { user, agenda, error: null };
}

export async function addProfesionalHorario(
  agendaId: string,
  formData: FormData,
): Promise<ActionResult> {
  "use server";
  const { agenda, error } = await requireAgendaAccess(agendaId);
  if (error || !agenda) {
    return { ok: false, errors: { _: [error ?? "No autorizado"] } };
  }

  const diaSemana = Number(formData.get("dia_semana"));
  const apertura = String(formData.get("apertura") ?? "");
  const cierre = String(formData.get("cierre") ?? "");

  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
    return { ok: false, errors: { dia_semana: ["Dia invalido"] } };
  }
  if (!HHMM.test(apertura) || !HHMM.test(cierre)) {
    return { ok: false, errors: { _: ["Horario invalido (usa HH:MM)"] } };
  }
  if (cierre <= apertura) {
    return {
      ok: false,
      errors: { _: ["El cierre debe ser posterior a la apertura"] },
    };
  }

  const db = getDb();
  await db.insert(profesionalesHorariosTable).values({
    id: createId(),
    empleadoId: agenda.empleado_id,
    sucursalId: agenda.sucursal_id,
    diaSemana,
    apertura,
    cierre,
  });

  revalidatePath(`/turnos/profesionales/${agendaId}`);
  revalidatePath("/turnos");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteProfesionalHorario(
  agendaId: string,
  horarioId: string,
): Promise<ActionResult> {
  "use server";
  const { agenda, error } = await requireAgendaAccess(agendaId);
  if (error || !agenda) {
    return { ok: false, errors: { _: [error ?? "No autorizado"] } };
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(profesionalesHorariosTable)
    .where(eq(profesionalesHorariosTable.id, horarioId))
    .limit(1);
  if (!row) return { ok: false, errors: { _: ["Franja no encontrada"] } };

  if (
    row.empleadoId !== agenda.empleado_id ||
    row.sucursalId !== agenda.sucursal_id
  ) {
    return { ok: false, errors: { _: ["La franja no corresponde a este profesional"] } };
  }

  await db
    .delete(profesionalesHorariosTable)
    .where(eq(profesionalesHorariosTable.id, horarioId));

  revalidatePath(`/turnos/profesionales/${agendaId}`);
  revalidatePath("/turnos");
  revalidatePath("/");
  return { ok: true };
}
