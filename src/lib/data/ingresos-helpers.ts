/**
 * Funciones puras para el cálculo financiero de ingresos.
 * Sin "use server" para poder usarse desde server components y otros sitios.
 */
import type {
  Cliente,
  Empleado,
  Ingreso,
  IngresoLinea,
  Insumo,
  MedioPago,
  MotivoDescuento,
  Receta,
  Servicio,
} from "@/lib/types";

/**
 * Desglose financiero de un ingreso.
 *
 * - total        : lo que paga el cliente (después de descuento)
 * - comisiones   : suma de comision_monto de cada línea (lo que va al equipo)
 * - costoInsumos : costo de los insumos consumidos según receta de cada servicio
 * - neto         : total − comisiones − costoInsumos = lo que queda para el negocio
 */
export interface IngresoBreakdown {
  total: number;
  comisiones: number;
  costoInsumos: number;
  neto: number;
}

// ───────────────────────── Cálculo financiero de una venta ─────────────────────────
// Funciones puras compartidas entre la creación de la venta (createIngreso) y los
// tests. Replican exactamente la lógica original que vivía inline en createIngreso.

export interface DescuentoCalc {
  subtotal: number;
  descuentoMonto: number;
  descuentoPct: number;
  totalNeto: number;
}

/**
 * Subtotal de líneas, monto y porcentaje de descuento, y total neto (antes de
 * recargos de medio de pago).
 * - descuento_tipo "pct"  → monto = subtotal × (valor / 100)
 * - descuento_tipo "monto"→ pct derivado = (valor / subtotal) × 100
 */
export function computeDescuento(args: {
  subtotal: number;
  descuentoTipo: "pct" | "monto";
  descuentoValor: number;
}): DescuentoCalc {
  const { subtotal, descuentoTipo, descuentoValor } = args;
  const descuentoMonto =
    descuentoTipo === "pct" ? subtotal * (descuentoValor / 100) : descuentoValor;
  const descuentoPct =
    descuentoTipo === "pct"
      ? descuentoValor
      : subtotal > 0
        ? (descuentoValor / subtotal) * 100
        : 0;
  return { subtotal, descuentoMonto, descuentoPct, totalNeto: subtotal - descuentoMonto };
}

export interface RecargoCalc {
  recargo1: number;
  recargo2: number;
  valor1Cobrado: number;
  valor2Cobrado: number | null;
  total: number;
}

/**
 * Recargos por medio de pago (ej. tarjeta) sobre la porción cobrada con cada
 * medio, y total efectivamente pagado por el cliente (neto + recargos).
 */
export function computeRecargos(args: {
  totalNeto: number;
  mp1Id: string;
  valor1: number;
  mp2Id?: string;
  valor2?: number | null;
  recargoPctById: Map<string, number>;
}): RecargoCalc {
  const { totalNeto, mp1Id, valor1, mp2Id, valor2, recargoPctById } = args;
  const recargo1 = valor1 * ((recargoPctById.get(mp1Id) ?? 0) / 100);
  const recargo2 =
    mp2Id && valor2 != null
      ? valor2 * ((recargoPctById.get(mp2Id) ?? 0) / 100)
      : 0;
  return {
    recargo1,
    recargo2,
    valor1Cobrado: valor1 + recargo1,
    valor2Cobrado: valor2 != null ? valor2 + recargo2 : null,
    total: totalNeto + recargo1 + recargo2,
  };
}

/**
 * Comisión de una línea de servicio. La única variable es si el descuento del
 * ticket baja o no la comisión:
 * - soporta_descuento = true  → sobre el precio de la línea menos su parte del descuento
 * - soporta_descuento = false → sobre el precio de la línea, sin el descuento
 *
 * Los dos casos parten del precio al que se cargó el servicio. Antes el segundo
 * caso iba a buscar servicios.precio_lista, y eso estaba mal: en este salón
 * precio_lista no es "el precio antes del descuento", es la OTRA columna de
 * precio, la de tarjeta. Cambiar el criterio cambiaba de columna. Se vio en una
 * venta de $215.000 SIN descuento donde la comisión salió $60.000 en vez de
 * $64.500, porque el servicio tenía precio_lista $200.000.
 */
