/**
 * Cuentas del retiro de un producto de venta para uso interno. Aparte de la
 * acción para poder testearlas sin base.
 */

export interface InsumoCosto {
  /** Unidades base (ml/g/ud) que trae un envase. */
  tamanoEnvase: number;
  precioEnvase: number;
  /** Costo por unidad base cargado a mano; si falta se deriva del envase. */
  precioUnitario: number | null;
}

/**
 * `envases` es lo que la persona retiró, contado en envases como en las
 * compras. Devuelve el delta de stock en unidad base (negativo: es una salida)
 * y el costo por unidad base que se congela en el movimiento.
 */
export function costoRetiroUsoInterno(
  insumo: InsumoCosto,
  envases: number,
): { delta: number; costoUnitario: number } {
  const tamano = insumo.tamanoEnvase > 0 ? insumo.tamanoEnvase : 1;
  const costoUnitario = insumo.precioUnitario ?? insumo.precioEnvase / tamano;
  return { delta: -(envases * tamano), costoUnitario };
}
