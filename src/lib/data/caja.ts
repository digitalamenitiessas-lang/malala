"use server";

import { and, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { hoyAr } from "@/lib/fecha-ar";
import {
  aperturasCaja as aperturasCajaTable,
  cierresCaja as cierresCajaTable,
  cierreCajaCuentas as cierreCajaCuentasTable,
  cuentasBancarias as cuentasBancariasTable,
  giftCardMovimientos as giftCardMovimientosTable,
  giftCards as giftCardsTable,
  movimientosBancarios as movimientosBancariosTable,
  profiles as profilesTable,
  sucursales as sucursalesTable,
} from "@/lib/db/schema";
import { fieldErrors, requireRole } from "./_helpers";
import { cierreCajaSchema, DENOMINACIONES_ARS } from "@/lib/validations/caja";
import type {
  CierreCaja,
  CierreCuentaLinea,
  Cliente,
  CuentaBancaria,
  Empleado,
  MedioPago,
} from "@/lib/types";
import { listEgresos } from "./egresos";
import { computeBreakdown } from "./ingresos-helpers";
import { listIngresos } from "./ingresos";
import { listMediosPago } from "./medios-pago";
import { getAperturaDeFecha, getSugerenciasApertura } from "./apertura-caja";

export interface ResumenMpRow {
  mp: MedioPago;
  ingresos: number;
  egresos: number;
  neto: number;
}

export interface EgresoDelDia {
  id: string;
  fecha: string;
  /** Lo que escribió la encargada; si no escribió nada, el rubro. */
  concepto: string;
  rubro: string;
  proveedor?: string;
  insumo?: string;
  mp?: string;
  valor: number;
  pagado: boolean;
}

export interface ResumenDelDia {
  fecha: string;
  sucursal_id: string;
  porMp: ResumenMpRow[];
  totalIngresos: number;
  totalEgresos: number;
  totalNeto: number;
  ef: { ingresos: number; egresos: number; neto: number };
  tr: { ingresos: number; egresos: number; neto: number };
  tc: { ingresos: number; egresos: number; neto: number };
  td: { ingresos: number; egresos: number; neto: number };
  cantIngresos: number;
  cantEgresos: number;
  tickets: TicketResumen[];
  // Los egresos uno por uno. Los totales solos no alcanzan: sin el concepto,
  // un "Egreso $4.000" en la caja no se puede rastrear hasta su origen para
  // corregirlo.
  egresos: EgresoDelDia[];
  comisionesPorEmpleado: ComisionEmpleadoRow[];
  totalComisiones: number;
  costoInsumos: number;
  paraElLocal: number;
  netoNegocio: number;
  // Fiado del día: ventas cobradas con cuenta corriente (NO entra a caja).
  fiado: FiadoDelDia;
  // Gift cards del día. Las dos cifras son necesarias y significan cosas
  // distintas: lo vendido es plata que entró y NO es facturación, lo canjeado es
  // facturación que NO trajo plata. Sin mostrarlas, el desglose por medio de
  // pago no cierra contra lo que hay en el cajón y dejan de confiar en la
  // pantalla.
  giftCards: GiftCardsDelDia;
}

export interface GiftCardsDelDia {
  /** Tarjetas vendidas hoy: plata cobrada por adelantado, todavía no facturada. */
  vendidas: number;
  cantidadVendidas: number;
  /** Canjeadas hoy: ya está contado en la facturación, pero no entró plata. */
  canjeadas: number;
  cantidadCanjeadas: number;
  /** Saldo total sin usar de la sucursal: lo que el salón todavía debe. */
  pasivo: number;
}

export interface FiadoDelDia {
  total: number;
  cantidad: number;
  porCliente: { cliente: Cliente | null; monto: number }[];
}

export interface TicketResumen {
  id: string;
  fecha: string;
  cliente: Cliente | null;
  total: number;
  comisiones: number;
  cantLineas: number;
  empleados: string[];
}

export interface ComisionEmpleadoRow {
  empleado: Empleado;
  total: number;
  lineas: number;
  pctDelTotal: number;
}

function createId() {
  return crypto.randomUUID();
}

function isoStartOfDay(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toISOString();
}

function isoEndOfDay(fecha: string): string {
  return new Date(`${fecha}T23:59:59.999`).toISOString();
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayYMD(): string {
  return hoyAr();
}

function addDaysYMD(fecha: string, delta: number): string {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return ymdLocal(d);
}

function isoToLocalYMD(iso: string): string {
  return ymdLocal(new Date(iso));
}

function emptyMpTotals() {
  return { ingresos: 0, egresos: 0, neto: 0 };
}

/**
 * IDs de cuentas de tipo "efectivo" de la sucursal. Sirve para identificar qué
 * medios de pago son efectivo SIN depender del código (que varía por sucursal:
 * "EFECTIVO", "EF", etc.); un medio es efectivo si su cuenta lo es.
 */
async function getEfectivoCuentaIds(sucursalId: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ id: cuentasBancariasTable.id })
    .from(cuentasBancariasTable)
    .where(
      and(
        eq(cuentasBancariasTable.sucursalId, sucursalId),
        eq(cuentasBancariasTable.tipo, "efectivo"),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

function mapCierre(row: typeof cierresCajaTable.$inferSelect): CierreCaja {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    fecha: row.fecha,
    saldo_inicial_ef: row.saldoInicialEf,
    saldo_banco: row.saldoBanco,
    billetes: row.billetes,
    ingresos_ef: row.ingresosEf,
    egresos_ef: row.egresosEf,
    ingresos_banc: row.ingresosBanc,
    egresos_banc: row.egresosBanc,
    cobros_tc: row.cobrosTc,
    cobros_td: row.cobrosTd,
    vouchers: row.vouchers,
    giftcards: row.giftcards,
    autoconsumos: row.autoconsumos,
    cheques: row.cheques,
    aportes: row.aportes,
    ingresos_cc: row.ingresosCc,
    anticipos: row.anticipos,
    observacion: row.observacion ?? undefined,
    cerrado_por: row.cerradoPor,
    fecha_cierre: row.fechaCierre.toISOString(),
  };
}

export interface EstadoCuentaDia {
  cuenta: CuentaBancaria;
  saldoInicial: number;
  ingresos: number;
  egresos: number;
  saldoEsperado: number;
}

/**
 * Estado de caja del día POR CUENTA: saldo inicial (lo declarado al abrir) +
 * ingresos − egresos del día = saldo esperado actual. Es la foto que hace
 * cuadrar la plata real, a diferencia del neto de movimientos que NO incluye
 * el saldo de arranque. Excluye el ajuste de apertura (refTipo "apertura").
 */
export async function getEstadoCajaDelDia(
  sucursalId: string,
  fecha: string,
): Promise<EstadoCuentaDia[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja || !isSucursalAllowed(scope, sucursalId)) {
    throw new Error("No tienes acceso a esta caja");
  }

  const db = getDb();
  const cuentasRows = await db
    .select()
    .from(cuentasBancariasTable)
    .where(
      and(
        eq(cuentasBancariasTable.sucursalId, sucursalId),
        eq(cuentasBancariasTable.activo, true),
      ),
    );
  if (cuentasRows.length === 0) return [];

  const apertura = await getAperturaDeFecha(sucursalId, fecha);
  const declaradoByCuenta = new Map(
    (apertura?.cuentas ?? []).map((l) => [l.cuenta_id, l.saldo_declarado]),
  );

  const movs = await db
    .select({
      cuentaId: movimientosBancariosTable.cuentaId,
      monto: movimientosBancariosTable.monto,
      refTipo: movimientosBancariosTable.refTipo,
    })
    .from(movimientosBancariosTable)
    .where(
      and(
        eq(movimientosBancariosTable.sucursalId, sucursalId),
        gte(movimientosBancariosTable.fecha, new Date(isoStartOfDay(fecha))),
        lte(movimientosBancariosTable.fecha, new Date(isoEndOfDay(fecha))),
      ),
    );

  const ingByCuenta = new Map<string, number>();
  const egByCuenta = new Map<string, number>();
  for (const m of movs) {
    // El ajuste de apertura fija el saldo inicial, no es un movimiento del día.
    if (m.refTipo === "apertura") continue;
    if (m.monto >= 0) {
      ingByCuenta.set(m.cuentaId, (ingByCuenta.get(m.cuentaId) ?? 0) + m.monto);
    } else {
      egByCuenta.set(
        m.cuentaId,
        (egByCuenta.get(m.cuentaId) ?? 0) + Math.abs(m.monto),
      );
    }
  }

  return cuentasRows
    .map((row): EstadoCuentaDia => {
      const cuenta: CuentaBancaria = {
        id: row.id,
        sucursal_id: row.sucursalId,
        nombre: row.nombre,
        tipo: row.tipo,
        activo: row.activo,
        observacion: row.observacion ?? undefined,
      };
      const saldoInicial = declaradoByCuenta.get(cuenta.id) ?? 0;
      const ingresos = ingByCuenta.get(cuenta.id) ?? 0;
      const egresos = egByCuenta.get(cuenta.id) ?? 0;
      return {
        cuenta,
        saldoInicial,
        ingresos,
        egresos,
        saldoEsperado: saldoInicial + ingresos - egresos,
      };
    })
    .sort((a, b) => {
      const ae = a.cuenta.tipo === "efectivo" ? 0 : 1;
      const be = b.cuenta.tipo === "efectivo" ? 0 : 1;
      if (ae !== be) return ae - be;
      return a.cuenta.nombre.localeCompare(b.cuenta.nombre);
    });
}

export async function getResumenDelDia(
  sucursalId: string,
  fecha: string,
): Promise<ResumenDelDia> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja || !isSucursalAllowed(scope, sucursalId)) {
    throw new Error("No tienes acceso a esta caja");
  }

  const desde = isoStartOfDay(fecha);
  const hasta = isoEndOfDay(fecha);

  // El medio "CC" no representa plata cobrada: las ventas fiadas generan deuda,
  // no entran a caja. Se excluye de los totales, pero guardamos sus ids para
  // calcular aparte el "fiado del día".
  // Los tres son independientes: no se necesitan entre sí para armarse. En
  // fila costaban tres idas y vueltas a la base; juntos, una.
  const [todosMedios, ingresosDelDia, egresosDelDia] = await Promise.all([
    listMediosPago({ sucursalId, incluirCuentaCorriente: true }),
    listIngresos({ sucursalId, desde, hasta }),
    listEgresos({ sucursalId, desde, hasta }),
  ]);

  const ccMpIds = new Set(
    todosMedios.filter((m) => m.codigo === "CC").map((m) => m.id),
  );
  const mediosPago = todosMedios.filter((m) => m.codigo !== "CC");

  const egresosPagados = egresosDelDia.filter((item) => item.egreso.pagado);
  const acc = new Map<string, { ingresos: number; egresos: number }>();
  for (const mp of mediosPago) acc.set(mp.id, { ingresos: 0, egresos: 0 });

  // Fiado del día: porción de las ventas cobrada con cuenta corriente (CC),
  // agrupada por cliente. No entra a los totales de caja.
  let fiadoTotal = 0;
  let fiadoCantidad = 0;
  const fiadoPorCliente = new Map<
    string,
    { cliente: Cliente | null; monto: number }
  >();

  for (const row of ingresosDelDia) {
    const mp1 = acc.get(row.ingreso.mp1_id);
    if (mp1) mp1.ingresos += row.ingreso.valor1;
    if (row.ingreso.mp2_id && row.ingreso.valor2 != null) {
      const mp2 = acc.get(row.ingreso.mp2_id);
      if (mp2) mp2.ingresos += row.ingreso.valor2;
    }

    let fiadoRow = 0;
    if (ccMpIds.has(row.ingreso.mp1_id)) fiadoRow += row.ingreso.valor1;
    if (
      row.ingreso.mp2_id &&
      row.ingreso.valor2 != null &&
      ccMpIds.has(row.ingreso.mp2_id)
    ) {
      fiadoRow += row.ingreso.valor2;
    }
    if (fiadoRow > 0) {
      fiadoTotal += fiadoRow;
      fiadoCantidad += 1;
      const key = row.cliente?.id ?? "—";
      const cur = fiadoPorCliente.get(key) ?? {
        cliente: row.cliente,
        monto: 0,
      };
      cur.monto += fiadoRow;
      fiadoPorCliente.set(key, cur);
    }
  }

  for (const row of egresosPagados) {
    const mp = acc.get(row.egreso.mp_id);
    if (mp) mp.egresos += row.egreso.valor;
  }

  // Detalle uno por uno. Se listan TODOS los del día, no sólo los pagados: uno
  // sin pagar no mueve la caja pero igual se cargó hoy, y si está mal cargado
  // hay que poder encontrarlo.
  const egresosDetalle: EgresoDelDia[] = egresosDelDia.map((row) => {
    const rubro = [row.rubro?.rubro, row.rubro?.subrubro]
      .filter(Boolean)
      .join(" · ");
    return {
      id: row.egreso.id,
      fecha: row.egreso.fecha,
      concepto: row.egreso.observacion?.trim() || rubro || "Sin concepto",
      rubro: rubro || "Sin rubro",
      proveedor: row.proveedor?.nombre,
      insumo: row.insumo?.nombre,
      mp: row.mp?.nombre,
      valor: row.egreso.valor,
      pagado: row.egreso.pagado,
    };
  });

  const giftCards = await getGiftCardsDelDia(
    sucursalId,
    new Date(desde),
    new Date(hasta),
  );

  const porMp: ResumenMpRow[] = mediosPago.map((mp) => {
    const totals = acc.get(mp.id) ?? { ingresos: 0, egresos: 0 };
    return {
      mp,
      ingresos: totals.ingresos,
      egresos: totals.egresos,
      neto: totals.ingresos - totals.egresos,
    };
  });

  const totalIngresos = porMp.reduce((sum, row) => sum + row.ingresos, 0);
  const totalEgresos = porMp.reduce((sum, row) => sum + row.egresos, 0);
  const byCodigo = (codigo: string) => {
    const row = porMp.find((item) => item.mp.codigo === codigo);
    return row
      ? { ingresos: row.ingresos, egresos: row.egresos, neto: row.neto }
      : emptyMpTotals();
  };

  const tickets: TicketResumen[] = [];
  const comAcc = new Map<string, { empleado: Empleado; total: number; lineas: number }>();
  let totalComisionesAll = 0;
  let costoInsumosAll = 0;

  for (const row of ingresosDelDia) {
    const breakdown = computeBreakdown(row.ingreso, row.lineas);
    totalComisionesAll += breakdown.comisiones;
    costoInsumosAll += breakdown.costoInsumos;

    const empleadosNombres = new Set<string>();
    for (const linea of row.lineas) {
      if (!linea.empleado) continue;
      empleadosNombres.add(linea.empleado.nombre);
      const current = comAcc.get(linea.empleado.id) ?? {
        empleado: linea.empleado,
        total: 0,
        lineas: 0,
      };
      current.total += linea.comision_monto;
      current.lineas += 1;
      comAcc.set(linea.empleado.id, current);
    }

    tickets.push({
      id: row.ingreso.id,
      fecha: row.ingreso.fecha,
      cliente: row.cliente,
      total: row.ingreso.total,
      comisiones: breakdown.comisiones,
      cantLineas: row.lineas.length,
      empleados: Array.from(empleadosNombres),
    });
  }

  const comisionesPorEmpleado = Array.from(comAcc.values())
    .map((item) => ({
      empleado: item.empleado,
      total: item.total,
      lineas: item.lineas,
      pctDelTotal: totalIngresos > 0 ? (item.total / totalIngresos) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const paraElLocal = totalIngresos - totalComisionesAll;
  const netoNegocio = paraElLocal - costoInsumosAll;

  tickets.sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    fecha,
    sucursal_id: sucursalId,
    porMp,
    totalIngresos,
    totalEgresos,
    totalNeto: totalIngresos - totalEgresos,
    ef: byCodigo("EF"),
    tr: byCodigo("TR"),
    tc: byCodigo("TC"),
    td: byCodigo("TD"),
    cantIngresos: ingresosDelDia.length,
    cantEgresos: egresosPagados.length,
    tickets,
    egresos: egresosDetalle,
    comisionesPorEmpleado,
    totalComisiones: totalComisionesAll,
    costoInsumos: costoInsumosAll,
    paraElLocal,
    netoNegocio,
    fiado: {
      total: fiadoTotal,
      cantidad: fiadoCantidad,
      porCliente: Array.from(fiadoPorCliente.values()).sort(
        (a, b) => b.monto - a.monto,
      ),
    },
    giftCards,
  };
}

/**
 * Movimiento de gift cards del día, leído de gift_card_movimientos.
 *
 * No sale de `ingresos` porque justamente la emisión no escribe ahí: es plata
 * cobrada por un servicio que todavía no se prestó.
 */
async function getGiftCardsDelDia(
  sucursalId: string,
  desde: Date,
  hasta: Date,
): Promise<GiftCardsDelDia> {
  const db = getDb();
  const [row] = await db
    .select({
      vendidas: sql<number>`coalesce(sum(case when ${giftCardMovimientosTable.tipo} = 'emision' then ${giftCardMovimientosTable.monto} else 0 end), 0)`,
      cantidadVendidas: sql<number>`count(*) filter (where ${giftCardMovimientosTable.tipo} = 'emision')`,
      canjeadas: sql<number>`coalesce(-sum(case when ${giftCardMovimientosTable.tipo} = 'canje' then ${giftCardMovimientosTable.monto} else 0 end), 0)`,
      cantidadCanjeadas: sql<number>`count(*) filter (where ${giftCardMovimientosTable.tipo} = 'canje')`,
    })
    .from(giftCardMovimientosTable)
    .innerJoin(
      giftCardsTable,
      eq(giftCardsTable.id, giftCardMovimientosTable.giftCardId),
    )
    .where(
      and(
        eq(giftCardsTable.sucursalId, sucursalId),
        gte(giftCardMovimientosTable.fecha, desde),
        lte(giftCardMovimientosTable.fecha, hasta),
      ),
    );

  const [pasivoRow] = await db
    .select({ total: sql<number>`coalesce(sum(${giftCardsTable.saldo}), 0)` })
    .from(giftCardsTable)
    .where(
      and(
        eq(giftCardsTable.sucursalId, sucursalId),
        eq(giftCardsTable.estado, "activa"),
      ),
    );

  return {
    vendidas: Number(row?.vendidas ?? 0),
    cantidadVendidas: Number(row?.cantidadVendidas ?? 0),
    canjeadas: Number(row?.canjeadas ?? 0),
    cantidadCanjeadas: Number(row?.cantidadCanjeadas ?? 0),
    pasivo: Number(pasivoRow?.total ?? 0),
  };
}

export interface CierreConDetalle {
  cierre: CierreCaja;
  sucursal_nombre: string;
  cerrado_por_nombre: string;
  efectivoContado: number;
  efectivoEsperado: number;
  diferenciaEf: number;
}

function efectivoContadoDe(billetes: Record<string, number>): number {
  return Object.entries(billetes).reduce((acc, [denom, cant]) => {
    const d = Number(denom);
    if (!Number.isFinite(d)) return acc;
    return acc + d * (cant || 0);
  }, 0);
}

function detallarCierre(args: {
  cierre: CierreCaja;
  sucursalNombre: string;
  usuarioNombre: string;
}): CierreConDetalle {
  const efectivoContado = efectivoContadoDe(args.cierre.billetes);
  const efectivoEsperado =
    args.cierre.saldo_inicial_ef +
    args.cierre.ingresos_ef -
    args.cierre.egresos_ef;
  return {
    cierre: args.cierre,
    sucursal_nombre: args.sucursalNombre,
    cerrado_por_nombre: args.usuarioNombre,
    efectivoContado,
    efectivoEsperado,
    diferenciaEf: efectivoContado - efectivoEsperado,
  };
}

export async function listCierres(opts?: {
  sucursalId?: string;
  limit?: number;
}): Promise<CierreConDetalle[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja) return [];
  if (opts?.sucursalId && !isSucursalAllowed(scope, opts.sucursalId)) return [];

  const db = getDb();
  const filters = [inArray(cierresCajaTable.sucursalId, scope.sucursalIdsPermitidas)];
  if (opts?.sucursalId) {
    filters.push(eq(cierresCajaTable.sucursalId, opts.sucursalId));
  }

  const rows = await db
    .select({
      cierre: cierresCajaTable,
      sucursalNombre: sucursalesTable.nombre,
      usuarioNombre: profilesTable.nombre,
    })
    .from(cierresCajaTable)
    .innerJoin(
      sucursalesTable,
      eq(cierresCajaTable.sucursalId, sucursalesTable.id),
    )
    .leftJoin(profilesTable, eq(cierresCajaTable.cerradoPor, profilesTable.userId))
    .where(and(...filters))
    .orderBy(desc(cierresCajaTable.fecha))
    .limit(opts?.limit ?? 100);

  return rows.map((row) =>
    detallarCierre({
      cierre: mapCierre(row.cierre),
      sucursalNombre: row.sucursalNombre,
      usuarioNombre: row.usuarioNombre ?? "Sistema",
    }),
  );
}

