/**
 * Cuentas del stock de reventa repartido en depósito y exhibición. Aparte de
 * las acciones para poder testearlas sin base.
 *
 * El stock guarda el TOTAL y la parte en depósito; lo exhibido es la
 * diferencia. Así todo lo que ya leía `cantidad` (valuación, alertas, recetas)
 * sigue viendo el total sin enterarse de los lugares.
 */

export type UbicacionStock = "deposito" | "exhibicion";

export const UBICACION_LABEL: Record<UbicacionStock, string> = {
  deposito: "Depósito",
  exhibicion: "Exhibición",
};

export interface SaldoStock {
  /** Total, en unidad base. */
  cantidad: number;
  /** Lo guardado en depósito, en unidad base. */
  deposito: number;
}

export function exhibido(s: SaldoStock): number {
  return s.cantidad - s.deposito;
}

/**
 * Aplica una entrada o salida en un lugar.
 *
 * Sin lugar (o en exhibición) se toca sólo lo exhibido. Si una salida deja la
 * góndola en negativo y hay en depósito, el faltante se toma del depósito y se
 * informa como `repuesto`: hoy nadie registra cuando pasa mercadería del
 * depósito a la góndola, y sin esto cada venta de un producto "sin exhibir"
 * dejaría la exhibición negativa con el depósito lleno. Así el total siempre
 * cuadra y la reposición que faltó cargar queda a la vista.
 */
export function aplicarEnUbicacion(
  s: SaldoStock,
  delta: number,
  ubicacion?: UbicacionStock,
): SaldoStock & { repuesto: number } {
  const cantidad = s.cantidad + delta;
  if (ubicacion === "deposito") {
    // El depósito no queda negativo: si se saca más de lo que hay (ej. se
    // anula una compra que ya se pasó a la góndola), el resto sale de lo
    // exhibido, que es donde está esa mercadería.
    return { cantidad, deposito: Math.max(0, s.deposito + delta), repuesto: 0 };
  }
  let deposito = s.deposito;
  let repuesto = 0;
  const exhibidoDespues = exhibido(s) + delta;
  if (delta < 0 && exhibidoDespues < 0 && deposito > 0) {
    repuesto = Math.min(-exhibidoDespues, deposito);
    deposito -= repuesto;
  }
  return { cantidad, deposito, repuesto };
}

/** Pasa `unidades` del depósito a la góndola. El total no cambia. */
export function reponerExhibicion(
  s: SaldoStock,
  unidades: number,
): { ok: true; saldo: SaldoStock } | { ok: false; error: string } {
  if (!(unidades > 0)) {
    return { ok: false, error: "La cantidad tiene que ser mayor a cero" };
  }
  if (unidades > s.deposito) {
    return {
      ok: false,
      error: `En depósito hay ${s.deposito.toLocaleString("es-AR")}: no se puede reponer más que eso`,
    };
  }
  return { ok: true, saldo: { cantidad: s.cantidad, deposito: s.deposito - unidades } };
}
