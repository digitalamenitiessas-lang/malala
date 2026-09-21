"use server";

import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";

type DbOrTx = ReturnType<typeof getDb> | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
import { requireSupabaseRuntime } from "@/lib/db/env";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import {
  anticipos as anticiposTable,
  viaticos as viaticosTable,
  cierresCaja as cierresCajaTable,
  empleados as empleadosTable,
  egresos as egresosTable,
  ingresoLineas as ingresoLineasTable,
  ingresos as ingresosTable,
  insumos as insumosTable,
  liquidacionLineas as liquidacionLineasTable,
  liquidaciones as liquidacionesTable,
  mediosPago as mediosPagoTable,
  profesionalesHorarios as profesionalesHorariosTable,
  profiles as profilesTable,
  rubrosGasto as rubrosGastoTable,
  servicios as serviciosTable,
  sucursales as sucursalesTable,
} from "@/lib/db/schema";
import type {
  Empleado,
  Liquidacion,
  LiquidacionEstado,
  LiquidacionLinea,
  MedioPago,
  Sucursal,
} from "@/lib/types";
import {
  liquidacionCreateSchema,
  liquidacionPagoSchema,
} from "@/lib/validations/liquidacion";
import { fieldErrors, requireRole } from "./_helpers";
import {
  deleteMovimientosByRefTx,
  emitMovimientoBancarioTx,
  getCuentaIdForMpTx,
} from "./movimientos-bancarios-helpers";
import { notificarLiquidacionEmpleadoPush } from "@/lib/integraciones/push";
import { fechaArDeISO, hoyAr } from "@/lib/fecha-ar";
// Mismo cálculo que muestra la ficha de la empleada: el total que la encargada
// verifica en pantalla y el que se paga acá tienen que ser el mismo número.
import { horasDeFranjasEnRango } from "@/lib/horas-franjas";

function createId() {
  return crypto.randomUUID();
}

function ymd(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isoStart(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toISOString();
}

function isoEnd(fecha: string): string {
  return new Date(`${fecha}T23:59:59.999`).toISOString();
}

function mapLiquidacion(
  row: typeof liquidacionesTable.$inferSelect,
): Liquidacion {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    empleado_id: row.empleadoId,
    periodo_desde: ymd(row.periodoDesde),
    periodo_hasta: ymd(row.periodoHasta),
    total_servicios: row.totalServicios,
    dias_trabajados: row.diasTrabajados,
    total_comision: row.totalComision,
    horas_trabajadas: row.horasTrabajadas,
    valor_hora: row.valorHora,
    sueldo_horas: row.sueldoHoras,
    viatico_por_dia: row.viaticoPorDia,
    dias_viatico: row.diasViatico,
    total_viatico: row.totalViatico,
    total_anticipos: row.totalAnticipos,
    total_pagar: row.totalPagar,
    estado: row.estado as LiquidacionEstado,
    mp_id: row.mpId ?? undefined,
    fecha_pago: row.fechaPago?.toISOString() ?? undefined,
    observacion: row.observacion ?? undefined,
    egreso_id: row.egresoId ?? undefined,
    usuario_id: row.usuarioId,
    creado_en: row.creadoEn.toISOString(),
  };
}

function mapLinea(
  row: typeof liquidacionLineasTable.$inferSelect,
): LiquidacionLinea {
  return {
    id: row.id,
    liquidacion_id: row.liquidacionId,
    ingreso_linea_id: row.ingresoLineaId ?? undefined,
    ingreso_id: row.ingresoId ?? undefined,
    fecha: ymd(row.fecha),
    servicio_nombre: row.servicioNombre,
    precio: row.precio,
    comision_pct: row.comisionPct,
    comision_monto: row.comisionMonto,
  };
}

export interface LiquidacionPreviewLinea {
  ingreso_linea_id: string;
  ingreso_id: string;
  fecha: string;
  servicio_nombre: string;
  precio: number;
  comision_pct: number;
  comision_monto: number;
}

export interface LiquidacionPreviewAnticipo {
  id: string;
  fecha: string;
  monto: number;
  observacion?: string;
}

export interface LiquidacionPreviewViatico {
  id: string;
  fecha: string;
  monto: number;
  pagado: boolean;
  observacion?: string;
}

