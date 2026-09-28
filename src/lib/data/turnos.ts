import { and, asc, eq, gte, lte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client/postgres";
import {
  clientes as clientesTable,
  empleados as empleadosTable,
  horariosSucursal as horariosSucursalTable,
  profesionalesAgenda as profesionalesAgendaTable,
  profesionalesHorarios as profesionalesHorariosTable,
  profesionalesServicios as profesionalesServiciosTable,
  promocionItems as promocionItemsTable,
  servicios as serviciosTable,
  sucursales as sucursalesTable,
  turnos as turnosTable,
} from "@/lib/db/schema";
import type { Cliente } from "@/lib/types";
import {
  buildAccessScope,
  clampSucursalId,
  isSucursalAllowed,
} from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import {
  listServicioHorarios,
  listServiciosHorariosAll,
} from "@/lib/data/servicios-horarios";
import { listServiciosSucursalesAll } from "@/lib/data/servicios";
import { hoyAr } from "@/lib/fecha-ar";
import { normalizeEstado, estadoEfectivo } from "@/lib/turno-estado";
import {
  listProfesionalesHorariosAll,
  listProfesionalesHorariosBySucursal,
} from "@/lib/data/profesionales-horarios";
import {
  listProfesionalesServiciosAll,
  listProfesionalesServiciosBySucursal,
} from "@/lib/data/profesionales-servicios";
import {
  buildAvailableSlots,
  buildTurnoDetalle,
  toTurnoAgenda,
  listOpenDatesForSucursal,
  listReservableDates,
  type ProfesionalReserva,
  type TurnoDetalle,
} from "@/lib/turnos-helpers";
import type {
  Empleado,
  HorarioSucursal,
  ProfesionalAgenda,
  ProfesionalHorario,
  ProfesionalServicio,
  Servicio,
  Sucursal,
  Turno,
  TurnoEstado,
  TurnoAgenda,
  TurnoOcupacion,
} from "@/lib/types";

export function mapSucursal(
  row: typeof sucursalesTable.$inferSelect,
): Sucursal {
  return {
    id: row.id,
    nombre: row.nombre,
    activo: row.activo,
    slug: row.slug ?? undefined,
    direccion: row.direccion ?? undefined,
    telefono: row.telefono ?? undefined,
    horario_resumen: row.horarioResumen ?? undefined,
    rating: row.rating ?? undefined,
    reviews: row.reviews ?? undefined,
    mapa_url: row.mapaUrl ?? undefined,
    descripcion_corta: row.descripcionCorta ?? undefined,
  };
}

export function mapServicio(
  row: typeof serviciosTable.$inferSelect,
): Servicio {
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

export function mapEmpleado(
  row: typeof empleadosTable.$inferSelect,
): Empleado {
  return {
    id: row.id,
    nombre: row.nombre,
    activo: row.activo,
    sucursal_principal_id: row.sucursalPrincipalId,
    tipo_comision: row.tipoComision,
    porcentaje_default: row.porcentajeDefault,
    sueldo_asegurado: row.sueldoAsegurado,
    valor_hora: row.valorHora,
    viatico_por_dia: row.viaticoPorDia,
    horas_por_semana: row.horasPorSemana,
    dias_trabajo: row.diasTrabajo ?? [],
    observacion: row.observacion ?? undefined,
  };
}

export function mapHorario(
  row: typeof horariosSucursalTable.$inferSelect,
): HorarioSucursal {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    dia_semana: row.diaSemana,
    apertura: row.apertura,
    cierre: row.cierre,
  };
}

export function mapProfesionalHorario(
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

export function mapProfesionalAgendaRow(
  row: typeof profesionalesAgendaTable.$inferSelect,
): ProfesionalAgenda {
  return {
    id: row.id,
    empleado_id: row.empleadoId,
    sucursal_id: row.sucursalId,
    especialidad: row.especialidad,
    avatar_url: row.avatarUrl,
    color: row.color,
    bio: row.bio ?? undefined,
    prioridad: row.prioridad,
    activo_publico: row.activoPublico,
  };
}

export function mapProfesionalServicio(
  row: typeof profesionalesServiciosTable.$inferSelect,
): ProfesionalServicio {
  return {
    id: row.id,
    empleado_id: row.empleadoId,
    sucursal_id: row.sucursalId,
    servicio_id: row.servicioId,
  };
}

export function mapCliente(
  row: typeof clientesTable.$inferSelect,
): Cliente {
  return {
    id: row.id,
    nombre: row.nombre,
    telefono: row.telefono ?? undefined,
    telefono_e164: row.telefonoE164 ?? undefined,
    email: row.email ?? undefined,
    observacion: row.observacion ?? undefined,
    activo: row.activo,
    saldo_cc: row.saldoCc,
    cuenta_corriente_habilitada: row.cuentaCorrienteHabilitada,
  };
}

export function mapTurno(
  row: typeof turnosTable.$inferSelect,
  cliente: typeof clientesTable.$inferSelect,
): Turno {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    servicio_id: row.servicioId,
    profesional_id: row.profesionalId,
    cliente_id: row.clienteId,
    cliente_nombre: cliente.nombre,
    cliente_telefono: cliente.telefono ?? cliente.telefonoE164 ?? "",
    cliente_telefono_e164: cliente.telefonoE164 ?? "",
    cliente_email: cliente.email ?? undefined,
    fecha_turno: row.fechaTurno,
    hora: row.hora,
    duracion_min: row.duracionMin,
    estado: normalizeEstado(row.estado),
    canal: row.canal,
    observacion: row.observacion ?? undefined,
    creado_en: row.creadoEn.toISOString(),
    creado_por_usuario_id: row.creadoPorUsuarioId ?? undefined,
    actualizado_en: row.actualizadoEn?.toISOString(),
    actualizado_por_usuario_id: row.actualizadoPorUsuarioId ?? undefined,
    origen: row.origen,
    sin_preferencia: row.sinPreferencia,
    token_acceso: row.tokenAcceso,
    token_expira_en: row.tokenExpiraEn.toISOString(),
    confirmacion_enviada_en: row.confirmacionEnviadaEn?.toISOString(),
    recordatorio_2h_enviado_en: row.recordatorio2hEnviadoEn?.toISOString(),
  };
}

async function getSucursalesActivas(scopeIds?: string[]) {
  const db = getDb();
  const filters = [eq(sucursalesTable.activo, true)];
  if (scopeIds?.length) {
    filters.push(inArray(sucursalesTable.id, scopeIds));
  }
  const rows = await db
    .select()
    .from(sucursalesTable)
    .where(and(...filters))
    .orderBy(asc(sucursalesTable.nombre));
  return rows.map(mapSucursal);
}

async function getServiciosActivos() {
  const db = getDb();
  // Solo los visibles en reserva: los servicios solo-caja (visible_reserva=false,
  // ej. precios internos por largo de pelo) no se muestran ni generan turnos.
  const rows = await db
    .select()
    .from(serviciosTable)
    .where(
      and(
        eq(serviciosTable.activo, true),
        eq(serviciosTable.visibleReserva, true),
      ),
    )
    .orderBy(asc(serviciosTable.rubro), asc(serviciosTable.nombre));
  const servicios = rows.map(mapServicio);

  // Para las promos, adjuntar los nombres de los servicios que combinan
  // (se muestran como descripción en la reserva).
  const promoIds = rows.filter((r) => r.esPromo).map((r) => r.id);
  if (promoIds.length > 0) {
    const items = await db
      .select({
        promoId: promocionItemsTable.promoServicioId,
        servicioId: promocionItemsTable.componenteServicioId,
        nombre: serviciosTable.nombre,
        orden: promocionItemsTable.orden,
      })
      .from(promocionItemsTable)
      .innerJoin(
        serviciosTable,
        eq(promocionItemsTable.componenteServicioId, serviciosTable.id),
      )
      .where(inArray(promocionItemsTable.promoServicioId, promoIds))
      .orderBy(asc(promocionItemsTable.orden));
    const byPromo = new Map<string, string[]>();
    const firstServiceByPromo = new Map<string, string>();
    for (const it of items) {
      const list = byPromo.get(it.promoId) ?? [];
      list.push(it.nombre);
      byPromo.set(it.promoId, list);
      if (!firstServiceByPromo.has(it.promoId)) {
        firstServiceByPromo.set(it.promoId, it.servicioId);
      }
    }
    for (const s of servicios) {
      const comp = byPromo.get(s.id);
      if (comp) s.promo_componentes = comp;
      const first = firstServiceByPromo.get(s.id);
      if (first) s.promo_primer_servicio_id = first;
    }
  }

  return servicios;
}

export async function getHorarios(sucursalId?: string) {
  const db = getDb();
  const rows = sucursalId
    ? await db
        .select()
        .from(horariosSucursalTable)
        .where(eq(horariosSucursalTable.sucursalId, sucursalId))
    : await db.select().from(horariosSucursalTable);
  return rows.map(mapHorario);
}

export async function getProfesionalesReserva(args?: {
  sucursalIds?: string[];
  soloSucursalId?: string;
  includeInactivePublic?: boolean;
}) {
  const db = getDb();
  const filters = [];

  if (!args?.includeInactivePublic) {
    filters.push(eq(profesionalesAgendaTable.activoPublico, true));
    filters.push(eq(empleadosTable.activo, true));
  }
  if (args?.soloSucursalId) {
    filters.push(eq(profesionalesAgendaTable.sucursalId, args.soloSucursalId));
  } else if (args?.sucursalIds?.length) {
    filters.push(inArray(profesionalesAgendaTable.sucursalId, args.sucursalIds));
  }

  const rows = await db
    .select({
      meta: profesionalesAgendaTable,
      empleado: empleadosTable,
    })
    .from(profesionalesAgendaTable)
    .innerJoin(
      empleadosTable,
      eq(profesionalesAgendaTable.empleadoId, empleadosTable.id),
    )
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      asc(profesionalesAgendaTable.prioridad),
      asc(empleadosTable.nombre),
    );

  return rows.map(
    (row): ProfesionalReserva => ({
      ...mapProfesionalAgendaRow(row.meta),
      empleado: mapEmpleado(row.empleado),
    }),
  );
}

