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

/** Un producto que todavía no existe: se crea al cargar la factura. */
export interface ProductoNuevo {
  nombre: string;
  tipo: "bacha" | "venta";
  unidad: "ml" | "g" | "ud";
  /** Contenido de cada envase, en la unidad (1 si se cuenta por unidad). */
  tamano: number;
}

export interface LineaFactura {
  /** Vacío si la línea es de un producto nuevo. */
  insumoId: string;
  nuevo?: ProductoNuevo;
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
    if (l.nuevo) {
      if (!l.nuevo.nombre.trim()) (errors.lineas ??= []).push(`Línea ${n}: poné el nombre del producto nuevo`);
      if (l.nuevo.unidad !== "ud" && !(l.nuevo.tamano > 0)) {
        (errors.lineas ??= []).push(`Línea ${n}: poné cuánto trae cada envase del producto nuevo`);
      }
    } else if (!l.insumoId) (errors.lineas ??= []).push(`Línea ${n}: elegí el producto`);
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
 * Debajo de esta fracción del costo que ya tiene el producto, la línea es un
 * regalo o una bonificación: el oxidante INOA de Loreal vino a $24,50 el litro
 * (99,9% de descuento) y dejó el costo de las recetas en $35 (26/11/2026).
 */
const UMBRAL_REGALO = 0.2;

/**
 * El costo nuevo de cada producto existente, con su parte de los impuestos.
 *
 * - Si el producto está en varias líneas (Majirel en nueve tonos, o pagado y
 *   de regalo), el costo es el promedio de lo que se pagó por envase.
 * - Las líneas de regalo o bonificadas no cuentan; si todas lo son, el costo
 *   no se toca.
 */
export function costosNuevos(
  lineas: LineaFactura[],
  plan: PlanFactura,
  costoActual: Map<string, number>,
): Map<string, number> {
  const acum = new Map<string, { pesos: number; envases: number }>();
  lineas.forEach((l, i) => {
    if (!l.insumoId || l.nuevo) return;
    const actual = costoActual.get(l.insumoId) ?? 0;
    if (actual > 0 && plan.precioEnvase[i] < actual * UMBRAL_REGALO) return;
    const a = acum.get(l.insumoId) ?? { pesos: 0, envases: 0 };
    a.pesos += plan.precioEnvase[i] * l.cantidad;
    a.envases += l.cantidad;
    acum.set(l.insumoId, a);
  });
  const costos = new Map<string, number>();
  for (const [id, a] of acum) if (a.envases > 0) costos.set(id, centavos(a.pesos / a.envases));
  return costos;
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
