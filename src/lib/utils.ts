import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ARS_ENTERO = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const ARS_CENTAVOS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Importe en pesos. Muestra centavos solo cuando los hay.
 *
 * Casi todos los números del salón son redondos, y llenar cada pantalla de
 * ",00" las vuelve ilegibles. Pero cuando el importe tiene centavos —una
 * factura de proveedor, un cálculo de comisión— hay que verlos: antes esto
 * redondeaba a entero y la pantalla decía algo distinto de lo que estaba
 * guardado.
 */
export function formatARS(value: number): string {
  const centavos = Math.round(value * 100) % 100;
  return centavos === 0 ? ARS_ENTERO.format(value) : ARS_CENTAVOS.format(value);
}

/**
 * TODA fecha y hora que se muestre en pantalla se formatea en hora argentina.
 *
 * El servidor corre en UTC, así que un Intl sin `timeZone` imprime UTC: los
 * tickets del salón aparecían tres horas adelantados —una venta de las 11:23
 * figuraba a las 14:23— y, después de las 21:00, con la fecha del día
 * siguiente. No alcanza con que el navegador esté en Argentina: estas pantallas
 * se renderizan en el servidor.
 */
const TZ_AR = "America/Argentina/Buenos_Aires";

/**
 * Lleva a un instante lo que se vaya a formatear.
 *
 * Una fecha sola ("2026-09-21") no es un instante, es un día del calendario:
 * `new Date` la lee como medianoche UTC y mostrarla en hora argentina la corre
 * al día anterior. Se la ancla al mediodía para que ninguna zona la cambie de
 * día. Un ISO completo pasa tal cual, que es lo que hay que convertir.
 */
function aInstante(value: string | Date): Date {
  if (typeof value !== "string") return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00-03:00`);
  }
  return new Date(value);
}

const DATE_FMT = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ_AR,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** dd/mm/aa — para tablas, donde el siglo no aporta. */
const DATE_CORTA_FMT = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ_AR,
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

const WEEKDAY_FMT = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ_AR,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const TIME_FMT = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ_AR,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE_TIME_FMT = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ_AR,
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** dd/mm HH:MM — listados del día, donde el año es ruido. */
const DIA_HORA_FMT = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ_AR,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE_TIME_LARGA_FMT = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ_AR,
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDate(value: string | Date): string {
  return DATE_FMT.format(aInstante(value));
}

export function formatDateShort(value: string | Date): string {
  return DATE_CORTA_FMT.format(aInstante(value));
}

export function formatLongDate(value: string | Date): string {
  return WEEKDAY_FMT.format(aInstante(value));
}

export function formatTime(value: string | Date): string {
  if (typeof value === "string" && /^\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  return TIME_FMT.format(aInstante(value));
}

/** dd/mm/aa HH:MM */
export function formatDateTime(value: string | Date): string {
  return DATE_TIME_FMT.format(aInstante(value));
}

/** dd/mm HH:MM */
export function formatDayTime(value: string | Date): string {
  return DIA_HORA_FMT.format(aInstante(value));
}

/** dd de mes de aaaa, HH:MM */
export function formatDateTimeLong(value: string | Date): string {
  return DATE_TIME_LARGA_FMT.format(aInstante(value));
}
