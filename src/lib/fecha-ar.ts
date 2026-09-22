// Helpers de fecha en horario de Argentina. El server (Vercel) corre en UTC,
// pero las fechas operativas (turnos, caja, egresos) se manejan en hora local
// de Argentina. Usar esto para calcular "hoy" en el servidor evita el desfasaje
// de 3 horas (p. ej. de noche, que "hoy" salte al día siguiente).

const TZ = "America/Argentina/Buenos_Aires";
// Argentina es UTC-3 fijo (no observa horario de verano). Offset literal para
// construir instantes a partir de fechas locales.
const AR_OFFSET = "-03:00";

/** Fecha de hoy como YYYY-MM-DD en horario de Argentina. */
export function hoyAr(): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Instante (ISO UTC) del inicio del día de Argentina para una fecha YMD. */
export function inicioDeDiaArISO(ymd: string = hoyAr()): string {
  return new Date(`${ymd}T00:00:00.000${AR_OFFSET}`).toISOString();
}

/** Instante (ISO UTC) del fin del día de Argentina para una fecha YMD. */
export function finDeDiaArISO(ymd: string = hoyAr()): string {
  return new Date(`${ymd}T23:59:59.999${AR_OFFSET}`).toISOString();
}

/** Instante (ISO UTC) del inicio del mes en curso en Argentina. */
export function inicioDeMesArISO(): string {
  return new Date(`${hoyAr().slice(0, 7)}-01T00:00:00.000${AR_OFFSET}`).toISOString();
}

/** Fecha (YMD) de hace `n` días respecto de hoy, en Argentina. */
export function hoyArMenosDias(n: number): string {
  const d = new Date(`${hoyAr()}T12:00:00.000${AR_OFFSET}`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Convierte un instante ISO a su fecha YMD en horario de Argentina. */
export function fechaArDeISO(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

/**
 * Suma (o resta) días a una fecha YMD, sin salirse del calendario.
 *
 * Aritmética pura de calendario en UTC: sumar días sobre un Date local hace
 * que el resultado dependa de la zona del proceso, que es exactamente lo que
 * hay que evitar acá.
 */
export function sumarDiasYmd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Instante para una fecha argentina elegida a mano, con la hora del reloj de
 * Argentina en este momento.
 *
 * Sirve para cargar un movimiento con fecha pasada: lo que importa es que caiga
 * en ESE día argentino. Construirlo como medianoche del server (UTC) lo dejaba
 * a las 21:00 del día anterior en Argentina, o sea en la caja equivocada.
 */
export function instanteEnFechaAr(ymd: string, ahora: Date = new Date()): string {
  const hora = ahora.toLocaleTimeString("en-GB", {
    timeZone: TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return new Date(`${ymd}T${hora}.000${AR_OFFSET}`).toISOString();
}