/**
 * Cierra automáticamente, en cero, los días ANTERIORES a hoy que no tuvieron
 * ningún movimiento (p. ej. domingos o feriados con el local cerrado).
 *
 * Para no romper el control de efectivo arrastra el saldo y los billetes del
 * último cierre (la caja no se tocó → contado == esperado, diferencia $0).
 * Solo procesa la racha de días vacíos posterior al último cierre y FRENA en el
 * primer día con movimiento: ese requiere cierre manual con conteo real.
 *
 * Devuelve cuántos cierres automáticos creó. Es idempotente y no revalida cache
 * (se llama durante el render de la caja, que ya lee el estado actualizado).
 */
export async function autocerrarDiasSinMovimiento(
  sucursalId: string,
  opts?: { dias?: number },
): Promise<number> {
  const user = await requireUser();
  if (user.rol !== "admin" && user.rol !== "encargada") return 0;
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja || !isSucursalAllowed(scope, sucursalId)) return 0;

  const dias = opts?.dias ?? 60;
  const hoy = todayYMD();
  const ayer = addDaysYMD(hoy, -1);

  // Arranca el día siguiente al último cierre; si nunca cerró, ventana máxima.
  const ultimo = await getUltimoCierreAntesDe(sucursalId, hoy);
  const limiteVentana = addDaysYMD(hoy, -dias);
  let inicio = ultimo ? addDaysYMD(ultimo.cierre.fecha, 1) : limiteVentana;
  if (inicio < limiteVentana) inicio = limiteVentana;
  if (inicio > ayer) return 0;

  const [ingresos, egresos] = await Promise.all([
    listIngresos({ sucursalId, desde: isoStartOfDay(inicio), hasta: isoEndOfDay(ayer) }),
    listEgresos({ sucursalId, desde: isoStartOfDay(inicio), hasta: isoEndOfDay(ayer) }),
  ]);
  const conMovimiento = new Set<string>();
  for (const row of ingresos) conMovimiento.add(isoToLocalYMD(row.ingreso.fecha));
  for (const row of egresos) {
    if (row.egreso.pagado) conMovimiento.add(isoToLocalYMD(row.egreso.fecha));
  }

  // Saldos a arrastrar desde el último cierre (la caja no se movió en días vacíos).
  const saldoInicialEf = ultimo ? ultimo.efectivoContado : 0;
  const saldoBanco = ultimo ? ultimo.cierre.saldo_banco : 0;
  const billetes = ultimo ? ultimo.cierre.billetes : {};

  const db = getDb();
  let creados = 0;
  for (let d = inicio; d <= ayer; d = addDaysYMD(d, 1)) {
    // Día con movimiento → corta: necesita cierre manual con conteo real.
    if (conMovimiento.has(d)) break;

    const [dup] = await db
      .select({ id: cierresCajaTable.id })
      .from(cierresCajaTable)
      .where(
        and(
          eq(cierresCajaTable.sucursalId, sucursalId),
          eq(cierresCajaTable.fecha, d),
        ),
      )
      .limit(1);
    if (dup) continue;

    await db.insert(cierresCajaTable).values({
      id: createId(),
      sucursalId,
      fecha: d,
      saldoInicialEf,
      saldoBanco,
      billetes,
      ingresosEf: 0,
      egresosEf: 0,
      ingresosBanc: 0,
      egresosBanc: 0,
      cobrosTc: 0,
      cobrosTd: 0,
      vouchers: 0,
      giftcards: 0,
      autoconsumos: 0,
      cheques: 0,
      aportes: 0,
      ingresosCc: 0,
      anticipos: 0,
      observacion: "Cierre automático: día sin movimientos",
      cerradoPor: user.id,
      fechaCierre: new Date(),
    });
    creados += 1;
  }

  return creados;
}

