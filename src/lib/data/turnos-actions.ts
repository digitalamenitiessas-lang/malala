"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { RESERVAS_PROPIAS } from "@/lib/features";
import { getDb } from "@/lib/db/client/postgres";
import {
  clientes as clientesTable,
  empleados as empleadosTable,
  horariosSucursal as horariosSucursalTable,
  profesionalesAgenda as profesionalesAgendaTable,
  servicios as serviciosTable,
  turnoEventos as turnoEventosTable,
  turnos as turnosTable,
} from "@/lib/db/schema";
import { failure, fieldErrors, requireRole, type ActionResult } from "./_helpers";
import { buildAccessScope } from "@/lib/auth/access";
import { buildAvailableSlots, type ProfesionalReserva } from "@/lib/turnos-helpers";
import { listServiciosHorariosAll } from "@/lib/data/servicios-horarios";
import { listProfesionalesHorariosBySucursal } from "@/lib/data/profesionales-horarios";
import { listProfesionalesServiciosBySucursal } from "@/lib/data/profesionales-servicios";
import {
  turnoCreateSchema,
  turnoEstadoSchema,
  turnoReprogramacionSchema,
} from "@/lib/validations/turno";
import { normalizarTelefonoAR, PhoneNormalizationError } from "@/lib/phone";
import { notificarTurno } from "@/lib/integraciones/notificaciones-turno";
import { notificarTurnoEmpleadoPush } from "@/lib/integraciones/push";
import {
  getTurnoCatalogRefs,
  mapEmpleado,
  mapHorario,
  mapProfesionalAgendaRow,
  mapServicio,
  mapTurno,
  type TurnoActionState,
} from "./turnos";

function createId() {
  return crypto.randomUUID();
}

function createToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function tokenExpiraEnDate(fechaTurno: string, hora: string): Date {
  return new Date(`${fechaTurno}T${hora}:00-03:00`);
}

function turnoFailure(message: string): TurnoActionState {
  return { ok: false, errors: { _: [message] } };
}

function buildCreatePayload(formData: FormData) {
  return {
    sucursal_id: formData.get("sucursal_id"),
    servicio_id: formData.get("servicio_id"),
    profesional_id: formData.get("profesional_id"),
    fecha_turno: formData.get("fecha_turno"),
    hora: formData.get("hora"),
    cliente_nombre: formData.get("cliente_nombre"),
    cliente_telefono: formData.get("cliente_telefono"),
    cliente_email: formData.get("cliente_email") ?? undefined,
    observacion: formData.get("observacion") ?? undefined,
    sin_preferencia:
      formData.get("sin_preferencia") === "true" ||
      formData.get("sin_preferencia") === "on",
    canal: formData.get("canal") ?? "web",
    origen: formData.get("origen") ?? "publico",
  };
}

