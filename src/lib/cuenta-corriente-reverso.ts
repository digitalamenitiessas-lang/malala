export type TipoMovCc = "cargo" | "pago";

/**
 * Qué asiento deshace a otro en la cuenta corriente de un cliente.
 *
 * Un pago mal cargado no se borra: se le pone el asiento contrario al lado, y
 * la ficha del cliente queda contando lo que de verdad pasó —se cargó mal y se
 * corrigió—. Es la misma razón por la que el historial de pagos a proveedores
 * no se edita: ese historial es la prueba cuando alguien discute la deuda.
 *
 * El signo es lo único con filo acá. `saldoCc` es DEUDA: un cargo la sube, un
 * pago la baja. Entonces la reversa de un pago vuelve a subirla, y la de un
 * cargo la baja. Invertirlo haría que corregir un error de $10.000 lo convierta
 * en uno de $20.000.
 */
export function reversoDe(
  tipo: TipoMovCc,
  monto: number,
): { tipo: TipoMovCc; deltaSaldo: number } {
  return tipo === "cargo"
    ? { tipo: "pago", deltaSaldo: -monto }
    : { tipo: "cargo", deltaSaldo: monto };
}
