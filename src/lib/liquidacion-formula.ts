import type { TipoComision } from "@/lib/types";

/**
 * Cuánto se le paga a una empleada en una liquidación.
 *
 * Hay tres arreglos distintos en el salón y cada uno se calcula distinto. No es
 * un detalle de presentación: usar el equivocado le paga de más o de menos a
 * una persona, y el sistema los sumaba todos.
 *
 * PROFESIONAL (tipo_comision = "porcentaje")
 *   Cobra la comisión O el asegurado, LO QUE SEA MAYOR. Nunca los dos.
 *   El asegurado son las horas de la semana por su tarifa —40 h × $6.000 =
 *   $240.000— y es un piso, no un sueldo: si comisionó $250.000 cobra
 *   $250.000, si comisionó $200.000 cobra los $240.000. Se mide por semana
 *   entera, no día por día: un día flojo se compensa con uno bueno.
 *
 * ENCARGADA (tipo_comision = "sueldo_fijo")
 *   Horas por tarifa MÁS comisión. Acá sí se suma, porque la comisión de una
 *   encargada no es por servicios —no atiende— sino por venta de productos.
 *   Son dos conceptos distintos y no compiten.
 *
 * MIXTO (tipo_comision = "mixto")
 *   Hace de profesional y de encargada en la misma semana: comisión de sus
 *   servicios, más las horas que cubre como encargada, más un básico. Todo
 *   suma. Hoy es una sola persona (Valentina, en Centro, que los lunes y dos
 *   horas del sábado está de encargada).
 *
 * Los viáticos se suman y los anticipos se restan en los tres casos: no son
 * parte del arreglo, son plata que ya se le dio o que le corresponde aparte.
 */
export interface ArgsLiquidacion {
  tipoComision: TipoComision;
  /** Comisiones del período, ya calculadas línea por línea. */
  totalComision: number;
  /** Horas cargadas × valor hora. Para una profesional, esto es el asegurado. */
  sueldoHoras: number;
  /** Básico semanal prorrateado. Sólo lo usa el arreglo mixto. */
  sueldoBasico: number;
  /** Viáticos del período que todavía no se le entregaron. */
  viaticoAPagar: number;
  /** Adelantos ya cobrados, que se descuentan. */
  totalAnticipos: number;
}

export interface DetalleLiquidacion {
  /** Lo que sale del arreglo, antes de viáticos y anticipos. */
  base: number;
  total: number;
  /**
   * Para una profesional: qué ganó, la comisión o el asegurado. Sirve para
   * decirlo en pantalla, que es la diferencia entre un número que se entiende
   * y uno que parece un error.
   */
  gana: "comision" | "asegurado" | null;
}

export function calcularLiquidacion(args: ArgsLiquidacion): DetalleLiquidacion {
  const { tipoComision, totalComision, sueldoHoras, sueldoBasico } = args;

  let base: number;
  let gana: DetalleLiquidacion["gana"] = null;

  if (tipoComision === "sueldo_fijo") {
    base = sueldoHoras + totalComision;
  } else if (tipoComision === "mixto") {
    base = sueldoHoras + totalComision + sueldoBasico;
  } else {
    // Empate: da igual cuál se diga, pero decir "asegurado" es lo honesto —
    // cobra ese piso, no es que haya comisionado justo.
    base = Math.max(totalComision, sueldoHoras);
    gana = totalComision > sueldoHoras ? "comision" : "asegurado";
  }

  return {
    base,
    gana,
    total: base + args.viaticoAPagar - args.totalAnticipos,
  };
}