/**
 * Devuelve las fechas (YMD, de más vieja a más nueva) de días ANTERIORES a hoy
 * que tuvieron movimientos de caja pero todavía no tienen cierre. Sirve para
 * avisar que quedó una caja sin cerrar (p. ej. se olvidaron ayer) y poder
 * hacer el cierre tardío antes de seguir operando.
 */
export async function getCajasPendientesDeCierre(
  sucursalId: string,
  opts?: { dias?: number },
): Promise<string[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja || !isSucursalAllowed(scope, sucursalId)) return [];

  const dias = opts?.dias ?? 14;
  const hoy = todayYMD();
  const ayer = addDaysYMD(hoy, -1);
  const inicio = addDaysYMD(hoy, -dias);

  const desde = isoStartOfDay(inicio);
  const hasta = isoEndOfDay(ayer);

  const db = getDb();
  const [ingresos, egresos, cierres, aperturas] = await Promise.all([
    listIngresos({ sucursalId, desde, hasta }),
    listEgresos({ sucursalId, desde, hasta }),
    listCierres({ sucursalId }),
    db
      .select({ fecha: aperturasCajaTable.fecha })
      .from(aperturasCajaTable)
      .where(eq(aperturasCajaTable.sucursalId, sucursalId)),
  ]);

  const cerradas = new Set(cierres.map((c) => c.cierre.fecha));
  const pendientes = new Set<string>();

  // 1) Aperturas sin cierre. Esta es la lista que importa: es EXACTAMENTE la
  //    misma condición con la que crearApertura bloquea abrir una caja nueva.
  //    Va sin ventana de días y sin pedir que el día haya tenido movimiento,
  //    porque una caja abierta bloquea igual aunque esté vacía y aunque sea
  //    vieja. Antes esto no se miraba y pasaba lo peor posible: el sistema te
  //    frenaba por una caja que la pantalla no mostraba en ningún lado, y no
  //    había forma de cerrarla.
  for (const a of aperturas) {
    if (!cerradas.has(a.fecha)) pendientes.add(a.fecha);
  }

  // 2) Días que operaron sin haber abierto caja, dentro de la ventana. No
  //    bloquean nada, pero conviene cerrarlos para que el arqueo cuadre.
  if (ayer >= inicio) {
    const conMovimiento = new Set<string>();
    for (const row of ingresos) {
      conMovimiento.add(isoToLocalYMD(row.ingreso.fecha));
    }
    for (const row of egresos) {
      if (row.egreso.pagado) conMovimiento.add(isoToLocalYMD(row.egreso.fecha));
    }
    for (const ymd of conMovimiento) {
      if (ymd >= inicio && ymd <= ayer && !cerradas.has(ymd)) {
        pendientes.add(ymd);
      }
    }
  }

  return [...pendientes].sort();
}

