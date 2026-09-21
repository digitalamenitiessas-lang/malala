const MILES = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/**
 * Separa un importe tipeado en parte entera y centavos, con la convención de
 * acá: la coma decide los decimales y el punto separa los miles.
 *
 * El punto es ambiguo, porque el propio campo escribe "1.234" mientras se
 * tipea. Por eso un punto solitario con una o dos cifras atrás se toma como
 * decimal ("12.5" es doce cincuenta, que es lo que espera quien escribe en el
 * teclado numérico) y en cualquier otro caso son separadores de miles.
 *
 * `decimales: null` significa que no se escribió ninguna coma todavía, que es
 * distinto de haber escrito una coma sin cifras atrás ("12,").
 */
export function partirMonto(s: string): {
  entero: string;
  decimales: string | null;
} {
  const limpio = s.replace(/[^\d.,]/g, "");
  const coma = limpio.lastIndexOf(",");
  if (coma >= 0) {
    return {
      entero: limpio.slice(0, coma).replace(/\D/g, ""),
      decimales: limpio
        .slice(coma + 1)
        .replace(/\D/g, "")
        .slice(0, 2),
    };
  }
  const trozos = limpio.split(".");
  if (trozos.length === 2 && trozos[1].length > 0 && trozos[1].length <= 2) {
    return { entero: trozos[0].replace(/\D/g, ""), decimales: trozos[1] };
  }
  return { entero: limpio.replace(/\D/g, ""), decimales: null };
}

/** Toma cualquier texto y devuelve los pesos que representa, con centavos. */
export function parseMontoArs(s: string): number {
  const { entero, decimales } = partirMonto(s);
  if (!entero && !decimales) return 0;
  const n = Number(`${entero || "0"}.${decimales || "0"}`);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Lo que muestra el campo MIENTRAS se escribe.
 *
 * No se puede derivar del número: si se formatea el valor en cada tecla, la
 * coma recién tipeada desaparece —"12," vale 12, y 12 se imprime "$ 12"— y no
 * hay forma de llegar nunca a los centavos.
 */
export function textoMontoTipeado(s: string): string {
  const { entero, decimales } = partirMonto(s);
  if (!entero && decimales === null) return "";
  const miles = entero ? MILES.format(Number(entero)) : "0";
  return decimales === null ? `$ ${miles}` : `$ ${miles},${decimales}`;
}
