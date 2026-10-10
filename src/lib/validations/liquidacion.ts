import { z } from "zod";
import { hoyAr } from "@/lib/fecha-ar";

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");

// "Hoy" en horario de Argentina, como tope para no permitir fechas futuras.
function todayYMD(): string {
  return hoyAr();
}

export const liquidacionPreviewSchema = z
  .object({
    sucursal_id: z.string().min(1, "Sucursal requerida"),
    empleado_id: z.string().min(1, "Empleado requerido"),
    periodo_desde: ymd,
    periodo_hasta: ymd,
  })
  .refine((v) => v.periodo_hasta >= v.periodo_desde, {
    message: "El periodo es inválido",
    path: ["periodo_hasta"],
  })
  .refine((v) => v.periodo_hasta <= todayYMD(), {
    message: "No se puede liquidar hasta una fecha futura",
    path: ["periodo_hasta"],
  });

export const liquidacionCreateSchema = liquidacionPreviewSchema.extend({
  horas_trabajadas: z.coerce.number().nonnegative().default(0),
  // Monto fijo del periodo, arriba de la comision y de las horas.
  sueldo_basico: z.coerce.number().nonnegative().default(0),
  dias_viatico: z.coerce.number().nonnegative().default(0),
});

export const liquidacionPagoSchema = z.object({
  mp_id: z.string().min(1, "Medio de pago requerido"),
  /**
   * Lo que se entrega de verdad, si es menos que el total.
   *
   * El salón paga redondeado: "cuando me dice $237.340 yo pago $237.000 (esa
   * sobrante no lo pago)". La diferencia queda a favor de la empleada y entra
   * en la liquidación siguiente. Vacío o cero = se paga el total.
   *
   * Va como string u opcional y no con coerce directo: un CurrencyField manda
   * "0" cuando está vacío, y ese cero significa "no lo tocaron", no "no le
   * pago nada".
   */
  total_pagado: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === "" || v === null || v === undefined) return undefined;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }),
  /**
   * Segundo medio, opcional: parte en efectivo y parte por transferencia es
   * como se paga cuando la caja no tiene todo el sueldo.
   *
   * valor2 es lo que se paga con ESTE medio; el resto va por el primero. Se
   * guarda así, y no los dos montos, porque el total ya está fijado por la
   * liquidación: pedir los dos permitiría que sumen otra cosa.
   */
  mp2_id: z
    .string()
    .nullish()
    .transform((s) => (s ? s : undefined)),
  valor2: z.coerce.number().optional(),
  /**
   * Día en que se pagó de verdad. Vacío es ahora, que es el caso normal.
   *
   * El salón paga el sábado y lo registra el lunes: con la fecha de hoy, esa
   * plata sale de la caja de hoy y deja corta la del sábado.
   */
  fecha: z
    .string()
    .nullish()
    .transform((s) => (s ? s : undefined))
    .refine((s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s), "Fecha inválida"),
  observacion: z
    .string()
    .optional()
    .transform((s) => (s ?? "").trim() || undefined),
}).superRefine((data, ctx) => {
  if (data.mp2_id && data.mp2_id === data.mp_id) {
    ctx.addIssue({
      code: "custom",
      path: ["mp2_id"],
      message: "Es el mismo medio que el primero",
    });
  }
  if (data.mp2_id && !(Number(data.valor2) > 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["valor2"],
      message: "Poné cuánto se paga con el segundo medio",
    });
  }
});

export type LiquidacionPreviewInput = z.infer<typeof liquidacionPreviewSchema>;
export type LiquidacionCreateInput = z.infer<typeof liquidacionCreateSchema>;
export type LiquidacionPagoInput = z.infer<typeof liquidacionPagoSchema>;