export async function getCierre(cierreId: string): Promise<CierreConDetalle | null> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja) return null;

  const db = getDb();
  const [row] = await db
    .select({
      cierre: cierresCajaTable,
      sucursalNombre: sucursalesTable.nombre,
      usuarioNombre: profilesTable.nombre,
    })
    .from(cierresCajaTable)
    .innerJoin(
      sucursalesTable,
      eq(cierresCajaTable.sucursalId, sucursalesTable.id),
    )
    .leftJoin(profilesTable, eq(cierresCajaTable.cerradoPor, profilesTable.userId))
    .where(eq(cierresCajaTable.id, cierreId))
    .limit(1);

  if (!row) return null;
  if (!scope.sucursalIdsPermitidas.includes(row.cierre.sucursalId)) return null;

  return detallarCierre({
    cierre: mapCierre(row.cierre),
    sucursalNombre: row.sucursalNombre,
    usuarioNombre: row.usuarioNombre ?? "Sistema",
  });
}

export interface CierreCuentaConDetalle {
  linea: CierreCuentaLinea;
  cuenta: CuentaBancaria | null;
}

/**
 * Arqueo por cuenta de un cierre: esperado vs contado (con la diferencia). Vacío
 * para cierres viejos (anteriores a la fase 2) que no guardaron arqueo.
 */
