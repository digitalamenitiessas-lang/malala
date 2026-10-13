import { z } from "zod";

/**
 * Un descuento: lo que se le cobra a una empleada sin que salga plata de la
 * caja. A diferencia del anticipo no lleva medio de pago, justamente porque no
 * hay pago: no se le dio nada, se le va a cobrar el sábado.
 */
export const descuentoSchema = z.object({
  empleado_id: z.string().min(1, "Empleado requerido"),
  monto: z.coerce.number().positive("El monto debe ser mayor a 0"),
  /**
   * Por qué se le descuenta. Obligatorio a propósito: un descuento sin motivo
   * es un número que nadie va a poder explicar tres semanas después, y el que
   * lo cargó no va a estar ahí para contarlo.
   */
  concepto: z
    .string()
    .trim()
    .min(1, "Poné por qué se le descuenta")
    .max(120, "Más corto, por favor"),
  /** Día en que se generó el cargo. Vacío es hoy. */
  fecha: z
    .string()
    .nullish()
    .transform((s) => (s ? s : undefined))
    .refine((s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s), "Fecha inválida"),
  /**
   * Día en que se le descuenta, si se acordó para más adelante. Vacío = en la
   * liquidación del período en que se cargó. Mismo criterio que los anticipos,
   * porque el salón ya pidió esa distinción una vez.
   */
  fecha_descuento: z
    .string()
    .nullish()
    .transform((s) => (s ? s : undefined))
    .refine((s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s), "Fecha inválida"),
  observacion: z
    .string()
    .optional()
    .transform((s) => (s ?? "").trim() || undefined),
});

export type DescuentoInput = z.infer<typeof descuentoSchema>;