async function createTurnoInternal(
  formData: FormData,
  access: "publico" | "interno",
): Promise<TurnoActionState> {
  const parsed = turnoCreateSchema.safeParse(buildCreatePayload(formData));
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  let telefonoE164: string;
  try {
    telefonoE164 = normalizarTelefonoAR(parsed.data.cliente_telefono);
  } catch (err) {
    const message =
      err instanceof PhoneNormalizationError
        ? err.message
        : "Teléfono inválido";
    return { ok: false, errors: { cliente_telefono: [message] } };
  }

  const actor = access === "interno" ? await requireRole(["admin", "encargada"]) : null;
  const actorScope = actor ? buildAccessScope(actor) : null;

  if (
    actorScope &&
    !actorScope.sucursalIdsPermitidas.includes(parsed.data.sucursal_id)
  ) {
    return turnoFailure("No tienes acceso a esa sucursal");
  }

  const { servicio, profesional } = await getTurnoCatalogRefs({
    servicioId: parsed.data.servicio_id,
    profesionalId: parsed.data.profesional_id,
    sucursalId: parsed.data.sucursal_id,
  });

  if (!servicio || !profesional) {
    return turnoFailure("No se pudo validar el turno seleccionado");
  }

  // Las promos no se pueden reservar para una fecha posterior a su vencimiento.
  if (
    servicio.es_promo &&
    servicio.vence_el &&
    parsed.data.fecha_turno > servicio.vence_el
  ) {
    return turnoFailure(
      `La promoción ${servicio.nombre} vence el ${servicio.vence_el}. Elegí una fecha anterior.`,
    );
  }

  const db = getDb();
  const turnoId = createId();
  const tokenAcceso = createToken();
  const tokenExpiraEn = tokenExpiraEnDate(
    parsed.data.fecha_turno,
    parsed.data.hora,
  );
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${parsed.data.sucursal_id}), hashtext(${parsed.data.fecha_turno}))`
      );

      const [
        horariosRows,
        profRows,
        servRows,
        blockedRows,
        profesionalesHorarios,
        profesionalesServicios,
      ] =
        await Promise.all([
        tx
          .select()
          .from(horariosSucursalTable)
          .where(eq(horariosSucursalTable.sucursalId, parsed.data.sucursal_id)),
        tx
          .select({
            meta: profesionalesAgendaTable,
            empleado: empleadosTable,
          })
          .from(profesionalesAgendaTable)
          .innerJoin(
            empleadosTable,
            eq(profesionalesAgendaTable.empleadoId, empleadosTable.id),
          )
          .where(
            and(
              eq(profesionalesAgendaTable.sucursalId, parsed.data.sucursal_id),
              eq(profesionalesAgendaTable.activoPublico, true),
              eq(empleadosTable.activo, true),
            ),
          )
          .orderBy(
            asc(profesionalesAgendaTable.prioridad),
            asc(empleadosTable.nombre),
          ),
        tx.select().from(serviciosTable).where(eq(serviciosTable.activo, true)),
        tx
          .select({ turno: turnosTable, cliente: clientesTable })
          .from(turnosTable)
          .innerJoin(
            clientesTable,
            eq(turnosTable.clienteId, clientesTable.id),
          )
          .where(
            and(
              eq(turnosTable.sucursalId, parsed.data.sucursal_id),
              eq(turnosTable.fechaTurno, parsed.data.fecha_turno),
            ),
          ),
        access === "publico"
          ? listProfesionalesHorariosBySucursal(parsed.data.sucursal_id)
          : Promise.resolve([]),
        access === "publico"
          ? listProfesionalesServiciosBySucursal(parsed.data.sucursal_id)
          : Promise.resolve([]),
      ]);

      const slots = buildAvailableSlots({
        fecha: parsed.data.fecha_turno,
        sucursalId: parsed.data.sucursal_id,
        servicioId: parsed.data.servicio_id,
        profesionalId: parsed.data.profesional_id,
        horarios: horariosRows.map(mapHorario),
        profesionales: profRows.map(
          (row): ProfesionalReserva => ({
            ...mapProfesionalAgendaRow(row.meta),
            empleado: mapEmpleado(row.empleado),
          }),
        ),
        servicios: servRows.map(mapServicio),
        turnos: blockedRows.map((row) => mapTurno(row.turno, row.cliente)),
        serviciosHorarios: await listServiciosHorariosAll(),
        profesionalesHorarios,
        profesionalesServicios,
      });

      const exists = slots.some((slot) => slot.hora === parsed.data.hora);
      if (!exists) {
        throw new Error("Ese horario ya no esta disponible");
      }

      const [clienteExistente] = await tx
        .select()
        .from(clientesTable)
        .where(eq(clientesTable.telefonoE164, telefonoE164))
        .limit(1);

      let clienteId: string;
      if (clienteExistente) {
        clienteId = clienteExistente.id;
        await tx
          .update(clientesTable)
          .set({
            nombre: parsed.data.cliente_nombre,
            telefono: parsed.data.cliente_telefono,
            email: parsed.data.cliente_email ?? clienteExistente.email,
          })
          .where(eq(clientesTable.id, clienteId));
      } else {
        clienteId = createId();
        await tx.insert(clientesTable).values({
          id: clienteId,
          nombre: parsed.data.cliente_nombre,
          telefono: parsed.data.cliente_telefono,
          telefonoE164,
          email: parsed.data.cliente_email ?? null,
          activo: true,
        });
      }

      await tx.insert(turnosTable).values({
        id: turnoId,
        sucursalId: parsed.data.sucursal_id,
        servicioId: parsed.data.servicio_id,
        profesionalId: parsed.data.profesional_id,
        clienteId,
        fechaTurno: parsed.data.fecha_turno,
        hora: parsed.data.hora,
        duracionMin: servicio.duracion_min ?? 60,
        // El turno nace "pendiente" (la reserva ya ES el turno); pasa a
        // "realizado" solo cuando llega su hora (calculado al mostrar).
        estado: "pendiente",
        canal: parsed.data.canal,
        observacion: parsed.data.observacion ?? null,
        creadoEn: now,
        creadoPorUsuarioId: actor?.id ?? null,
        origen: parsed.data.origen,
        sinPreferencia: parsed.data.sin_preferencia,
        tokenAcceso,
        tokenExpiraEn,
      });

      await tx.insert(turnoEventosTable).values({
        id: createId(),
        turnoId,
        tipo: "creado",
        actorUsuarioId: actor?.id ?? null,
        fecha: now,
        detalle:
          access === "publico"
            ? "Reserva creada desde landing"
            : "Turno creado desde agenda",
      });
    });
  } catch (error) {
    if (error instanceof Error) {
      return turnoFailure(error.message);
    }
    return turnoFailure("No se pudo crear el turno");
  }

  await notificarTurno({ turnoId, tipo: "confirmacion" });
  await notificarTurnoEmpleadoPush({ turnoId, tipo: "creado" }).catch(() => {});

  revalidatePath("/");
  revalidatePath("/turnos");
  revalidatePath("/dashboard");

  return {
    ok: true,
    turnoId,
    message:
      access === "publico"
        ? "Tu turno fue reservado. Te esperamos en MALALA."
        : "Turno creado en agenda.",
    fecha_turno: parsed.data.fecha_turno,
    hora: parsed.data.hora,
    servicio_nombre: servicio.nombre,
    profesional_nombre: profesional.empleado.nombre,
  };
}

export async function createPublicTurnoAction(
  _prevState: TurnoActionState | null,
  formData: FormData,
) {
  // Con la reserva propia apagada, una pestaña vieja de la landing todavía
  // podría mandar el formulario: no se crea un turno que nadie va a mirar.
  if (!RESERVAS_PROPIAS) {
    return turnoFailure("La reserva online no está disponible. Reservá por Calendico.");
  }
  return createTurnoInternal(formData, "publico");
}

export async function createAdminTurnoAction(
  _prevState: TurnoActionState | null,
  formData: FormData,
) {
  return createTurnoInternal(formData, "interno");
}

export async function updateTurnoEstadoAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);
  const parsed = turnoEstadoSchema.safeParse({
    turno_id: formData.get("turno_id"),
    estado: formData.get("estado"),
  });

  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(turnosTable)
    .where(eq(turnosTable.id, parsed.data.turno_id))
    .limit(1);

  if (!row) return failure("Turno no encontrado");
  if (!scope.sucursalIdsPermitidas.includes(row.sucursalId)) {
    return failure("No tienes acceso a ese turno");
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(turnosTable)
      .set({
        estado: parsed.data.estado,
        actualizadoEn: now,
        actualizadoPorUsuarioId: user.id,
      })
      .where(eq(turnosTable.id, parsed.data.turno_id));

    await tx.insert(turnoEventosTable).values({
      id: createId(),
      turnoId: parsed.data.turno_id,
      tipo: parsed.data.estado,
      actorUsuarioId: user.id,
      fecha: now,
      detalle: `Estado cambiado a ${parsed.data.estado}`,
    });
  });

  if (parsed.data.estado === "cancelado") {
    await notificarTurno({ turnoId: parsed.data.turno_id, tipo: "cancelacion" });
    await notificarTurnoEmpleadoPush({
      turnoId: parsed.data.turno_id,
      tipo: "cancelado",
    }).catch(() => {});
  }

  revalidatePath("/turnos");
  revalidatePath("/");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function submitUpdateTurnoEstadoAction(
  formData: FormData,
): Promise<void> {
  await updateTurnoEstadoAction(formData);
}

export async function reprogramTurnoAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);
  const parsed = turnoReprogramacionSchema.safeParse({
    turno_id: formData.get("turno_id"),
    fecha_turno: formData.get("fecha_turno"),
    hora: formData.get("hora"),
    profesional_id: formData.get("profesional_id"),
  });

  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const db = getDb();
  const [current] = await db
    .select()
    .from(turnosTable)
    .where(eq(turnosTable.id, parsed.data.turno_id))
    .limit(1);

  if (!current) return failure("Turno no encontrado");
  if (!scope.sucursalIdsPermitidas.includes(current.sucursalId)) {
    return failure("No tienes acceso a ese turno");
  }

  const { profesional } = await getTurnoCatalogRefs({
    servicioId: current.servicioId,
    profesionalId: parsed.data.profesional_id,
    sucursalId: current.sucursalId,
  });
  if (!profesional) {
    return turnoFailure("No se pudo validar el profesional elegido");
  }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${current.sucursalId}), hashtext(${parsed.data.fecha_turno}))`
      );

      const [horariosRows, profRows, servRows, blockedRows] = await Promise.all([
        tx
          .select()
          .from(horariosSucursalTable)
          .where(eq(horariosSucursalTable.sucursalId, current.sucursalId)),
        tx
          .select({
            meta: profesionalesAgendaTable,
            empleado: empleadosTable,
          })
          .from(profesionalesAgendaTable)
          .innerJoin(
            empleadosTable,
            eq(profesionalesAgendaTable.empleadoId, empleadosTable.id),
          )
          .where(
            and(
              eq(profesionalesAgendaTable.sucursalId, current.sucursalId),
              eq(profesionalesAgendaTable.activoPublico, true),
              eq(empleadosTable.activo, true),
            ),
          ),
        tx.select().from(serviciosTable).where(eq(serviciosTable.activo, true)),
        tx
          .select({ turno: turnosTable, cliente: clientesTable })
          .from(turnosTable)
          .innerJoin(
            clientesTable,
            eq(turnosTable.clienteId, clientesTable.id),
          )
          .where(
            and(
              eq(turnosTable.sucursalId, current.sucursalId),
              eq(turnosTable.fechaTurno, parsed.data.fecha_turno),
            ),
          ),
      ]);

      const slots = buildAvailableSlots({
        fecha: parsed.data.fecha_turno,
        sucursalId: current.sucursalId,
        servicioId: current.servicioId,
        profesionalId: parsed.data.profesional_id,
        horarios: horariosRows.map(mapHorario),
        profesionales: profRows.map(
          (row): ProfesionalReserva => ({
            ...mapProfesionalAgendaRow(row.meta),
            empleado: mapEmpleado(row.empleado),
          }),
        ),
        servicios: servRows.map(mapServicio),
        turnos: blockedRows
          .filter((row) => row.turno.id !== parsed.data.turno_id)
          .map((row) => mapTurno(row.turno, row.cliente)),
        serviciosHorarios: await listServiciosHorariosAll(),
      });

      const available = slots.some((slot) => slot.hora === parsed.data.hora);
      if (!available) {
        throw new Error("Horario no disponible para reprogramar");
      }

      const now = new Date();
      await tx
        .update(turnosTable)
        .set({
          fechaTurno: parsed.data.fecha_turno,
          hora: parsed.data.hora,
          profesionalId: parsed.data.profesional_id,
          estado: "pendiente",
          actualizadoEn: now,
          actualizadoPorUsuarioId: user.id,
          tokenExpiraEn: tokenExpiraEnDate(
            parsed.data.fecha_turno,
            parsed.data.hora,
          ),
          recordatorio2hEnviadoEn: null,
        })
        .where(eq(turnosTable.id, parsed.data.turno_id));

      await tx.insert(turnoEventosTable).values({
        id: createId(),
        turnoId: parsed.data.turno_id,
        tipo: "reprogramado",
        actorUsuarioId: user.id,
        fecha: now,
        detalle: `Reprogramado a ${parsed.data.fecha_turno} ${parsed.data.hora}`,
      });
    });
  } catch (error) {
    if (error instanceof Error) {
      return turnoFailure(error.message);
    }
    return turnoFailure("No se pudo reprogramar el turno");
  }

  await notificarTurno({ turnoId: parsed.data.turno_id, tipo: "reprogramacion" });
  await notificarTurnoEmpleadoPush({
    turnoId: parsed.data.turno_id,
    tipo: "reprogramado",
  }).catch(() => {});

  revalidatePath("/turnos");
  revalidatePath("/");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function submitReprogramTurnoAction(
  formData: FormData,
): Promise<void> {
  await reprogramTurnoAction(formData);
}
