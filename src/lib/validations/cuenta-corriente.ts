import { z } from "zod";

export const cargoCcSchema = z.object({
  cliente_id: z.string().min(1, "Cliente requerido"),
  monto: z.coerce.number().positive("El monto debe ser mayor a 0"),
  descripcion: z
    .string()
    .optional()
    .transform((s) => (s ?? "").trim() || undefined),
});

export const pagoCcSchema = z.object({
  cliente_id: z.string().min(1, "Cliente requerido"),
  monto: z.coerce.number().positive("El monto debe ser mayor a 0"),
  mp_id: z.string().min(1, "Medio de pago requerido"),
  /**
   * Día en que el cliente entregó la plata. Vacío es hoy.
   *
   * Sin esto, un cobro que se corrige al día siguiente cambia de día: la plata
   * sale de la caja en la que entró y aparece en la de hoy. Pasó con dos
   * cobros de $144.000 y $116.000 revertidos de madrugada y vueltos a cargar:
   * el gasto que pagaban quedó en su día y el ingreso saltó al siguiente, y la
   * caja de ayer cerró con $269.375 de sobrante mientras la de hoy esperaba
   * $260.000 de más.
   */
  fecha: z
    .string()
    .nullish()
    .transform((s) => (s ? s : undefined))
    .refine((s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s), "Fecha inválida"),
  // Cuenta de banco a la que entra la plata. Opcional: si no se elige, se usa
  // la cuenta por defecto del medio de pago.
  cuenta_id: z
    .string()
    .nullish()
    .transform((s) => (s ? s : undefined)),
  descripcion: z
    .string()
    .optional()
    .transform((s) => (s ?? "").trim() || undefined),
});

export type CargoCcInput = z.infer<typeof cargoCcSchema>;
export type PagoCcInput = z.infer<typeof pagoCcSchema>;
