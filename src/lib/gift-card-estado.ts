import type {
  GiftCard,
  GiftCardEstadoVista,
  GiftCardMovimientoTipo,
} from "@/lib/types";

const TZ = "America/Argentina/Buenos_Aires";

/** Fecha de hoy en Argentina, como YYYY-MM-DD comparable con `vence_el`. */
export function hoyAr(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Umbral para tratar un saldo como cero: son pesos, no centavos. */
const EPSILON = 0.005;

/**
 * Estado que se le muestra a la usuaria. La precedencia importa:
 *
 *  1. anulada  — decisión explícita de alguien, gana sobre todo lo demás.
 *  2. canjeada — si ya se usó entera, que esté vencida es irrelevante.
 *  3. vencida  — pasó la fecha y todavía tiene saldo.
 *  4. activa
 *
 * Módulo puro (sin dependencias de servidor) para poder usarse en el cliente.
 */
export function estadoGiftCard(
  gc: Pick<GiftCard, "estado" | "saldo" | "vence_el">,
  hoy: string = hoyAr(),
): GiftCardEstadoVista {
  if (gc.estado === "anulada") return "anulada";
  if (gc.saldo <= EPSILON) return "canjeada";
  if (gc.vence_el && hoy > gc.vence_el) return "vencida";
  return "activa";
}

/**
 * Si la tarjeta se puede usar para pagar, y qué hay que avisar antes.
 *
 * OJO CON EL VENCIMIENTO: una tarjeta vencida SIGUE SIENDO CANJEABLE. El salón
 * hace excepciones con la fecha, y un sistema que prohíbe lo que la gente hace
 * igual termina esquivado, no obedecido. Se avisa y se deja registrado que el
 * canje fue fuera de término; el control es que se vea después, no que frene el
 * mostrador. Mismo criterio que estaVigente() para las promos.
 */
export function esCanjeable(
  gc: Pick<GiftCard, "estado" | "saldo" | "vence_el">,
  hoy: string = hoyAr(),
): { canjeable: boolean; motivo?: string; advertencia?: string } {
  const estado = estadoGiftCard(gc, hoy);
  if (estado === "anulada") return { canjeable: false, motivo: "Anulada" };
  if (estado === "canjeada") return { canjeable: false, motivo: "Ya canjeada" };
  if (estado === "vencida")
    return {
      canjeable: true,
      advertencia: `Venció el ${gc.vence_el} — se va a registrar como canje fuera de término`,
    };
  return { canjeable: true };
}

/** Cuánto de un total puede cubrir la tarjeta. */
export function montoAplicable(
  gc: Pick<GiftCard, "saldo">,
  totalAPagar: number,
): number {
  return Math.min(gc.saldo, Math.max(0, totalAPagar));
}

/** Vencimiento por defecto al emitir: el salón las da por 30 días. */
export const DIAS_VIGENCIA_DEFAULT = 30;

export function vencimientoPorDefecto(
  desde: Date = new Date(),
  dias: number = DIAS_VIGENCIA_DEFAULT,
): string {
  // Se calcula sobre la fecha AR para que una emisión de las 22 h no venza un
  // día antes por el corrimiento a UTC.
  const [y, m, d] = hoyAr(desde).split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

export const ESTADO_LABEL: Record<GiftCardEstadoVista, string> = {
  activa: "Activa",
  canjeada: "Canjeada",
  vencida: "Vencida",
  anulada: "Anulada",
};

/** Badge (fondo + texto) para chips de estado, igual que los turnos. */
export const ESTADO_BADGE: Record<GiftCardEstadoVista, string> = {
  activa: "bg-sage-100 text-sage-900",
  canjeada: "bg-stone-100 text-stone-500",
  // Ámbar, no rojo: vencida no es un error, se puede canjear igual.
  vencida: "bg-warning/15 text-brown-700",
  anulada: "bg-destructive/10 text-destructive",
};

export const MOV_LABEL: Record<GiftCardMovimientoTipo, string> = {
  emision: "Emisión",
  canje: "Canje",
  anulacion: "Anulación",
  ajuste: "Ajuste",
  correccion_codigo: "Código corregido",
};

export const MOV_BADGE: Record<GiftCardMovimientoTipo, string> = {
  emision: "bg-sage-100 text-sage-900",
  canje: "bg-warning/15 text-brown-700",
  anulacion: "bg-destructive/10 text-destructive",
  ajuste: "bg-stone-100 text-stone-500",
  correccion_codigo: "bg-stone-100 text-stone-500",
};

/**
 * Lo que se sabe de cómo se pagó una tarjeta, para la pantalla de detalle.
 *
 * `medio` es el que se eligió al venderla. Las viejas no lo guardaban (ver
 * drizzle/0078): de esas queda la cuenta a la que entró la plata y los medios
 * que llegan a esa cuenta, que pueden ser varios.
 */
export interface PagoGiftCard {
  medio?: string;
  cuenta?: string;
  posibles?: string[];
  /** Descuento de sueldo en más de una cuota. */
  cuotas?: number;
}

/** El renglón "Forma de pago". */
export function textoFormaDePago(
  gc: Pick<GiftCard, "origen">,
  pago: PagoGiftCard,
): string {
  if (gc.origen === "cortesia") return "No se cobró: la regaló el salón";
  if (gc.origen === "pre_sistema") return "Se cobró antes del sistema";

  // La cuenta va sólo si agrega algo: "Efectivo (Caja Efectivo)" no dice más.
  const conCuenta = (texto: string) =>
    pago.cuenta && !pago.cuenta.toLowerCase().includes(texto.toLowerCase())
      ? `${texto} (${pago.cuenta})`
      : texto;

  if (pago.medio) {
    const texto = conCuenta(pago.medio);
    return pago.cuotas && pago.cuotas > 1 ? `${texto} · ${pago.cuotas} cuotas` : texto;
  }
  if (pago.posibles?.length === 1) return conCuenta(pago.posibles[0]);
  if (pago.posibles && pago.posibles.length > 1) {
    const lista = `${pago.posibles.slice(0, -1).join(", ")} o ${pago.posibles.at(-1)}`;
    return `${conCuenta(lista)} · no quedó registrado cuál`;
  }
  if (pago.cuenta) return `Entró a ${pago.cuenta}`;
  return "No quedó registrada";
}
