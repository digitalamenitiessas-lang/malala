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

const DATE_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const WEEKDAY_FMT = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const TIME_FMT = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: string | Date): string {
  return DATE_FMT.format(typeof value === "string" ? new Date(value) : value);
}

export function formatLongDate(value: string | Date): string {
  return WEEKDAY_FMT.format(typeof value === "string" ? new Date(value) : value);
}

export function formatTime(value: string | Date): string {
  if (typeof value === "string" && /^\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  return TIME_FMT.format(typeof value === "string" ? new Date(value) : value);
}
