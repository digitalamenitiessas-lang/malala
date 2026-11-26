/**
 * Las cuentas de una factura de proveedor cargada entera.
 *
 * Pedido de Yerba Buena el 26/11/2026, después de la cuenta de Loreal: cada
 * línea de la factura se cargaba como un gasto aparte y el IVA no quedaba en
 * ninguna, así que la deuda del sistema era $182.749 menos que la factura y
 * "se torna dudoso si debemos confiar en el sistema". Ellas quieren que lo que
 * dice el sistema sea lo correcto "para poder defenderlo por sobre el
 * proveedor".
 *
 * Se carga el TOTAL de la factura (el del papel) y las líneas de productos. La
 * diferencia es IVA, percepciones y otros cargos: queda como una línea más, así
 * la deuda es exactamente la factura. El costo de cada producto, si se
 * actualiza, lleva su parte de esa diferencia: es plata que el salón paga.
 */

export interface LineaFactura {
  insumoId: string;
  /** Envases. */
  cantidad: number;
  /** Importe de la línea, sin IVA, como figura en la factura. */
  valor: number;
}

export interface PlanFactura {
  sumaLineas: number;
  /** IVA, percepciones y otros cargos: total − suma de las líneas. */
  diferencia: number;
  /** Precio por envase de cada línea, con su parte de la diferencia. */
  precioEnvase: number[];
}

const centavos = (n: number) => Math.round(n * 100) / 100;

export function planFactura(
  total: number,
  lineas: LineaFactura[],
): { ok: true; plan: PlanFactura } | { ok: false; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  if (!(total > 0)) errors.total = ["Poné el total de la factura"];
  if (lineas.length === 0) errors.lineas = ["Cargá al menos un producto"];
  lineas.forEach((l, i) => {
    const n = i + 1;
    if (!l.insumoId) (errors.lineas ??= []).push(`Línea ${n}: elegí el producto`);
    if (!(l.cantidad > 0)) (errors.lineas ??= []).push(`Línea ${n}: la cantidad tiene que ser mayor a 0`);
    if (!(l.valor > 0)) (errors.lineas ??= []).push(`Línea ${n}: poné el importe`);
  });
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const sumaLineas = centavos(lineas.reduce((s, l) => s + l.valor, 0));
  const diferencia = centavos(total - sumaLineas);
  if (diferencia < 0) {
    return {
      ok: false,
      errors: {
        total: [
          `Las líneas suman más que el total de la factura. Revisá los importes: sobran ${formatoPesos(-diferencia)}.`,
        ],
      },
    };
  }
  const factor = total / sumaLineas;
  return {
    ok: true,
    plan: {
      sumaLineas,
      diferencia,
      precioEnvase: lineas.map((l) => centavos((l.valor * factor) / l.cantidad)),
    },
  };
}

/**
 * El número de la factura sin ceros ni prefijos, para darse cuenta de que es
 * la misma aunque se haya tipeado distinto: "0070-00436916", "00436916" y
 * "N 0070-0436916" son la 436916. Así se cargó la misma factura de Loreal.
 */
export function numeroFactura(comprobante: string | null | undefined): string | null {
  const grupos = (comprobante ?? "").match(/\d+/g);
  if (!grupos) return null;
  const n = grupos[grupos.length - 1].replace(/^0+/, "");
  return n || null;
}

function formatoPesos(n: number): string {
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