export async function getTurnosRaw(args?: {
  fecha?: string;
  sucursalIds?: string[];
  sucursalId?: string;
  profesionalId?: string;
  estado?: TurnoEstado | string;
  desdeFechaTurno?: string;
  hastaFechaTurno?: string;
}) {
  const db = getDb();
  const filters = [];

  if (args?.sucursalIds?.length) {
    filters.push(inArray(turnosTable.sucursalId, args.sucursalIds));
  }
  if (args?.sucursalId) {
    filters.push(eq(turnosTable.sucursalId, args.sucursalId));
  }
  if (args?.fecha) {
    filters.push(eq(turnosTable.fechaTurno, args.fecha));
  }
  if (args?.profesionalId) {
    filters.push(eq(turnosTable.profesionalId, args.profesionalId));
  }
  if (args?.estado) {
    filters.push(eq(turnosTable.estado, args.estado as TurnoEstado));
  }
  if (args?.desdeFechaTurno) {
    filters.push(gte(turnosTable.fechaTurno, args.desdeFechaTurno));
  }
  if (args?.hastaFechaTurno) {
    filters.push(lte(turnosTable.fechaTurno, args.hastaFechaTurno));
  }

  const rows = await db
    .select({ turno: turnosTable, cliente: clientesTable })
    .from(turnosTable)
    .innerJoin(clientesTable, eq(turnosTable.clienteId, clientesTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(turnosTable.fechaTurno), asc(turnosTable.hora));

  return rows.map((row) => mapTurno(row.turno, row.cliente));
}

async function getTurnoContextForScope(scopeIds?: string[]) {
  const [sucursales, servicios, horarios, profesionales] = await Promise.all([
    getSucursalesActivas(scopeIds),
    getServiciosActivos(),
    getHorarios(),
    getProfesionalesReserva({ sucursalIds: scopeIds }),
  ]);

  return { sucursales, servicios, horarios, profesionales };
}

export async function getTurnoCatalogRefs(args: {
  servicioId: string;
  profesionalId: string;
  sucursalId: string;
}) {
  const db = getDb();
  const [servicioRow] = await db
    .select()
    .from(serviciosTable)
    .where(
      and(
        eq(serviciosTable.id, args.servicioId),
        eq(serviciosTable.activo, true),
      ),
    )
    .limit(1);

  const [profRow] = await db
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
        eq(profesionalesAgendaTable.empleadoId, args.profesionalId),
        eq(profesionalesAgendaTable.sucursalId, args.sucursalId),
        eq(profesionalesAgendaTable.activoPublico, true),
        eq(empleadosTable.activo, true),
      ),
    )
    .limit(1);

  return {
    servicio: servicioRow ? mapServicio(servicioRow) : null,
    profesional: profRow
      ? ({
          id: profRow.meta.id,
          empleado_id: profRow.meta.empleadoId,
          sucursal_id: profRow.meta.sucursalId,
          especialidad: profRow.meta.especialidad,
          avatar_url: profRow.meta.avatarUrl,
          color: profRow.meta.color,
          bio: profRow.meta.bio ?? undefined,
          prioridad: profRow.meta.prioridad,
          activo_publico: profRow.meta.activoPublico,
          empleado: mapEmpleado(profRow.empleado),
        } satisfies ProfesionalReserva)
      : null,
  };
}

