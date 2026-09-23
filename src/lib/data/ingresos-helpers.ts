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
 * Comisión de una línea de servicio.
 *
 * La base es el PRECIO EN EFECTIVO del servicio en el catálogo, no lo que se
 * cobró. Cada servicio tiene dos precios —efectivo y lista— y la diferencia
 * entre ellos es el recargo por pagar con tarjeta, que es un costo del local:
 * si la comisión saliera de lo cobrado, cuando la clienta paga con tarjeta la
 * empleada se llevaría además el 30% de ese recargo. El salón lo dijo así:
 * "siempre el 30% sobre precio de efectivo", y "precio efectivo" es la columna
 * del catálogo, no "lo que efectivamente se cobró".
 *
 * Dos excepciones, las dos por el mismo motivo —ahí el precio más bajo no es un
 * recargo de menos, es el precio acordado—:
 * - Promos: la línea vale una fracción del precio de la promo. Con el precio de
 *   catálogo se pagaría comisión sobre un precio que nadie cobró.
 * - Servicios sin precio de catálogo disponible: se cae a lo cobrado.
 *
 * Y el descuento del ticket baja la base sólo si la empleada lo absorbe
 * (soporta_descuento), que es la regla general del salón.
 */
export function comisionMontoServicio(args: {
  /** Lo que se cobró por esta línea. Define cuánto del descuento le toca. */
  precioCobrado: number;
  /** Precio en efectivo del servicio en el catálogo: la base de la comisión. */
  precioEfectivoServicio?: number;
  /** Las líneas que vienen de una promo comisionan sobre lo cobrado. */
  esDePromo: boolean;
  comisionPct: number;
  soportaDescuento: boolean;
  subtotal: number;
  descuentoMonto: number;
}): number {
  const {
    precioCobrado,
    precioEfectivoServicio,
    esDePromo,
    comisionPct,
    soportaDescuento,
    subtotal,
    descuentoMonto,
  } = args;
  const baseCatalogo =
    esDePromo || precioEfectivoServicio == null
      ? precioCobrado
      : precioEfectivoServicio;
  // El descuento se aplica como TASA sobre la base, no como monto absoluto.
  //
  // Importa cuando la línea se cobró a precio de lista: ahí el descuento en
  // pesos está calculado sobre el precio de tarjeta, así que restárselo al
  // precio en efectivo le descontaría a la empleada el recargo dos veces. Con
  // un servicio de lista $190.000 / efectivo $152.000 y 35% off, la base
  // correcta es $98.800 (152.000 menos su 35%), no $85.500.
  //
  // Cuando la línea se cobró al precio en efectivo las dos formas dan idéntico,
  // que es el caso más común.
  const tasaDescuento = subtotal > 0 ? descuentoMonto / subtotal : 0;
  const base = soportaDescuento
    ? baseCatalogo * (1 - tasaDescuento)
    : baseCatalogo;
  // Un descuento grande sobre un ticket de varias líneas puede dejar la base en
  // negativo; la comisión es cero, no una deuda de la empleada.
  return Math.max(0, base) * (comisionPct / 100);
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