export async function getCierreCuentas(
  cierreId: string,
): Promise<CierreCuentaConDetalle[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja) return [];

  const db = getDb();

  // Confinamiento por sucursal: el arqueo solo se devuelve si el cierre
  // pertenece a una sucursal permitida (defensa en profundidad; este endpoint
  // es invocable directo, no solo desde la página de detalle).
  const [cierre] = await db
    .select({ sucursalId: cierresCajaTable.sucursalId })
    .from(cierresCajaTable)
    .where(eq(cierresCajaTable.id, cierreId))
    .limit(1);
  if (!cierre || !scope.sucursalIdsPermitidas.includes(cierre.sucursalId)) {
    return [];
  }

  const rows = await db
    .select({
      linea: cierreCajaCuentasTable,
      cuenta: cuentasBancariasTable,
    })
    .from(cierreCajaCuentasTable)
    .leftJoin(
      cuentasBancariasTable,
      eq(cierreCajaCuentasTable.cuentaId, cuentasBancariasTable.id),
    )
    .where(eq(cierreCajaCuentasTable.cierreId, cierreId));

  const detalle = rows.map((r) => ({
    linea: {
      id: r.linea.id,
      cierre_id: r.linea.cierreId,
      cuenta_id: r.linea.cuentaId,
      saldo_esperado: r.linea.saldoEsperado,
      saldo_contado: r.linea.saldoContado,
    } satisfies CierreCuentaLinea,
    cuenta: r.cuenta
      ? ({
          id: r.cuenta.id,
          sucursal_id: r.cuenta.sucursalId,
          nombre: r.cuenta.nombre,
          tipo: r.cuenta.tipo,
          activo: r.cuenta.activo,
          observacion: r.cuenta.observacion ?? undefined,
        } satisfies CuentaBancaria)
      : null,
  }));

  // Efectivo primero, después bancos por nombre.
  return detalle.sort((a, b) => {
    const ae = a.cuenta?.tipo === "efectivo" ? 0 : 1;
    const be = b.cuenta?.tipo === "efectivo" ? 0 : 1;
    if (ae !== be) return ae - be;
    return (a.cuenta?.nombre ?? "").localeCompare(b.cuenta?.nombre ?? "");
  });
}