async function buildAgendaTurnos(args: {
  scopeSucursalIds: string[];
  fecha?: string;
  sucursalId?: string;
  profesionalId?: string;
  estado?: string;
  employeeScopeId?: string;
  restrictToEmpleado?: boolean;
}) {
  // Fail-closed: un empleado sin ficha vinculada (empleado_id) no ve ningún
  // turno, en vez de mostrar los de toda la sucursal.
  if (args.restrictToEmpleado && !args.employeeScopeId) return [];
  const effectiveProfesionalId = args.employeeScopeId ?? args.profesionalId;
  const { sucursales, servicios, profesionales } = await getTurnoContextForScope(
    args.scopeSucursalIds,
  );

  const turnos = await getTurnosRaw({
    fecha: args.fecha,
    sucursalIds: args.scopeSucursalIds,
    sucursalId: args.sucursalId,
    profesionalId: effectiveProfesionalId,
    estado: args.estado,
  });

  const filtered =
    args.employeeScopeId
      ? turnos.filter((item) => item.profesional_id === args.employeeScopeId)
      : turnos;

  return filtered
    .sort((a, b) => a.hora.localeCompare(b.hora))
    .map((turno) =>
      buildTurnoDetalle({
        turno,
        servicios,
        sucursales,
        profesionales,
      }),
    );
}

