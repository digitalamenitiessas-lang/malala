import { z } from "zod";

export const anticipoSchema = z.object({
  empleado_id: z.string().min(1, "Empleado requerido"),
  monto: z.coerce.number().positive("El monto debe ser mayor a 0"),
  mp_id: z.string().min(1, "Medio de pago requerido"),
  /**
   * De qué cuenta sale, cuando el medio admite más de una.
   *
   * Vacío usa la cuenta por defecto del medio de pago. Hace falta porque
   * "Transferencia" apunta a Galicia y el salón también transfiere desde Macro:
   * sin esto, todo anticipo por transferencia salía de Galicia y el saldo de las
   * dos cuentas quedaba mal. Pedido tal cual: "me podrían habilitar poder elegir
   * Galicia o Macro en modo de pago transferencia cuando cargo un anticipo".
   */
  mp_cuenta_id: z
    .string()
    .nullish()
    .transform((s) => (s ? s : undefined)),
  /**
   * Día en que se le dio la plata. Vacío es hoy.
   *
   * La fecha decide en qué liquidación se descuenta, así que un anticipo que
   * se corrige al día siguiente cambia de semana: se revierte y se vuelve a
   * cargar, y el nuevo cae en el período que viene. "Se pagaron pero se le
   * empieza a descontar en la semana del 24, ese es el problema".
   */
  fecha: z
    .string()
    .nullish()
    .transform((s) => (s ? s : undefined))
    .refine((s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s), "Fecha inválida"),
  /**
   * Dia en que se le descuenta del sueldo, si se acordo para mas adelante.
   * Vacio = se descuenta en la fecha de entrega.
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

export type AnticipoInput = z.infer<typeof anticipoSchema>;
