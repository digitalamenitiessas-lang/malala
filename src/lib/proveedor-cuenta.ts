/**
 * La cuenta corriente con un proveedor, factura por factura.
 *
 * Los pagos a cuenta no apuntan a ninguna factura (drizzle/0058): el salón paga
 * montos sueltos y el saldo del proveedor baja. Eso deja el saldo bien pero
 * cada factura mostrando el total, y marcarla pagada sacaba de la caja el total
 * otra vez. Walter, en Yerba Buena: dos pagos de $200.000 contra una factura de
 * $686.917,45, y "la cuenta no resta lo abonado".
 *
 * Acá se reparten: lo pagado a cuenta va cubriendo las facturas impagas de la
 * más vieja a la más nueva, que es como paga cualquiera una cuenta corriente.
 *
 * Módulo puro, sin base, para poder probarlo.
 */

export interface FacturaImpaga {
  id: string;
  fecha: string; // ISO
  valor: number;
}

export interface Cobertura {
  /** Lo que ya cubren los pagos a cuenta. */
  cubierto: number;
  /** Lo que todavía hay que pagar. */
  falta: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Reparte `disponible` (lo pagado a cuenta que todavía no se usó para saldar
 * ninguna factura) entre las facturas impagas, de la más vieja a la más nueva.
 */
export function imputarPagosACuenta(
  facturas: FacturaImpaga[],
  disponible: number,
): Map<string, Cobertura> {
  const ordenadas = [...facturas].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id),
  );
  const resultado = new Map<string, Cobertura>();
  let resto = Math.max(0, redondear(disponible));
  for (const f of ordenadas) {
    const cubierto = redondear(Math.min(resto, Math.max(0, f.valor)));
    resto = redondear(resto - cubierto);
    resultado.set(f.id, { cubierto, falta: redondear(f.valor - cubierto) });
  }
  return resultado;
}

/**
 * Lo que sale de cada medio al marcar pagada una factura con una parte ya
 * cubierta. Lo cubierto se descuenta primero del primer medio y, si no alcanza,
 * del segundo.
 */
export function montosAPagar(
  valor1: number,
  valor2: number,
  cubierto: number,
): { valor1: number; valor2: number } {
  const delPrimero = Math.min(Math.max(0, cubierto), valor1);
  const delSegundo = Math.min(Math.max(0, cubierto - delPrimero), valor2);
  return {
    valor1: redondear(valor1 - delPrimero),
    valor2: redondear(valor2 - delSegundo),
  };
}