/**
 * Datos para la reserva pública de la home.
 *
 * OJO CON LO QUE SE AGREGUE ACÁ: este objeto se le pasa como prop a
 * <BookingExperience>, que es un componente cliente, así que se serializa entero
 * al HTML que recibe cualquier visitante sin sesión. Lo que entra a este
 * snapshot es público, punto.
 *
 * Por eso los turnos se proyectan a TurnoOcupacion y no salen como `Turno`: un
 * Turno completo incluye `token_acceso` (el magic link que permite cancelar y
 * reprogramar ese turno), el teléfono, el email y las observaciones de la
 * clienta. Con eso, un `curl` a la home alcanzaba para llevarse la agenda entera
 * de las dos sucursales y poder cancelarle el turno a cualquiera.
 */
export async function getReservaPublicaSnapshot() {
  const today = hoyAr();
  const [
    sucursales,
    servicios,
    horarios,
    profesionales,
    turnos,
    serviciosHorarios,
    profesionalesHorarios,
    profesionalesServicios,
    serviciosSucursales,
  ] = await Promise.all([
    getSucursalesActivas(),
    getServiciosActivos(),
    getHorarios(),
    getProfesionalesReserva(),
    getTurnosRaw({ desdeFechaTurno: today }),
    listServiciosHorariosAll(),
    listProfesionalesHorariosAll(),
    listProfesionalesServiciosAll(),
    listServiciosSucursalesAll(),
  ]);

  return {
    sucursales,
    servicios,
    horarios,
    profesionales,
    // Proyección deliberada: sólo la ocupación de la franja, sin datos de la
    // clienta ni el token del turno. Ver el comentario de arriba.
    turnos: turnos.map(
      (t): TurnoOcupacion => ({
        sucursal_id: t.sucursal_id,
        profesional_id: t.profesional_id,
        fecha_turno: t.fecha_turno,
        hora: t.hora,
        duracion_min: t.duracion_min,
        estado: t.estado,
      }),
    ),
    serviciosHorarios,
    profesionalesHorarios,
    profesionalesServicios,
    serviciosSucursales,
  };
}

export async function listTurnos(opts?: {
  fecha?: string;
  sucursalId?: string;
  profesionalId?: string;
  estado?: string;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);

  if (opts?.sucursalId && !isSucursalAllowed(scope, opts.sucursalId)) {
    return [];
  }

  return buildAgendaTurnos({
    scopeSucursalIds: scope.sucursalIdsPermitidas,
    fecha: opts?.fecha,
    sucursalId: opts?.sucursalId,
    profesionalId: opts?.profesionalId,
    estado: opts?.estado,
    employeeScopeId: scope.rol === "empleado" ? scope.empleadoId : undefined,
    restrictToEmpleado: scope.rol === "empleado",
  });
}

