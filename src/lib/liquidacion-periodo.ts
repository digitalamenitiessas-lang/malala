/**
 * Qué entra en una liquidación, más allá de las fechas del período.
 *
 * Las líneas de venta, los anticipos, los descuentos y los viáticos se marcan
 * uno por uno cuando entran en una liquidación. Eso es lo que impide cobrarlos
 * dos veces, no las fechas. Por eso una liquidación se lleva TODO lo que no se
 * liquidó todavía hasta su `hasta`, aunque sea de antes de su `desde`.
 *
 * El caso que lo motivó: a Ángela la liquidaron el sábado 24 y la pagaron, y
 * después cargaron una venta del 24 con un servicio de ella. Un período que
 * incluyera el 24 chocaba con la liquidación ya hecha, y uno que arrancara el
 * 25 no miraba el 24: esa comisión quedaba afuera para siempre.
 */

/**
 * Desde cuándo se buscan cosas sin liquidar.
 *
 * El piso es la primera liquidación de la empleada: antes de eso el salón no
 * liquidaba con el sistema —Yerba Buena puso las comisiones en cero para
 * arrancar limpio— y arrastrar esa historia le pagaría meses que ya se le
 * pagaron por fuera. Quien nunca se liquidó arranca en el `desde` del período,
 * que es lo que pasaba siempre.
 */
export function pisoDePendientes(
  primeraLiquidacionDesde: string | null | undefined,
  desde: string,
): string {
  if (!primeraLiquidacionDesde) return desde;
  return primeraLiquidacionDesde < desde ? primeraLiquidacionDesde : desde;
}

/** Quedó de antes del período: se cargó tarde o se escapó de una liquidación. */
export function esDePeriodoAnterior(fecha: string, desde: string): boolean {
  return fecha.slice(0, 10) < desde;
}

/**
 * Días con trabajo dentro del período, y sólo dentro.
 *
 * Una línea de la semana pasada que entra ahora se paga, pero ese día no lo
 * trabajó en ESTE período: contarlo inflaría los días de una semana que no los
 * tuvo.
 */
export function diasTrabajadosEnPeriodo(
  fechas: string[],
  desde: string,
  hasta: string,
): number {
  return new Set(
    fechas.map((f) => f.slice(0, 10)).filter((f) => f >= desde && f <= hasta),
  ).size;
}