export async function getCierreDeFecha(
  sucursalId: string,
  fecha: string,
): Promise<CierreCaja | null> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja || !isSucursalAllowed(scope, sucursalId)) return null;

  const db = getDb();
  const [row] = await db
    .select()
    .from(cierresCajaTable)
    .where(
      and(
        eq(cierresCajaTable.sucursalId, sucursalId),
        eq(cierresCajaTable.fecha, fecha),
      ),
    )
    .limit(1);

  return row ? mapCierre(row) : null;
}

export async function getUltimoCierreAntesDe(
  sucursalId: string,
  fecha: string,
): Promise<CierreConDetalle | null> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja || !isSucursalAllowed(scope, sucursalId)) return null;

  const db = getDb();
  const [row] = await db
    .select({
      cierre: cierresCajaTable,
      sucursalNombre: sucursalesTable.nombre,
      usuarioNombre: profilesTable.nombre,
    })
    .from(cierresCajaTable)
    .innerJoin(
      sucursalesTable,
      eq(cierresCajaTable.sucursalId, sucursalesTable.id),
    )
    .leftJoin(profilesTable, eq(cierresCajaTable.cerradoPor, profilesTable.userId))
    .where(
      and(
        eq(cierresCajaTable.sucursalId, sucursalId),
        lt(cierresCajaTable.fecha, fecha),
      ),
    )
    .orderBy(desc(cierresCajaTable.fecha))
    .limit(1);

  if (!row) return null;
  return detallarCierre({
    cierre: mapCierre(row.cierre),
    sucursalNombre: row.sucursalNombre,
    usuarioNombre: row.usuarioNombre ?? "Sistema",
  });
}