export interface LiquidacionPreview {
  empleado_id: string;
  sucursal_id: string;
  periodo_desde: string;
  periodo_hasta: string;
  lineas: LiquidacionPreviewLinea[];
  total_comision: number;
  total_servicios: number;
  dias_trabajados: number;
  valor_hora: number;
  horas_sugeridas: number;
  viaticos: LiquidacionPreviewViatico[];
  /** Todo lo que cobró de viático en el período. Es lo que se muestra. */
  total_viatico: number;
  /** Sólo lo que todavía NO se le dio: lo único que se suma al total a pagar. */
  viatico_a_pagar: number;
  anticipos: LiquidacionPreviewAnticipo[];
  total_anticipos: number;
}

async function fetchLineasPendientes(args: {
  sucursalId: string;
  empleadoId: string;
  desde: string;
  hasta: string;
}): Promise<LiquidacionPreviewLinea[]> {
  const db = getDb();

  const rows = await db
    .select({
      lineaId: ingresoLineasTable.id,
      ingresoId: ingresoLineasTable.ingresoId,
      fecha: ingresosTable.fecha,
      servicioNombre: serviciosTable.nombre,
      insumoNombre: insumosTable.nombre,
      precio: ingresoLineasTable.precioEfectivo,
      pct: ingresoLineasTable.comisionPct,
      monto: ingresoLineasTable.comisionMonto,
      yaLiquidada: liquidacionLineasTable.id,
    })
    .from(ingresoLineasTable)
    .innerJoin(ingresosTable, eq(ingresoLineasTable.ingresoId, ingresosTable.id))
    // leftJoin y no innerJoin: una línea de venta de producto no tiene
    // servicio_id, y con el innerJoin quedaba afuera de la liquidación — la
    // comisión se registraba en la venta y no se le pagaba nunca.
    .leftJoin(serviciosTable, eq(ingresoLineasTable.servicioId, serviciosTable.id))
    .leftJoin(insumosTable, eq(ingresoLineasTable.insumoId, insumosTable.id))
    .leftJoin(
      liquidacionLineasTable,
      eq(liquidacionLineasTable.ingresoLineaId, ingresoLineasTable.id),
    )
    .where(
      and(
        eq(ingresoLineasTable.empleadoId, args.empleadoId),
        eq(ingresosTable.sucursalId, args.sucursalId),
        eq(ingresosTable.anulado, false),
        gte(ingresosTable.fecha, new Date(isoStart(args.desde))),
        lte(ingresosTable.fecha, new Date(isoEnd(args.hasta))),
      ),
    );

  return rows
    .filter((r) => r.yaLiquidada === null)
    .map((r) => ({
      ingreso_linea_id: r.lineaId,
      ingreso_id: r.ingresoId,
      fecha: ymd(r.fecha),
      servicio_nombre: r.servicioNombre ?? r.insumoNombre ?? "—",
      precio: r.precio,
      comision_pct: r.pct,
      comision_monto: r.monto,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** "09:30" → 570. */
/** Cuenta los días del rango [desde, hasta] cuyo día de semana está en `dias`. */
function contarDiasLaborables(
  desde: string,
  hasta: string,
  dias: number[],
): number {
  if (dias.length === 0) return 0;
  const set = new Set(dias);
  let count = 0;
  const cur = new Date(`${desde}T12:00:00`);
  const fin = new Date(`${hasta}T12:00:00`);
  while (cur <= fin) {
    if (set.has(cur.getDay())) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Valor hora + jornada del empleado + anticipos pendientes de descontar en el período. */
async function fetchValorHoraYAnticipos(args: {
  empleadoId: string;
  sucursalId: string;
  desde: string;
  hasta: string;
}): Promise<{
  valorHora: number;
  horasSugeridas: number;
  viaticoPorDia: number;
  anticipos: { id: string; fecha: string; monto: number; observacion?: string }[];
}> {
  const db = getDb();

  const [empleado] = await db
    .select({
      valorHora: empleadosTable.valorHora,
      viaticoPorDia: empleadosTable.viaticoPorDia,
      horasPorDia: empleadosTable.horasPorDia,
      diasTrabajo: empleadosTable.diasTrabajo,
    })
    .from(empleadosTable)
    .where(eq(empleadosTable.id, args.empleadoId))
    .limit(1);

  const anticipoRows = await db
    .select()
    .from(anticiposTable)
    .where(
      and(
        eq(anticiposTable.empleadoId, args.empleadoId),
        eq(anticiposTable.sucursalId, args.sucursalId),
        isNull(anticiposTable.liquidacionId),
        gte(anticiposTable.fecha, new Date(isoStart(args.desde))),
        lte(anticiposTable.fecha, new Date(isoEnd(args.hasta))),
      ),
    )
    .orderBy(asc(anticiposTable.fecha));

  // Las horas salen del horario semanal cargado en Disponibilidad pública, que
  // es el mismo que usa la reserva online. Es lo que pidió el salón: un solo
  // lugar donde se declara la semana de cada persona.
  //
  // FALLBACK A LA FICHA, y no es cosmético: sin franjas cargadas la reserva
  // entiende "disponible todo el día", así que interpretar la ausencia como
  // "cero horas a pagar" convertiría un dato que hoy significa lo contrario en
  // un sueldo en cero. Mientras no haya horario semanal se sigue usando
  // horas_por_dia × días de trabajo, como hasta ahora.
  const franjas = await db
    .select()
    .from(profesionalesHorariosTable)
    .where(
      and(
        eq(profesionalesHorariosTable.empleadoId, args.empleadoId),
        eq(profesionalesHorariosTable.sucursalId, args.sucursalId),
      ),
    );

  const horasSugeridas =
    franjas.length > 0
      ? horasDeFranjasEnRango(args.desde, args.hasta, franjas)
      : contarDiasLaborables(
          args.desde,
          args.hasta,
          empleado?.diasTrabajo ?? [],
        ) * (empleado?.horasPorDia ?? 0);

  return {
    valorHora: empleado?.valorHora ?? 0,
    horasSugeridas,
    viaticoPorDia: empleado?.viaticoPorDia ?? 0,
    anticipos: anticipoRows.map((a) => ({
      id: a.id,
      fecha: ymd(a.fecha),
      monto: a.monto,
      observacion: a.observacion ?? undefined,
    })),
  };
}

async function empleadoPerteneceASucursal(
  empleadoId: string,
  sucursalId: string,
): Promise<boolean> {
  const db = getDb();
  const [empleado] = await db
    .select({ sucursalId: empleadosTable.sucursalPrincipalId })
    .from(empleadosTable)
    .where(eq(empleadosTable.id, empleadoId))
    .limit(1);

  return empleado?.sucursalId === sucursalId;
}

/**
 * Busca una liquidación ya existente del mismo empleado+sucursal cuyo período se
 * superponga con [desde, hasta]. Dos rangos se solapan si: existente.desde <=
 * nuevo.hasta && existente.hasta >= nuevo.desde. Las liquidaciones anuladas se
 * borran de la tabla, así que cualquier fila encontrada está vigente.
 */
async function buscarLiquidacionSolapada(
  args: { empleadoId: string; sucursalId: string; desde: string; hasta: string },
  db: DbOrTx = getDb(),
): Promise<{ desde: string; hasta: string } | null> {
  const [row] = await db
    .select({
      desde: liquidacionesTable.periodoDesde,
      hasta: liquidacionesTable.periodoHasta,
    })
    .from(liquidacionesTable)
    .where(
      and(
        eq(liquidacionesTable.empleadoId, args.empleadoId),
        eq(liquidacionesTable.sucursalId, args.sucursalId),
        lte(liquidacionesTable.periodoDesde, args.hasta),
        gte(liquidacionesTable.periodoHasta, args.desde),
      ),
    )
    .limit(1);

  return row ? { desde: ymd(row.desde), hasta: ymd(row.hasta) } : null;
}

function errorSolapada(solapada: { desde: string; hasta: string }) {
  const f = (s: string) => s.split("-").reverse().join("/");
  return {
    ok: false as const,
    errors: {
      _: [
        `Ya existe una liquidación de este empleado que cubre esas fechas ` +
          `(${f(solapada.desde)} a ${f(solapada.hasta)}). Anulala o ajustá el período.`,
      ],
    },
  };
}

export async function previewLiquidacion(input: {
  sucursalId: string;
  empleadoId: string;
  periodoDesde: string;
  periodoHasta: string;
}): Promise<
  | { ok: true; preview: LiquidacionPreview }
  | { ok: false; errors: Record<string, string[]> }
> {
  await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime("Las liquidaciones requieren Supabase configurado.");

  const parsed = liquidacionCreateSchema.safeParse({
    sucursal_id: input.sucursalId,
    empleado_id: input.empleadoId,
    periodo_desde: input.periodoDesde,
    periodo_hasta: input.periodoHasta,
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, parsed.data.sucursal_id)) {
    return { ok: false, errors: { sucursal_id: ["Sin acceso a esa sucursal"] } };
  }
  if (
    !(await empleadoPerteneceASucursal(
      parsed.data.empleado_id,
      parsed.data.sucursal_id,
    ))
  ) {
    return {
      ok: false,
      errors: {
        empleado_id: ["La empleada no pertenece a la sucursal seleccionada"],
      },
    };
  }

  const solapada = await buscarLiquidacionSolapada({
    empleadoId: parsed.data.empleado_id,
    sucursalId: parsed.data.sucursal_id,
    desde: parsed.data.periodo_desde,
    hasta: parsed.data.periodo_hasta,
  });
  if (solapada) return errorSolapada(solapada);

  const lineas = await fetchLineasPendientes({
    sucursalId: parsed.data.sucursal_id,
    empleadoId: parsed.data.empleado_id,
    desde: parsed.data.periodo_desde,
    hasta: parsed.data.periodo_hasta,
  });

  const dias = new Set(lineas.map((l) => l.fecha));
  const totalComision = lineas.reduce((s, l) => s + l.comision_monto, 0);

  const { valorHora, horasSugeridas, anticipos } =
    await fetchValorHoraYAnticipos({
      empleadoId: parsed.data.empleado_id,
      sucursalId: parsed.data.sucursal_id,
      desde: parsed.data.periodo_desde,
      hasta: parsed.data.periodo_hasta,
    });
  const totalAnticipos = anticipos.reduce((s, a) => s + a.monto, 0);

  // Viáticos cargados día por día. Ya no se estima como "días × monto fijo": ese
  // camino adivinaba la asistencia contando ventas y no dejaba que el monto
  // variara de un día a otro.
  const viaticosPeriodo = await getDb()
    .select()
    .from(viaticosTable)
    .where(
      and(
        eq(viaticosTable.empleadoId, parsed.data.empleado_id),
        eq(viaticosTable.sucursalId, parsed.data.sucursal_id),
        gte(viaticosTable.fecha, parsed.data.periodo_desde),
        lte(viaticosTable.fecha, parsed.data.periodo_hasta),
        isNull(viaticosTable.liquidacionId),
      ),
    );

  return {
    ok: true,
    preview: {
      empleado_id: parsed.data.empleado_id,
      sucursal_id: parsed.data.sucursal_id,
      periodo_desde: parsed.data.periodo_desde,
      periodo_hasta: parsed.data.periodo_hasta,
      lineas,
      total_comision: totalComision,
      total_servicios: lineas.length,
      dias_trabajados: dias.size,
      valor_hora: valorHora,
      horas_sugeridas: horasSugeridas,
      viaticos: viaticosPeriodo.map((v) => ({
        id: v.id,
        fecha: v.fecha,
        monto: v.monto,
        pagado: v.pagado,
        observacion: v.observacion ?? undefined,
      })),
      total_viatico: viaticosPeriodo.reduce((acc, v) => acc + v.monto, 0),
      viatico_a_pagar: viaticosPeriodo
        .filter((v) => !v.pagado)
        .reduce((acc, v) => acc + v.monto, 0),
      anticipos,
      total_anticipos: totalAnticipos,
    },
  };
}

export type CreateLiquidacionResult =
  | { ok: true; liquidacionId: string }
  | { ok: false; errors: Record<string, string[]> };

export async function createLiquidacion(
  formData: FormData,
): Promise<CreateLiquidacionResult> {
  const user = await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime("Las liquidaciones requieren Supabase configurado.");

  const parsed = liquidacionCreateSchema.safeParse({
    sucursal_id: formData.get("sucursal_id"),
    empleado_id: formData.get("empleado_id"),
    periodo_desde: formData.get("periodo_desde"),
    periodo_hasta: formData.get("periodo_hasta"),
    horas_trabajadas: formData.get("horas_trabajadas"),
    dias_viatico: formData.get("dias_viatico"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, parsed.data.sucursal_id)) {
    return { ok: false, errors: { sucursal_id: ["Sin acceso a esa sucursal"] } };
  }
  if (
    !(await empleadoPerteneceASucursal(
      parsed.data.empleado_id,
      parsed.data.sucursal_id,
    ))
  ) {
    return {
      ok: false,
      errors: {
        empleado_id: ["La empleada no pertenece a la sucursal seleccionada"],
      },
    };
  }

  const horasTrabajadas = parsed.data.horas_trabajadas;
  const diasViatico = parsed.data.dias_viatico;

  const lineas = await fetchLineasPendientes({
    sucursalId: parsed.data.sucursal_id,
    empleadoId: parsed.data.empleado_id,
    desde: parsed.data.periodo_desde,
    hasta: parsed.data.periodo_hasta,
  });

  if (lineas.length === 0 && horasTrabajadas <= 0 && diasViatico <= 0) {
    return {
      ok: false,
      errors: {
        _: ["No hay servicios, horas ni viatico para liquidar en ese período"],
      },
    };
  }

  const { valorHora, viaticoPorDia, anticipos } = await fetchValorHoraYAnticipos({
    empleadoId: parsed.data.empleado_id,
    sucursalId: parsed.data.sucursal_id,
    desde: parsed.data.periodo_desde,
    hasta: parsed.data.periodo_hasta,
  });

  const dias = new Set(lineas.map((l) => l.fecha));
  const totalComision = lineas.reduce((s, l) => s + l.comision_monto, 0);
  const sueldoHoras = horasTrabajadas * valorHora;

  // Viáticos del período: los que se cargaron día por día, no un fijo por una
  // cantidad de días adivinada. Se toman sólo los que no entraron todavía en
  // otra liquidación.
  const viaticosPeriodo = await getDb()
    .select()
    .from(viaticosTable)
    .where(
      and(
        eq(viaticosTable.empleadoId, parsed.data.empleado_id),
        eq(viaticosTable.sucursalId, parsed.data.sucursal_id),
        gte(viaticosTable.fecha, parsed.data.periodo_desde),
        lte(viaticosTable.fecha, parsed.data.periodo_hasta),
        isNull(viaticosTable.liquidacionId),
      ),
    );

  // El total de viáticos entra en lo que la empleada COBRÓ en el período: es
  // parte de su ingreso y por eso se muestra.
  const totalViatico = viaticosPeriodo.reduce((s, v) => s + v.monto, 0);
  // Pero sólo se PAGA acá lo que todavía no se le dio. Los que se entregaron en
  // el momento ya salieron de la caja como egreso; sumarlos otra vez sería
  // pagarle dos veces el mismo almuerzo.
  const viaticoAPagar = viaticosPeriodo
    .filter((v) => !v.pagado)
    .reduce((s, v) => s + v.monto, 0);

  const totalAnticipos = anticipos.reduce((s, a) => s + a.monto, 0);
  const totalPagar =
    totalComision + sueldoHoras + viaticoAPagar - totalAnticipos;
  const liquidacionId = createId();

  let solapadaError: ReturnType<typeof errorSolapada> | null = null;
  const db = getDb();
  await db.transaction(async (tx) => {
    // Check de solapamiento dentro de la transacción para evitar race condition.
    const solapada = await buscarLiquidacionSolapada(
      {
        empleadoId: parsed.data.empleado_id,
        sucursalId: parsed.data.sucursal_id,
        desde: parsed.data.periodo_desde,
        hasta: parsed.data.periodo_hasta,
      },
      tx,
    );
    if (solapada) {
      solapadaError = errorSolapada(solapada);
      throw new Error("SOLAP");
    }

    await tx.insert(liquidacionesTable).values({
      id: liquidacionId,
      sucursalId: parsed.data.sucursal_id,
      empleadoId: parsed.data.empleado_id,
      periodoDesde: parsed.data.periodo_desde,
      periodoHasta: parsed.data.periodo_hasta,
      totalServicios: lineas.length,
      diasTrabajados: dias.size,
      totalComision,
      horasTrabajadas,
      valorHora,
      sueldoHoras,
      viaticoPorDia,
      diasViatico,
      totalViatico,
      totalAnticipos,
      totalPagar,
      estado: "pendiente",
      usuarioId: user.id,
    });

    // Marcar los anticipos del período como descontados en esta liquidación.
    if (anticipos.length > 0) {
      await tx
        .update(anticiposTable)
        .set({ liquidacionId })
        .where(
          inArray(
            anticiposTable.id,
            anticipos.map((a) => a.id),
          ),
        );
    }

    // Y los viáticos, por lo mismo: es lo que impide que el mismo almuerzo entre
    // en dos liquidaciones.
    if (viaticosPeriodo.length > 0) {
      await tx
        .update(viaticosTable)
        .set({ liquidacionId })
        .where(
          inArray(
            viaticosTable.id,
            viaticosPeriodo.map((v) => v.id),
          ),
        );
    }

    const rows = lineas.map((l) => ({
      id: createId(),
      liquidacionId,
      ingresoLineaId: l.ingreso_linea_id,
      ingresoId: l.ingreso_id,
      fecha: l.fecha,
      servicioNombre: l.servicio_nombre,
      precio: l.precio,
      comisionPct: l.comision_pct,
      comisionMonto: l.comision_monto,
    }));

    // Insertar en chunks por si hay muchas
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await tx.insert(liquidacionLineasTable).values(rows.slice(i, i + CHUNK));
    }
  }).catch((err) => {
    if (!(err instanceof Error && err.message === "SOLAP")) throw err;
  });

  if (solapadaError) return solapadaError;

  await notificarLiquidacionEmpleadoPush({ liquidacionId }).catch(() => {});
  revalidatePath("/liquidaciones");
  return { ok: true, liquidacionId };
}

export interface LiquidacionConDetalle {
  liquidacion: Liquidacion;
  empleado: Empleado;
  sucursal: Sucursal;
  medioPago: MedioPago | null;
  cerrado_por_nombre: string;
  lineas: LiquidacionLinea[];
}

export interface LiquidacionListItem {
  liquidacion: Liquidacion;
  empleado_nombre: string;
  sucursal_nombre: string;
}

export async function listLiquidaciones(opts?: {
  sucursalId?: string;
  empleadoId?: string;
  estado?: LiquidacionEstado;
  limit?: number;
}): Promise<LiquidacionListItem[]> {
  await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime("Las liquidaciones requieren Supabase configurado.");

  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (opts?.sucursalId && !isSucursalAllowed(scope, opts.sucursalId)) return [];

  const db = getDb();
  const filters = [inArray(liquidacionesTable.sucursalId, scope.sucursalIdsPermitidas)];
  if (opts?.sucursalId) {
    filters.push(eq(liquidacionesTable.sucursalId, opts.sucursalId));
  }
  if (opts?.empleadoId) {
    filters.push(eq(liquidacionesTable.empleadoId, opts.empleadoId));
  }
  if (opts?.estado) {
    filters.push(eq(liquidacionesTable.estado, opts.estado));
  }

  const rows = await db
    .select({
      liq: liquidacionesTable,
      empleadoNombre: empleadosTable.nombre,
      sucursalNombre: sucursalesTable.nombre,
    })
    .from(liquidacionesTable)
    .innerJoin(empleadosTable, eq(liquidacionesTable.empleadoId, empleadosTable.id))
    .innerJoin(sucursalesTable, eq(liquidacionesTable.sucursalId, sucursalesTable.id))
    .where(and(...filters))
    .orderBy(desc(liquidacionesTable.creadoEn))
    .limit(opts?.limit ?? 100);

  return rows.map((row) => ({
    liquidacion: mapLiquidacion(row.liq),
    empleado_nombre: row.empleadoNombre,
    sucursal_nombre: row.sucursalNombre,
  }));
}

function mapEmpleadoRow(row: typeof empleadosTable.$inferSelect): Empleado {
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
    horas_por_dia: row.horasPorDia,
    dias_trabajo: row.diasTrabajo ?? [],
    observacion: row.observacion ?? undefined,
  };
}

function mapSucursalRow(row: typeof sucursalesTable.$inferSelect): Sucursal {
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

function mapMpRow(row: typeof mediosPagoTable.$inferSelect): MedioPago {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    codigo: row.codigo,
    nombre: row.nombre,
    activo: row.activo,
    cuenta_id: row.cuentaId ?? undefined,
    recargo_pct: row.recargoPct,
  };
}

export async function getLiquidacion(
  id: string,
): Promise<LiquidacionConDetalle | null> {
  await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime("Las liquidaciones requieren Supabase configurado.");

  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();

  const [row] = await db
    .select({
      liq: liquidacionesTable,
      empleado: empleadosTable,
      sucursal: sucursalesTable,
      usuarioNombre: profilesTable.nombre,
    })
    .from(liquidacionesTable)
    .innerJoin(empleadosTable, eq(liquidacionesTable.empleadoId, empleadosTable.id))
    .innerJoin(sucursalesTable, eq(liquidacionesTable.sucursalId, sucursalesTable.id))
    .leftJoin(profilesTable, eq(liquidacionesTable.usuarioId, profilesTable.userId))
    .where(eq(liquidacionesTable.id, id))
    .limit(1);

  if (!row) return null;
  if (!scope.sucursalIdsPermitidas.includes(row.liq.sucursalId)) return null;

  const lineas = await db
    .select()
    .from(liquidacionLineasTable)
    .where(eq(liquidacionLineasTable.liquidacionId, id))
    .orderBy(asc(liquidacionLineasTable.fecha));

  let medioPago: MedioPago | null = null;
  if (row.liq.mpId) {
    const [mp] = await db
      .select()
      .from(mediosPagoTable)
      .where(eq(mediosPagoTable.id, row.liq.mpId))
      .limit(1);
    medioPago = mp ? mapMpRow(mp) : null;
  }

  return {
    liquidacion: mapLiquidacion(row.liq),
    empleado: mapEmpleadoRow(row.empleado),
    sucursal: mapSucursalRow(row.sucursal),
    medioPago,
    cerrado_por_nombre: row.usuarioNombre ?? "Sistema",
    lineas: lineas.map(mapLinea),
  };
}

export type MarcarPagadaResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string[]> };

export async function marcarLiquidacionPagada(
  id: string,
  formData: FormData,
): Promise<MarcarPagadaResult> {
  const user = await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime("Las liquidaciones requieren Supabase configurado.");

  const parsed = liquidacionPagoSchema.safeParse({
    mp_id: formData.get("mp_id"),
    observacion: formData.get("observacion"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const scope = buildAccessScope(user);
  const db = getDb();

  const [existing] = await db
    .select()
    .from(liquidacionesTable)
    .where(eq(liquidacionesTable.id, id))
    .limit(1);

  if (!existing) return { ok: false, errors: { _: ["Liquidación no encontrada"] } };
  if (!scope.sucursalIdsPermitidas.includes(existing.sucursalId)) {
    return { ok: false, errors: { _: ["Sin acceso a esta liquidación"] } };
  }
  if (existing.estado !== "pendiente") {
    return { ok: false, errors: { _: ["La liquidación no está pendiente"] } };
  }

  const [empleado] = await db
    .select({ nombre: empleadosTable.nombre })
    .from(empleadosTable)
    .where(eq(empleadosTable.id, existing.empleadoId))
    .limit(1);

  const [rubro] = await db
    .select({ id: rubrosGastoTable.id })
    .from(rubrosGastoTable)
    .where(ilike(rubrosGastoTable.rubro, "Sueldos"))
    .limit(1);

  if (!rubro) {
    return {
      ok: false,
      errors: {
        _: [
          'No existe el rubro de gasto "Sueldos". Creálo en Catálogos → Rubros antes de pagar liquidaciones.',
        ],
      },
    };
  }

  const ahora = new Date();
  // Fecha argentina: el cierre de caja se guarda con la fecha local, no UTC.
  const ymdHoy = hoyAr();
  const egresoId = createId();
  const observacionEgreso =
    `Liquidación ${empleado?.nombre ?? "empleado"} ` +
    `(${existing.periodoDesde} a ${existing.periodoHasta})` +
    (parsed.data.observacion ? ` — ${parsed.data.observacion}` : "");

  try {
    await db.transaction(async (tx) => {
      const [cierreDelDia] = await tx
        .select({ id: cierresCajaTable.id })
        .from(cierresCajaTable)
        .where(
          and(
            eq(cierresCajaTable.sucursalId, existing.sucursalId),
            eq(cierresCajaTable.fecha, ymdHoy),
          ),
        )
        .limit(1);

      if (cierreDelDia) {
        throw new Error(
          `La caja del ${ymdHoy} ya está cerrada para esta sucursal. Reabrí el cierre antes de registrar el pago.`,
        );
      }

      // Monto neto a pagar al empleado: comisiones + sueldo por horas − anticipos
      // (los anticipos ya salieron de caja al registrarse). Solo genera egreso si
      // queda saldo a favor del empleado.
      const montoAPagar = existing.totalPagar;
      let egresoIdFinal: string | null = null;

      if (montoAPagar > 0.01) {
        egresoIdFinal = egresoId;
        await tx.insert(egresosTable).values({
          id: egresoId,
          fecha: ahora,
          sucursalId: existing.sucursalId,
          rubroId: rubro.id,
          valor: montoAPagar,
          mpId: parsed.data.mp_id,
          observacion: observacionEgreso,
          pagado: true,
          usuarioId: user.id,
        });

        const cuentaId = await getCuentaIdForMpTx(tx, parsed.data.mp_id);
        if (cuentaId) {
          await emitMovimientoBancarioTx(tx, {
            cuentaId,
            fecha: ahora,
            monto: -Math.abs(montoAPagar),
            tipo: "egreso",
            sucursalId: existing.sucursalId,
            refTipo: "egreso",
            refId: egresoId,
            descripcion: observacionEgreso,
            usuarioId: user.id,
          });
        }
      }

      await tx
        .update(liquidacionesTable)
        .set({
          estado: "pagada",
          mpId: parsed.data.mp_id,
          fechaPago: ahora,
          observacion: parsed.data.observacion ?? null,
          egresoId: egresoIdFinal,
        })
        .where(eq(liquidacionesTable.id, id));
    });
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [
          error instanceof Error
            ? error.message
            : "No se pudo registrar el pago",
        ],
      },
    };
  }

  revalidatePath("/liquidaciones");
  revalidatePath(`/liquidaciones/${id}`);
  revalidatePath("/egresos");
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  revalidatePath("/bancos");
  return { ok: true };
}

export async function anularLiquidacion(
  id: string,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string[]> }> {
  const user = await requireRole(["admin"]);
  const scope = buildAccessScope(user);
  const db = getDb();

  const [existing] = await db
    .select()
    .from(liquidacionesTable)
    .where(eq(liquidacionesTable.id, id))
    .limit(1);
  if (!existing) return { ok: false, errors: { _: ["No encontrada"] } };
  if (!scope.sucursalIdsPermitidas.includes(existing.sucursalId)) {
    return { ok: false, errors: { _: ["Sin acceso"] } };
  }

  try {
    await db.transaction(async (tx) => {
      if (existing.egresoId) {
        const [eg] = await tx
          .select({ fecha: egresosTable.fecha })
          .from(egresosTable)
          .where(eq(egresosTable.id, existing.egresoId))
          .limit(1);

        if (eg) {
          // El egreso es un instante guardado: su dia de negocio es el dia AR.
          const ymdEgreso = fechaArDeISO(eg.fecha.toISOString());
          const [cierre] = await tx
            .select({ id: cierresCajaTable.id })
            .from(cierresCajaTable)
            .where(
              and(
                eq(cierresCajaTable.sucursalId, existing.sucursalId),
                eq(cierresCajaTable.fecha, ymdEgreso),
              ),
            )
            .limit(1);
          if (cierre) {
            throw new Error(
              `El pago se registró el ${ymdEgreso} y la caja de ese día ya está cerrada. Reabrí el cierre antes de anular.`,
            );
          }
          await deleteMovimientosByRefTx(tx, "egreso", existing.egresoId);
          await tx.delete(egresosTable).where(eq(egresosTable.id, existing.egresoId));
        }
      }

      // Liberar los anticipos descontados: vuelven a quedar pendientes para una
      // futura liquidación (la plata del anticipo NO se devuelve, su egreso sigue).
      await tx
        .update(anticiposTable)
        .set({ liquidacionId: null })
        .where(eq(anticiposTable.liquidacionId, id));

      // Borrar libera las líneas para futuras liquidaciones
      await tx.delete(liquidacionesTable).where(eq(liquidacionesTable.id, id));
    });
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [
          error instanceof Error ? error.message : "No se pudo anular la liquidación",
        ],
      },
    };
  }

  revalidatePath("/liquidaciones");
  revalidatePath("/egresos");
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  revalidatePath("/bancos");
  return { ok: true };
}

export interface EfectivoPeriodo {
  ingresos_ef: number;
  egresos_ef: number;
  neto_ef: number;
}

export async function getEfectivoEsperadoPeriodo(args: {
  sucursalId: string;
  desde: string;
  hasta: string;
}): Promise<EfectivoPeriodo> {
  await requireRole(["admin", "encargada"]);
  const db = getDb();

  const desdeIso = new Date(isoStart(args.desde));
  const hastaIso = new Date(isoEnd(args.hasta));

  const [mpEf] = await db
    .select()
    .from(mediosPagoTable)
    .where(eq(mediosPagoTable.codigo, "EF"))
    .limit(1);
  if (!mpEf) return { ingresos_ef: 0, egresos_ef: 0, neto_ef: 0 };

  const ingresosRows = await db
    .select({
      mp1: ingresosTable.mp1Id,
      v1: ingresosTable.valor1,
      mp2: ingresosTable.mp2Id,
      v2: ingresosTable.valor2,
    })
    .from(ingresosTable)
    .where(
      and(
        eq(ingresosTable.sucursalId, args.sucursalId),
        eq(ingresosTable.anulado, false),
        gte(ingresosTable.fecha, desdeIso),
        lte(ingresosTable.fecha, hastaIso),
      ),
    );

  let ingresosEf = 0;
  for (const r of ingresosRows) {
    if (r.mp1 === mpEf.id) ingresosEf += r.v1;
    if (r.mp2 === mpEf.id && r.v2 != null) ingresosEf += r.v2;
  }

  const egresosRows = await db
    .select({ valor: egresosTable.valor })
    .from(egresosTable)
    .where(
      and(
        eq(egresosTable.sucursalId, args.sucursalId),
        eq(egresosTable.pagado, true),
        eq(egresosTable.anulado, false),
        eq(egresosTable.mpId, mpEf.id),
        gte(egresosTable.fecha, desdeIso),
        lte(egresosTable.fecha, hastaIso),
      ),
    );

  const egresosEf = egresosRows.reduce((s, r) => s + r.valor, 0);

  return {
    ingresos_ef: ingresosEf,
    egresos_ef: egresosEf,
    neto_ef: ingresosEf - egresosEf,
  };
}