export function comisionMontoServicio(args: {
  precioEfectivo: number;
  comisionPct: number;
  soportaDescuento: boolean;
  subtotal: number;
  descuentoMonto: number;
}): number {
  const { precioEfectivo, comisionPct, soportaDescuento, subtotal, descuentoMonto } =
    args;
  const descProrrateado =
    subtotal > 0 ? descuentoMonto * (precioEfectivo / subtotal) : 0;
  const base = soportaDescuento ? precioEfectivo - descProrrateado : precioEfectivo;
  return base * (comisionPct / 100);
}

export interface IngresoLineaConDetalle extends IngresoLinea {
  servicio: Servicio | null;
  insumo: Insumo | null;
  empleado: Empleado | null;
  costoInsumos: number;
}

export interface IngresoConDetalle {
  ingreso: Ingreso;
  cliente: Cliente | null;
  mp1: MedioPago | null;
  mp2: MedioPago | null;
  lineas: IngresoLineaConDetalle[];
  breakdown: IngresoBreakdown;
}

interface IngresoLookups {
  serviciosById: Map<string, Servicio>;
  insumosById: Map<string, Insumo>;
  empleadosById: Map<string, Empleado>;
  costoInsumosByServicio: Map<string, number>;
}

/**
 * Las recetas son por sucursal, así que el costo de un servicio depende de la
 * sede. El mapa se keyea por (sucursal, servicio) para no mezclar costos entre
 * sucursales al reportar ventas de varias sedes a la vez.
 */
export function costoServicioKey(sucursalId: string, servicioId: string): string {
  return `${sucursalId}::${servicioId}`;
}

export function buildCostoInsumosByServicio(
  recetas: Receta[],
  insumos: Insumo[],
): Map<string, number> {
  const insumosById = new Map(insumos.map((item) => [item.id, item]));
  const costoByServicio = new Map<string, number>();

  for (const receta of recetas) {
    const insumo = insumosById.get(receta.insumo_id);
    if (!insumo || insumo.precio_unitario == null) continue;
    const key = costoServicioKey(receta.sucursal_id, receta.servicio_id);
    costoByServicio.set(
      key,
      (costoByServicio.get(key) ?? 0) + receta.cantidad * insumo.precio_unitario,
    );
  }

  return costoByServicio;
}

export function costoInsumosDeServicio(
  sucursalId: string,
  servicioId: string,
  costoInsumosByServicio: Map<string, number>,
): number {
  return costoInsumosByServicio.get(costoServicioKey(sucursalId, servicioId)) ?? 0;
}

export function computeBreakdown(
  ingreso: Ingreso,
  lineas: Array<IngresoLineaConDetalle>,
): IngresoBreakdown {
  const comisiones = lineas.reduce((acc, linea) => acc + linea.comision_monto, 0);
  const costoInsumos = lineas.reduce((acc, linea) => acc + linea.costoInsumos, 0);

  return {
    total: ingreso.total,
    comisiones,
    costoInsumos,
    neto: ingreso.total - comisiones - costoInsumos,
  };
}