export interface SugerenciasArrastre {
  saldoInicialEf: number;
  saldoInicialBanco: number;
  desdeCierre: { id: string; fecha: string } | null;
}

export async function getSugerenciasArrastre(
  sucursalId: string,
  fecha: string,
): Promise<SugerenciasArrastre> {
  const ultimo = await getUltimoCierreAntesDe(sucursalId, fecha);
  if (!ultimo) {
    return {
      saldoInicialEf: 0,
      saldoInicialBanco: 0,
      desdeCierre: null,
    };
  }
  return {
    saldoInicialEf: ultimo.efectivoContado,
    saldoInicialBanco: ultimo.cierre.saldo_banco,
    desdeCierre: { id: ultimo.cierre.id, fecha: ultimo.cierre.fecha },
  };
}

export async function getCierreQueBloqueaFecha(
  sucursalId: string,
  fechaIso: string,
): Promise<CierreCaja | null> {
  await requireUser();
  return getCierreDeFecha(sucursalId, fechaIso.slice(0, 10));
}

export async function reabrirCierre(
  cierreId: string,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string[]> }> {
  const user = await requireRole(["admin"]);
  const scope = buildAccessScope(user);
  const db = getDb();
  const [cierre] = await db
    .select()
    .from(cierresCajaTable)
    .where(eq(cierresCajaTable.id, cierreId))
    .limit(1);

  if (!cierre) {
    return { ok: false, errors: { _: ["Cierre no encontrado"] } };
  }
  if (!scope.sucursalIdsPermitidas.includes(cierre.sucursalId)) {
    return { ok: false, errors: { _: ["No tienes acceso a ese cierre"] } };
  }

  await db.delete(cierresCajaTable).where(eq(cierresCajaTable.id, cierreId));
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  return { ok: true };
}

export type CreateCierreResult =
  | { ok: true; cierreId: string }
  | { ok: false; errors: Record<string, string[]> };

