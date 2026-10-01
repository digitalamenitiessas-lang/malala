import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { serviciosHorarios as serviciosHorariosTable } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import type { ServicioHorario } from "@/lib/types";
import { esAdmin } from "@/lib/auth/access";

function createId() {
  return crypto.randomUUID();
}

function mapHorario(
  row: typeof serviciosHorariosTable.$inferSelect,
): ServicioHorario {
  return {
    id: row.id,
    servicio_id: row.servicioId,
    dia_semana: row.diaSemana,
    apertura: row.apertura,
    cierre: row.cierre,
  };
}

export type ActionResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string[]> };

/**
 * Si la tabla `servicios_horarios` todavía no fue migrada, las lecturas
 * degradan a "sin restricción" (lista vacía) en vez de romper la agenda y la
 * reserva. Cualquier otro error se vuelve a lanzar.
 */
function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  );
}

/** Lista las franjas de disponibilidad de un servicio (vacío = sin restricción). */
export async function listServicioHorarios(
  servicioId: string,
): Promise<ServicioHorario[]> {
  const db = getDb();
  try {
    const rows = await db
      .select()
      .from(serviciosHorariosTable)
      .where(eq(serviciosHorariosTable.servicioId, servicioId))
      .orderBy(
        asc(serviciosHorariosTable.diaSemana),
        asc(serviciosHorariosTable.apertura),
      );
    return rows.map(mapHorario);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

/** Lista todas las franjas de varios servicios (para el motor de slots). */
export async function listServiciosHorariosAll(): Promise<ServicioHorario[]> {
  const db = getDb();
  try {
    const rows = await db.select().from(serviciosHorariosTable);
    return rows.map(mapHorario);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function addServicioHorario(
  servicioId: string,
  formData: FormData,
): Promise<ActionResult> {
  "use server";
  const user = await requireUser();
  if (!esAdmin(user.rol) && user.rol !== "encargada") {
    return { ok: false, errors: { _: ["No autorizado"] } };
  }

  const diaSemana = Number(formData.get("dia_semana"));
  const apertura = String(formData.get("apertura") ?? "");
  const cierre = String(formData.get("cierre") ?? "");

  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
    return { ok: false, errors: { dia_semana: ["Día inválido"] } };
  }
  if (!HHMM.test(apertura) || !HHMM.test(cierre)) {
    return { ok: false, errors: { _: ["Horario inválido (usá HH:MM)"] } };
  }
  if (cierre <= apertura) {
    return {
      ok: false,
      errors: { _: ["El cierre debe ser posterior a la apertura"] },
    };
  }

  const db = getDb();
  await db.insert(serviciosHorariosTable).values({
    id: createId(),
    servicioId,
    diaSemana,
    apertura,
    cierre,
  });

  revalidatePath(`/catalogos/servicios/${servicioId}`);
  return { ok: true };
}

export async function deleteServicioHorario(
  horarioId: string,
): Promise<ActionResult> {
  "use server";
  const user = await requireUser();
  if (!esAdmin(user.rol) && user.rol !== "encargada") {
    return { ok: false, errors: { _: ["No autorizado"] } };
  }

  const db = getDb();
  const [row] = await db
    .select({ servicioId: serviciosHorariosTable.servicioId })
    .from(serviciosHorariosTable)
    .where(eq(serviciosHorariosTable.id, horarioId))
    .limit(1);
  if (!row) return { ok: false, errors: { _: ["No encontrado"] } };

  await db
    .delete(serviciosHorariosTable)
    .where(eq(serviciosHorariosTable.id, horarioId));

  revalidatePath(`/catalogos/servicios/${row.servicioId}`);
  return { ok: true };
}