export async function getTurno(turnoId: string) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();
  const row = await db
    .select({ turno: turnosTable, cliente: clientesTable })
    .from(turnosTable)
    .innerJoin(clientesTable, eq(turnosTable.clienteId, clientesTable.id))
    .where(eq(turnosTable.id, turnoId))
    .limit(1);

  const current = row[0];
  if (!current) return null;

  const turno = mapTurno(current.turno, current.cliente);
  if (!scope.sucursalIdsPermitidas.includes(turno.sucursal_id)) return null;
  if (scope.rol === "empleado" && scope.empleadoId !== turno.profesional_id) {
    return null;
  }

  const { sucursales, servicios, profesionales } = await getTurnoContextForScope(
    scope.sucursalIdsPermitidas,
  );

  return buildTurnoDetalle({
    turno,
    servicios,
    sucursales,
    profesionales,
  });
}

export async function getTurnosAgendaData(args?: {
  fecha?: string;
  sucursalId?: string;
  profesionalId?: string;
  estado?: string;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const employeeScopeId =
    scope.rol === "empleado" ? scope.empleadoId : undefined;

  // Un solo fetch de contexto (sucursales, servicios, profesionales): los
  // turnos del día se arman con joins en memoria y la lista de profesionales
  // de la sucursal se deriva de acá, evitando consultas duplicadas.
  const { sucursales, servicios, profesionales } =
    await getTurnoContextForScope(scope.sucursalIdsPermitidas);
  const sucursalId =
    clampSucursalId(scope, args?.sucursalId) ?? sucursales[0]?.id ?? "";
  const fecha = args?.fecha ?? hoyAr();

  // Fail-closed: un empleado sin ficha vinculada (empleado_id) no ve ningún
  // turno, en vez de los de toda la sucursal.
  const restrictToEmpleado = scope.rol === "empleado";
  const rawTurnos =
    restrictToEmpleado && !employeeScopeId
      ? []
      : await getTurnosRaw({
          fecha,
          sucursalIds: scope.sucursalIdsPermitidas,
          sucursalId,
          profesionalId: employeeScopeId ?? args?.profesionalId,
          estado: args?.estado,
        });
  const turnos = (
    employeeScopeId
      ? rawTurnos.filter((item) => item.profesional_id === employeeScopeId)
      : rawTurnos
  )
    .sort((a, b) => a.hora.localeCompare(b.hora))
    .map((turno) =>
      buildTurnoDetalle({ turno, servicios, sucursales, profesionales }),
    );

  const profesionalesDeSucursal = profesionales
    .filter((item) => item.sucursal_id === sucursalId)
    .filter(
      (item) => scope.rol !== "empleado" || item.empleado_id === scope.empleadoId,
    );

  const efectivos = turnos.map((item) => estadoEfectivo(item));
  const resumen = {
    total: turnos.length,
    pendientes: efectivos.filter((e) => e === "pendiente").length,
    realizados: efectivos.filter((e) => e === "realizado").length,
    ausentes: efectivos.filter((e) => e === "ausente").length,
    cancelados: efectivos.filter((e) => e === "cancelado").length,
  };

  return {
    fecha,
    sucursalId,
    // Proyectado por lo mismo que turnosPorFecha: la vista diaria es un
    // componente cliente. Ver toTurnoAgenda.
    turnos: turnos.map(toTurnoAgenda),
    resumen,
    profesionales: profesionalesDeSucursal,
    sucursales,
  };
}

export async function getTurnosAgendaRangeData(args: {
  fechaDesde: string;
  fechaHasta: string;
  sucursalId?: string;
  profesionalId?: string;
  estado?: string;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const sucursales = await getSucursalesActivas(scope.sucursalIdsPermitidas);
  const sucursalId =
    clampSucursalId(scope, args.sucursalId) ?? sucursales[0]?.id ?? "";

  const effectiveProfesionalId =
    scope.rol === "empleado" ? scope.empleadoId : args.profesionalId;

  const { servicios, profesionales: allProfs } = await getTurnoContextForScope(
    scope.sucursalIdsPermitidas,
  );

  const rawTurnos = await getTurnosRaw({
    desdeFechaTurno: args.fechaDesde,
    hastaFechaTurno: args.fechaHasta,
    sucursalIds: scope.sucursalIdsPermitidas,
    sucursalId,
    profesionalId: effectiveProfesionalId,
    estado: args.estado,
  });

  const filtered =
    scope.rol === "empleado"
      ? scope.empleadoId
        ? rawTurnos.filter((t) => t.profesional_id === scope.empleadoId)
        : [] // fail-closed: empleado sin ficha vinculada no ve turnos
      : rawTurnos;

  const detallados = filtered
    .sort((a, b) => a.hora.localeCompare(b.hora))
    .map((turno) =>
      buildTurnoDetalle({ turno, servicios, sucursales, profesionales: allProfs }),
    );

  // Proyección a TurnoAgenda: las vistas semanal y mensual son componentes
  // cliente, y un TurnoDetalle les mandaría al navegador el token de acceso de
  // cada clienta y los datos de sueldo de cada empleada. Ver toTurnoAgenda.
  const turnosPorFecha: Record<string, TurnoAgenda[]> = {};
  for (const t of detallados) {
    (turnosPorFecha[t.fecha_turno] ??= []).push(toTurnoAgenda(t));
  }

  const profesionalesDeSucursal = allProfs
    .filter((p) => p.sucursal_id === sucursalId)
    .filter((p) => scope.rol !== "empleado" || p.empleado_id === scope.empleadoId);

  const horarios = await getHorarios(sucursalId);

  return {
    turnosPorFecha,
    profesionales: profesionalesDeSucursal,
    sucursales,
    sucursalId,
    horarios,
  };
}

export async function getSlotsDisponibles(args: {
  fecha: string;
  sucursalId: string;
  servicioId: string;
  profesionalId?: string;
}) {
  const [
    horarios,
    profesionales,
    servicios,
    turnos,
    serviciosHorarios,
    profesionalesServicios,
  ] =
    await Promise.all([
      getHorarios(args.sucursalId),
      getProfesionalesReserva({
        soloSucursalId: args.sucursalId,
      }),
      getServiciosActivos(),
      getTurnosRaw({
        fecha: args.fecha,
        sucursalId: args.sucursalId,
      }),
      listServicioHorarios(args.servicioId),
      listProfesionalesServiciosBySucursal(args.sucursalId),
    ]);

  return buildAvailableSlots({
    fecha: args.fecha,
    sucursalId: args.sucursalId,
    servicioId: args.servicioId,
    profesionalId: args.profesionalId,
    horarios,
    profesionales,
    servicios,
    turnos,
    serviciosHorarios,
    profesionalesServicios,
  });
}

export async function getFechasDisponibles(sucursalId: string) {
  const horarios = await getHorarios(sucursalId);
  return listOpenDatesForSucursal(horarios, sucursalId);
}

export async function getFechasDisponiblesReservaPublica(args: {
  sucursalId: string;
  servicioId: string;
  profesionalId?: string;
  count?: number;
}) {
  const [
    horarios,
    profesionales,
    servicios,
    turnos,
    serviciosHorarios,
    profesionalesHorarios,
    profesionalesServicios,
  ] = await Promise.all([
    getHorarios(args.sucursalId),
    getProfesionalesReserva({ soloSucursalId: args.sucursalId }),
    getServiciosActivos(),
    getTurnosRaw({ sucursalId: args.sucursalId }),
    listServicioHorarios(args.servicioId),
    listProfesionalesHorariosBySucursal(args.sucursalId),
    listProfesionalesServiciosBySucursal(args.sucursalId),
  ]);

  return listReservableDates({
    count: args.count,
    sucursalId: args.sucursalId,
    servicioId: args.servicioId,
    profesionalId: args.profesionalId,
    horarios,
    profesionales,
    servicios,
    turnos,
    serviciosHorarios,
    profesionalesHorarios,
    profesionalesServicios,
  });
}

export type TurnoActionState =
  | {
      ok: true;
      turnoId: string;
      message: string;
      // Datos del turno reservado para la pantalla de confirmación (no dependen
      // del estado del cliente, que pierde el slot al revalidarse la agenda).
      fecha_turno?: string;
      hora?: string;
      servicio_nombre?: string;
      profesional_nombre?: string;
    }
  | { ok: false; errors: Record<string, string[]> };

export async function listTurnosByDayAndProfesional(
  fecha: string,
  sucursalId: string,
) {
  const rows = (await listTurnos({ fecha, sucursalId })).reduce<
    Record<string, TurnoDetalle[]>
  >((acc, turno) => {
    (acc[turno.profesional_id] ??= []).push(turno);
    return acc;
  }, {});
  return rows;
}