export function detallarLineas(
  lineas: IngresoLinea[],
  lookups: IngresoLookups,
  sucursalId: string,
): IngresoLineaConDetalle[] {
  return lineas.map((linea) => {
    const servicio = linea.servicio_id
      ? (lookups.serviciosById.get(linea.servicio_id) ?? null)
      : null;
    const insumo = linea.insumo_id
      ? (lookups.insumosById.get(linea.insumo_id) ?? null)
      : null;
    const empleado = linea.empleado_id
      ? (lookups.empleadosById.get(linea.empleado_id) ?? null)
      : null;

    let costoInsumos = 0;
    if (linea.servicio_id) {
      costoInsumos =
        costoInsumosDeServicio(
          sucursalId,
          linea.servicio_id,
          lookups.costoInsumosByServicio,
        ) * linea.cantidad;
    } else if (insumo && insumo.precio_unitario != null) {
      // Para productos vendidos, el "costo" del local es el precio unitario × cantidad
      costoInsumos = insumo.precio_unitario * linea.cantidad;
    }

    return {
      ...linea,
      servicio,
      insumo,
      empleado,
      costoInsumos,
    };
  });
}

export interface AggregatedTotals {
  cantidad: number;
  ventaTeorica: number;
  descuentos: number;
  total: number;
  comisiones: number;
  costoInsumos: number;
  neto: number;
}

export function aggregate(rows: IngresoConDetalle[]): AggregatedTotals {
  const ventaTeorica = rows.reduce(
    (acc, row) => acc + row.ingreso.subtotal,
    0,
  );
  const descuentos = rows.reduce(
    (acc, row) => acc + row.ingreso.descuento_monto,
    0,
  );
  const total = rows.reduce((acc, row) => acc + row.breakdown.total, 0);
  const comisiones = rows.reduce(
    (acc, row) => acc + row.breakdown.comisiones,
    0,
  );
  const costoInsumos = rows.reduce(
    (acc, row) => acc + row.breakdown.costoInsumos,
    0,
  );
  const neto = total - comisiones - costoInsumos;
  return {
    cantidad: rows.length,
    ventaTeorica,
    descuentos,
    total,
    comisiones,
    costoInsumos,
    neto,
  };
}

/**
 * Descuentos acumulados por motivo para una lista de ingresos.
 * Los descuentos sin motivo asignado (datos viejos) caen en "Sin motivo".
 */
export function descuentosPorMotivo(
  rows: IngresoConDetalle[],
  motivosById: Map<string, MotivoDescuento>,
): Array<{ motivo: string; total: number; cantidad: number }> {
  const acc = new Map<string, { motivo: string; total: number; cantidad: number }>();

  for (const row of rows) {
    if (row.ingreso.descuento_monto <= 0) continue;
    const motivoId = row.ingreso.descuento_motivo_id;
    const key = motivoId ?? "__sin__";
    const nombre = motivoId
      ? (motivosById.get(motivoId)?.nombre ?? "Motivo eliminado")
      : "Sin motivo";
    const cur = acc.get(key) ?? { motivo: nombre, total: 0, cantidad: 0 };
    cur.total += row.ingreso.descuento_monto;
    cur.cantidad += 1;
    acc.set(key, cur);
  }

  return Array.from(acc.values()).sort((a, b) => b.total - a.total);
}

/**
 * Comisiones agrupadas por empleado para una lista de ingresos.
 */
export function comisionesPorEmpleado(
  rows: IngresoConDetalle[],
): Array<{ empleado: Empleado; total: number; lineas: number }> {
  const acc = new Map<
    string,
    { empleado: Empleado; total: number; lineas: number }
  >();

  for (const row of rows) {
    for (const linea of row.lineas) {
      if (!linea.empleado) continue;
      const cur = acc.get(linea.empleado.id) ?? {
        empleado: linea.empleado,
        total: 0,
        lineas: 0,
      };
      cur.total += linea.comision_monto;
      cur.lineas += 1;
      acc.set(linea.empleado.id, cur);
    }
  }

  return Array.from(acc.values()).sort((a, b) => b.total - a.total);
}

export interface RendimientoEmpleadoRow {
  empleadoId: string;
  nombre: string;
  servicios: number;
  facturado: number;
  comisiones: number;
  costoInsumos: number;
  netoNegocio: number;
}

export interface RendimientoEmpleadoTotals {
  servicios: number;
  facturado: number;
  comisiones: number;
  costoInsumos: number;
  netoNegocio: number;
}

