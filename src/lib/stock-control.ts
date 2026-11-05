/**
 * Cuentas del control de stock: conteo, reporte del período y lista para
 * comprar. Aparte de las acciones para poder testearlas sin base.
 *
 * Todo sale del libro de movimientos. El stock de un momento pasado se obtiene
 * deshaciendo, desde el stock actual, los movimientos posteriores: así el
 * conteo se compara con lo que había CUANDO se contó, aunque se cargue a la
 * noche con las ventas del día ya descontadas.
 */
import type { SaldoStock, UbicacionStock } from "./stock-ubicacion";
import type { TipoMovimientoStock } from "./types";

/**
 * Si se ven conteo, reporte y lista para comprar en la sucursal. Apagado
 * (sucursales.control_stock_habilitado), solo lo ven los emails de
 * MALALA_PREVIEW_EMAILS (separados por coma), para revisarlo en producción
 * antes de entregarlo. No alcanza con ser superadmin: la dueña también lo es.
 */
export function controlStockVisible(
  user: { email: string },
  sucursal: { control_stock_habilitado?: boolean } | null | undefined,
  previewEmails: string | undefined = process.env.MALALA_PREVIEW_EMAILS,
): boolean {
  if (sucursal?.control_stock_habilitado) return true;
  const email = user.email.trim().toLowerCase();
  return (previewEmails ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .some((e) => e !== "" && e === email);
}

export interface MovimientoCalculo {
  insumo_id: string;
  tipo: TipoMovimientoStock;
  /** Con signo: entrada positiva, salida negativa. En reposición, lo que pasó a la góndola. */
  cantidad: number;
  ref_tipo?: string | null;
  ubicacion?: UbicacionStock | null;
  /** ISO. */
  fecha: string;
}

function redondear(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** El saldo antes de un movimiento, a partir del saldo después. */
function deshacer(s: SaldoStock, m: MovimientoCalculo): SaldoStock {
  // La reposición no cambia el total: pasó del depósito a la góndola.
  if (m.tipo === "reposicion") {
    return { cantidad: s.cantidad, deposito: redondear(s.deposito + m.cantidad) };
  }
  return {
    cantidad: redondear(s.cantidad - m.cantidad),
    deposito:
      m.ubicacion === "deposito"
        ? Math.max(0, redondear(s.deposito - m.cantidad))
        : s.deposito,
  };
}

/**
 * Lo que había en un momento: el saldo actual menos lo que se movió después.
 * `movimientos` son los del insumo; los anteriores al instante se ignoran.
 */
export function saldoEnMomento(
  actual: SaldoStock,
  movimientos: MovimientoCalculo[],
  instante: string,
): SaldoStock {
  const t = new Date(instante).getTime();
  // Del último al primero: el depósito no baja de cero, y deshacer en otro
  // orden lo recortaría en el medio.
  const posteriores = movimientos
    .map((m) => ({ m, t: new Date(m.fecha).getTime() }))
    .filter((x) => x.t > t)
    .sort((a, b) => b.t - a.t);
  let s = actual;
  for (const { m } of posteriores) s = deshacer(s, m);
  return s;
}

// --- Conteo ------------------------------------------------------------------

export interface InsumoConteo {
  tipo: "bacha" | "venta";
  tamano_envase: number;
  precio_unitario?: number | null;
}

/**
 * Lo contado, en ENVASES (los abiertos como fracción: medio pomo = 0,5).
 * En reventa, depósito y exhibición por separado; el que no se contó queda
 * como estaba.
 */
export interface EntradaConteo {
  envases?: number | null;
  deposito?: number | null;
  exhibicion?: number | null;
}

export interface ResultadoConteo {
  /** En unidad base. */
  contado: SaldoStock;
  /** Contado − sistema, en unidad base. */
  diferencia: number;
  diferenciaDeposito: number;
  diferenciaExhibicion: number;
  /** La diferencia a costo. */
  valor: number;
}

function hayNumero(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** null si no se cargó nada para el insumo. */
export function calcularConteo(
  insumo: InsumoConteo,
  sistema: SaldoStock,
  entrada: EntradaConteo,
): ResultadoConteo | null {
  const factor = insumo.tamano_envase > 0 ? insumo.tamano_envase : 1;
  let contado: SaldoStock;
  if (insumo.tipo === "venta") {
    if (!hayNumero(entrada.deposito) && !hayNumero(entrada.exhibicion)) return null;
    const deposito = hayNumero(entrada.deposito)
      ? redondear(entrada.deposito * factor)
      : sistema.deposito;
    const exhibicion = hayNumero(entrada.exhibicion)
      ? redondear(entrada.exhibicion * factor)
      : redondear(sistema.cantidad - sistema.deposito);
    contado = { cantidad: redondear(deposito + exhibicion), deposito };
  } else {
    if (!hayNumero(entrada.envases)) return null;
    // Los de bacha no tienen depósito: se cuentan en total.
    contado = { cantidad: redondear(entrada.envases * factor), deposito: 0 };
  }
  const diferencia = redondear(contado.cantidad - sistema.cantidad);
  const diferenciaDeposito =
    insumo.tipo === "venta" ? redondear(contado.deposito - sistema.deposito) : 0;
  return {
    contado,
    diferencia,
    diferenciaDeposito,
    diferenciaExhibicion: redondear(diferencia - diferenciaDeposito),
    valor: diferencia * (insumo.precio_unitario ?? 0),
  };
}

export function validarEntradaConteo(entrada: EntradaConteo): string | null {
  for (const v of [entrada.envases, entrada.deposito, entrada.exhibicion]) {
    if (v === null || v === undefined) continue;
    if (!Number.isFinite(v)) return "Hay un valor que no es un número";
    if (v < 0) return "Lo contado no puede ser negativo";
  }
  return null;
}

// --- Reporte del período -------------------------------------------------------

export type ConceptoStock =
  | "compras"
  /** Lo que gastaron las recetas de los servicios (insumos de bacha). */
  | "consumo"
  /** Productos vendidos (reventa). */
  | "ventas"
  | "uso_interno"
  /** Diferencias de conteo. */
  | "conteo"
  /** Ajustes manuales y transferencias. */
  | "otros";

export const CONCEPTO_LABEL: Record<ConceptoStock, string> = {
  compras: "Compras",
  consumo: "Consumo en servicios",
  ventas: "Ventas",
  uso_interno: "Uso interno",
  conteo: "Diferencias de conteo",
  otros: "Otros ajustes",
};

/**
 * A qué columna del reporte va un movimiento. null = no cambia el total
 * (reposición: del depósito a la góndola).
 *
 * Las devoluciones van con lo que devuelven: una venta anulada resta de las
 * ventas, no suma un ajuste, y un gasto anulado resta de las compras.
 */
export function conceptoDe(
  m: Pick<MovimientoCalculo, "tipo" | "ref_tipo">,
  tipoInsumo: "bacha" | "venta",
): ConceptoStock | null {
  const salidaPorVenta = tipoInsumo === "venta" ? "ventas" : "consumo";
  switch (m.tipo) {
    case "reposicion":
      return null;
    case "compra":
    case "transferencia_entrada":
      return "compras";
    case "venta":
      return salidaPorVenta;
    case "uso_interno":
      return "uso_interno";
    case "transferencia_salida":
      return "otros";
    case "ajuste_manual":
      if (m.ref_tipo === "ingreso" || m.ref_tipo === "ingreso_anulado") return salidaPorVenta;
      if (m.ref_tipo === "egreso_anulado") return "compras";
      // "recuento" son los conteos cargados antes de esta pantalla.
      if (m.ref_tipo === "conteo" || m.ref_tipo === "recuento") return "conteo";
      return "otros";
  }
}

export interface FilaReporteStock {
  insumo_id: string;
  inicial: SaldoStock;
  final: SaldoStock;
  /** En unidad base, con signo (las salidas negativas). */
  conceptos: Record<ConceptoStock, number>;
}

function conceptosVacios(): Record<ConceptoStock, number> {
  return { compras: 0, consumo: 0, ventas: 0, uso_interno: 0, conteo: 0, otros: 0 };
}

/**
 * Stock inicial, cada concepto y stock final de cada insumo entre `desde` y
 * `hasta` (instantes ISO, inclusive). `movimientos` tienen que ser TODOS los
 * posteriores a `desde`, también los de después de `hasta`: con ellos se
 * reconstruye el stock final desde el actual.
 */
export function armarReporteStock(
  insumos: { id: string; tipo: "bacha" | "venta" }[],
  actual: Map<string, SaldoStock>,
  movimientos: MovimientoCalculo[],
  desde: string,
  hasta: string,
): FilaReporteStock[] {
  const porInsumo = new Map<string, MovimientoCalculo[]>();
  for (const m of movimientos) {
    const lista = porInsumo.get(m.insumo_id) ?? [];
    lista.push(m);
    porInsumo.set(m.insumo_id, lista);
  }
  const tDesde = new Date(desde).getTime();
  const tHasta = new Date(hasta).getTime();
  return insumos.map((insumo) => {
    const movs = porInsumo.get(insumo.id) ?? [];
    const hoy = actual.get(insumo.id) ?? { cantidad: 0, deposito: 0 };
    const conceptos = conceptosVacios();
    for (const m of movs) {
      const t = new Date(m.fecha).getTime();
      if (t < tDesde || t > tHasta) continue;
      const c = conceptoDe(m, insumo.tipo);
      if (c) conceptos[c] = redondear(conceptos[c] + m.cantidad);
    }
    return {
      insumo_id: insumo.id,
      // Justo antes de `desde`.
      inicial: saldoEnMomento(hoy, movs, new Date(tDesde - 1).toISOString()),
      final: saldoEnMomento(hoy, movs, hasta),
      conceptos,
    };
  });
}

// --- Consumo y reposición ------------------------------------------------------

/**
 * Lo que sale por uso real en `dias` días, en unidad base por día (positivo):
 * servicios, ventas y uso interno. Las diferencias de conteo y los ajustes no
 * cuentan: son correcciones, no consumo.
 */
export function consumoDiario(
  movimientos: Pick<MovimientoCalculo, "tipo" | "ref_tipo" | "cantidad">[],
  tipoInsumo: "bacha" | "venta",
  dias: number,
): number {
  if (!(dias > 0)) return 0;
  let neto = 0;
  for (const m of movimientos) {
    const c = conceptoDe(m, tipoInsumo);
    if (c === "consumo" || c === "ventas" || c === "uso_interno") neto += m.cantidad;
  }
  return Math.max(0, -neto) / dias;
}

export interface ParametrosCompra {
  /** Cada cuántos días se compra. */
  frecuenciaDias: number;
  /** Días de margen por si la compra se demora o se usa más. */
  margenDias: number;
}

export interface SugerenciaCompra {
  /** Unidad base por día. */
  consumoDiario: number;
  /** Para cuántos días alcanza lo que hay. null si no se usa. */
  diasQueAlcanza: number | null;
  /**
   * Umbral de stock bajo sugerido, en unidad base: lo que se usa en los días
   * de margen. Debajo de eso hay que comprar sin esperar a la compra de rutina.
   */
  umbral: number;
  /** Lo que tiene que haber para llegar a la próxima compra, con margen. */
  necesario: number;
  /** Envases enteros a comprar hoy. */
  comprarEnvases: number;
}

export function sugerirCompra(
  args: { stock: number; consumoDiario: number; tamanoEnvase: number },
  p: ParametrosCompra,
): SugerenciaCompra {
  const { consumoDiario: diario } = args;
  const factor = args.tamanoEnvase > 0 ? args.tamanoEnvase : 1;
  const stock = Math.max(0, args.stock);
  const necesario = diario * (p.frecuenciaDias + p.margenDias);
  const faltante = necesario - stock;
  return {
    consumoDiario: diario,
    diasQueAlcanza: diario > 0 ? stock / diario : null,
    umbral: Math.ceil(diario * p.margenDias),
    necesario,
    // Un resto de centésimas de envase no justifica comprar uno más.
    comprarEnvases: faltante > 0 ? Math.ceil(redondear(faltante / factor) - 0.01) : 0,
  };
}