export async function createCierre(
  _prev: CreateCierreResult | null,
  formData: FormData,
): Promise<CreateCierreResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);

  const billetes: Record<string, number> = {};
  for (const denom of DENOMINACIONES_ARS) {
    const raw = formData.get(`billete_${denom}`);
    const cantidad = typeof raw === "string" && raw !== "" ? Number(raw) : 0;
    if (Number.isFinite(cantidad) && cantidad > 0) {
      billetes[String(denom)] = Math.floor(cantidad);
    }
  }

  const parsed = cierreCajaSchema.safeParse({
    sucursal_id: formData.get("sucursal_id"),
    fecha: formData.get("fecha"),
    saldo_inicial_ef: formData.get("saldo_inicial_ef") ?? 0,
    saldo_banco: formData.get("saldo_banco") ?? 0,
    billetes,
    vouchers: formData.get("vouchers") ?? 0,
    giftcards: formData.get("giftcards") ?? 0,
    autoconsumos: formData.get("autoconsumos") ?? 0,
    cheques: formData.get("cheques") ?? 0,
    aportes: formData.get("aportes") ?? 0,
    ingresos_cc: formData.get("ingresos_cc") ?? 0,
    anticipos: formData.get("anticipos") ?? 0,
    observacion: formData.get("observacion"),
  });

  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }
  const data = parsed.data;

  if (!isSucursalAllowed(scope, data.sucursal_id)) {
    return {
      ok: false,
      errors: { sucursal_id: ["No tienes acceso a esa sucursal"] },
    };
  }

  const db = getDb();
  const resumen = await getResumenDelDia(data.sucursal_id, data.fecha);

  // Separamos efectivo (por cuenta, no por código) del resto de los medios.
  // El efectivo es lo que importa para conciliar la caja; el resto se guarda
  // junto en "banco" para que el snapshot conserve el total del día.
  const efectivoCuentaIds = await getEfectivoCuentaIds(data.sucursal_id);
  let ingresosEf = 0;
  let egresosEf = 0;
  let ingresosResto = 0;
  let egresosResto = 0;
  for (const row of resumen.porMp) {
    const esEfectivo =
      row.mp.cuenta_id != null && efectivoCuentaIds.has(row.mp.cuenta_id);
    if (esEfectivo) {
      ingresosEf += row.ingresos;
      egresosEf += row.egresos;
    } else {
      ingresosResto += row.ingresos;
      egresosResto += row.egresos;
    }
  }

  // Si la caja se abrió ese día, el saldo inicial del cierre toma lo declarado
  // en la apertura (efectivo y bancos por separado). Si no, queda en lo enviado.
  let saldoInicialEf = data.saldo_inicial_ef;
  let saldoBanco = data.saldo_banco;
  const apertura = await getAperturaDeFecha(data.sucursal_id, data.fecha);
  if (apertura) {
    let efApertura = 0;
    let bancoApertura = 0;
    for (const linea of apertura.cuentas) {
      if (efectivoCuentaIds.has(linea.cuenta_id)) {
        efApertura += linea.saldo_declarado;
      } else {
        bancoApertura += linea.saldo_declarado;
      }
    }
    saldoInicialEf = efApertura;
    saldoBanco = bancoApertura;
  }

  const cierreId = createId();

  // Arqueo por cuenta: lo esperado es el saldo actual de cada cuenta; lo contado
  // lo carga el usuario (form: contado_<cuentaId>). Si no lo carga, se asume que
  // coincide con lo esperado. La diferencia se guarda como dato; no toca saldos.
  const saldosCuentas = await getSugerenciasApertura(data.sucursal_id);

  try {
    await db.transaction(async (tx) => {
      const [dup] = await tx
        .select({ id: cierresCajaTable.id })
        .from(cierresCajaTable)
        .where(
          and(
            eq(cierresCajaTable.sucursalId, data.sucursal_id),
            eq(cierresCajaTable.fecha, data.fecha),
          ),
        )
        .limit(1);
      if (dup) throw new Error("DUP_CIERRE");

      await tx.insert(cierresCajaTable).values({
        id: cierreId,
        sucursalId: data.sucursal_id,
        fecha: data.fecha,
      saldoInicialEf,
      saldoBanco,
      billetes: data.billetes,
      ingresosEf,
      egresosEf,
      ingresosBanc: ingresosResto,
      egresosBanc: egresosResto,
      cobrosTc: 0,
      cobrosTd: 0,
      vouchers: data.vouchers,
      giftcards: data.giftcards,
      autoconsumos: data.autoconsumos,
      cheques: data.cheques,
      aportes: data.aportes,
      ingresosCc: data.ingresos_cc,
      anticipos: data.anticipos,
      observacion: data.observacion ?? null,
      cerradoPor: user.id,
      fechaCierre: new Date(),
    });

    for (const sug of saldosCuentas) {
      const raw = formData.get(`contado_${sug.cuenta.id}`);
      const contado =
        typeof raw === "string" && raw !== "" ? Number(raw) : sug.esperado;
      if (!Number.isFinite(contado)) continue;
      await tx.insert(cierreCajaCuentasTable).values({
        id: createId(),
        cierreId,
        cuentaId: sug.cuenta.id,
        saldoEsperado: sug.esperado,
        saldoContado: contado,
      });
    }
  });
  } catch (err) {
    if (err instanceof Error && err.message === "DUP_CIERRE") {
      return { ok: false, errors: { fecha: ["Ya existe un cierre para esta fecha y sucursal"] } };
    }
    throw err;
  }

  revalidatePath("/caja");
  revalidatePath("/dashboard");
  return { ok: true, cierreId };
}