export interface SemanaProfesionalRow {
  empleadoId: string;
  nombre: string;
  servicios: number;
  facturado: number;
  promedioServicio: number;
}

export interface SemanaProfesionalGroup {
  key: string;
  desde: string;
  hasta: string;
  rows: SemanaProfesionalRow[];
  totals: {
    servicios: number;
    facturado: number;
    promedioServicio: number;
  };
}

function parseYmdUtc(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0));
}

function formatYmdUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekRangeFromYmd(ymd: string) {
  const base = parseYmdUtc(ymd);
  const day = base.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(base);
  start.setUTCDate(start.getUTCDate() + diffToMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    key: formatYmdUtc(start),
    desde: formatYmdUtc(start),
    hasta: formatYmdUtc(end),
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildFacturadoPorLineaMap(
  row: IngresoConDetalle,
  promoPriceById?: Map<string, number>,
): Map<string, number> {
  const amounts = new Map<string, number>();

  for (const linea of row.lineas) {
    amounts.set(linea.id, linea.subtotal);
  }

  if (!promoPriceById || promoPriceById.size === 0) {
    return amounts;
  }

  const groupedByPromo = new Map<string, IngresoLineaConDetalle[]>();
  for (const linea of row.lineas) {
    if (!linea.promo_servicio_id) continue;
    const current = groupedByPromo.get(linea.promo_servicio_id) ?? [];
    current.push(linea);
    groupedByPromo.set(linea.promo_servicio_id, current);
  }

  for (const [promoId, promoLineas] of groupedByPromo.entries()) {
    const promoTotal = promoPriceById.get(promoId);
    if (promoTotal == null) continue;

    const totalWeight = promoLineas.reduce(
      (sum, linea) => sum + (linea.servicio?.precio_lista ?? linea.subtotal),
      0,
    );
    if (totalWeight <= 0) continue;

    let allocated = 0;
    promoLineas.forEach((linea, index) => {
      const weight = linea.servicio?.precio_lista ?? linea.subtotal;
      const isLast = index === promoLineas.length - 1;
      const amount = isLast
        ? roundMoney(promoTotal - allocated)
        : roundMoney((promoTotal * weight) / totalWeight);
      amounts.set(linea.id, amount);
      allocated += amount;
    });
  }

  return amounts;
}

export function rendimientoPorEmpleado(
  rows: IngresoConDetalle[],
  opts?: {
    empleadoIds?: string[];
    promoPriceById?: Map<string, number>;
  },
): RendimientoEmpleadoRow[] {
  const allowedIds = opts?.empleadoIds ? new Set(opts.empleadoIds) : null;
  const acc = new Map<string, RendimientoEmpleadoRow>();

  for (const row of rows) {
    const facturadoPorLinea = buildFacturadoPorLineaMap(
      row,
      opts?.promoPriceById,
    );
    for (const linea of row.lineas) {
      if (!linea.empleado) continue;
      if (allowedIds && !allowedIds.has(linea.empleado.id)) continue;
      const facturadoLinea =
        facturadoPorLinea.get(linea.id) ?? linea.subtotal;
      const entry = acc.get(linea.empleado.id) ?? {
        empleadoId: linea.empleado.id,
        nombre: linea.empleado.nombre,
        servicios: 0,
        facturado: 0,
        comisiones: 0,
        costoInsumos: 0,
        netoNegocio: 0,
      };
      // Solo las líneas de servicio cuentan como servicios hechos. Una venta de
      // producto con vendedora asignada suma facturado y comisión, pero no es
      // un servicio: contar 3 shampoos como 3 servicios infla la columna.
      if (!linea.insumo) entry.servicios += linea.cantidad;
      entry.facturado += facturadoLinea;
      entry.comisiones += linea.comision_monto;
      entry.costoInsumos += linea.costoInsumos;
      entry.netoNegocio =
        entry.facturado - entry.comisiones - entry.costoInsumos;
      acc.set(linea.empleado.id, entry);
    }
  }

  return Array.from(acc.values()).sort((a, b) => b.facturado - a.facturado);
}

export function totalesRendimientoPorEmpleado(
  rows: RendimientoEmpleadoRow[],
): RendimientoEmpleadoTotals {
  return rows.reduce(
    (acc, row) => ({
      servicios: acc.servicios + row.servicios,
      facturado: acc.facturado + row.facturado,
      comisiones: acc.comisiones + row.comisiones,
      costoInsumos: acc.costoInsumos + row.costoInsumos,
      netoNegocio: acc.netoNegocio + row.netoNegocio,
    }),
    {
      servicios: 0,
      facturado: 0,
      comisiones: 0,
      costoInsumos: 0,
      netoNegocio: 0,
    },
  );
}

export function resumenSemanalPorProfesional(
  rows: IngresoConDetalle[],
  opts?: {
    empleadoIds?: string[];
    desde?: string;
    hasta?: string;
    promoPriceById?: Map<string, number>;
  },
): SemanaProfesionalGroup[] {
  const allowedIds = opts?.empleadoIds ? new Set(opts.empleadoIds) : null;
  const weekly = new Map<
    string,
    {
      desde: string;
      hasta: string;
      empleados: Map<string, SemanaProfesionalRow>;
    }
  >();

  const ensureWeek = (ymd: string) => {
    const week = getWeekRangeFromYmd(ymd);
    if (!weekly.has(week.key)) {
      weekly.set(week.key, {
        desde: week.desde,
        hasta: week.hasta,
        empleados: new Map<string, SemanaProfesionalRow>(),
      });
    }
    return week;
  };

  for (const row of rows) {
    const fecha = row.ingreso.fecha.slice(0, 10);
    const week = ensureWeek(fecha);
    const weekEntry = weekly.get(week.key)!;
    const facturadoPorLinea = buildFacturadoPorLineaMap(
      row,
      opts?.promoPriceById,
    );

    for (const linea of row.lineas) {
      if (!linea.empleado) continue;
      if (allowedIds && !allowedIds.has(linea.empleado.id)) continue;
      const facturadoLinea =
        facturadoPorLinea.get(linea.id) ?? linea.subtotal;
      const employeeEntry = weekEntry.empleados.get(linea.empleado.id) ?? {
        empleadoId: linea.empleado.id,
        nombre: linea.empleado.nombre,
        servicios: 0,
        facturado: 0,
        promedioServicio: 0,
      };
      employeeEntry.servicios += linea.cantidad;
      employeeEntry.facturado += facturadoLinea;
      employeeEntry.promedioServicio =
        employeeEntry.servicios > 0
          ? employeeEntry.facturado / employeeEntry.servicios
          : 0;
      weekEntry.empleados.set(linea.empleado.id, employeeEntry);
    }

    weekly.set(week.key, weekEntry);
  }

  if (opts?.desde && opts?.hasta) {
    const cursor = parseYmdUtc(getWeekRangeFromYmd(opts.desde).desde);
    const end = parseYmdUtc(getWeekRangeFromYmd(opts.hasta).desde);
    while (cursor <= end) {
      ensureWeek(formatYmdUtc(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  return Array.from(weekly.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, group]) => {
      const sortedRows = Array.from(group.empleados.values()).sort(
        (a, b) => b.facturado - a.facturado,
      );
      const totalServicios = sortedRows.reduce((sum, row) => sum + row.servicios, 0);
      const totalFacturado = sortedRows.reduce((sum, row) => sum + row.facturado, 0);
      return {
        key,
        desde: group.desde,
        hasta: group.hasta,
        rows: sortedRows,
        totals: {
          servicios: totalServicios,
          facturado: totalFacturado,
          promedioServicio:
            totalServicios > 0 ? totalFacturado / totalServicios : 0,
        },
      };
    });
}
