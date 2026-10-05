import { z } from "zod";

export const cuentaBancariaSchema = z.object({
  sucursal_id: z.string().min(1, "Sucursal requerida"),
  nombre: z.string().min(1, "Nombre requerido").transform((s) => s.trim()),
  tipo: z.enum(["banco", "efectivo"]),
  observacion: z.string().optional().transform((s) => s?.trim() || undefined),
});

export type CuentaBancariaInput = z.infer<typeof cuentaBancariaSchema>;

export const transferenciaSchema = z
  .object({
    cuenta_origen_id: z.string().min(1, "Cuenta origen requerida"),
    cuenta_destino_id: z.string().min(1, "Cuenta destino requerida"),
    monto: z.coerce.number().positive("Monto debe ser mayor a 0"),
    descripcion: z.string().optional().transform((s) => s?.trim() || undefined),
  })
  .refine((d) => d.cuenta_origen_id !== d.cuenta_destino_id, {
    message: "La cuenta origen y destino deben ser distintas",
    path: ["cuenta_destino_id"],
  });

export type TransferenciaInput = z.infer<typeof transferenciaSchema>;

export const cuentaImpuestoSchema = z.object({
  cuenta_id: z.string().min(1, "Cuenta requerida"),
  nombre: z.string().min(1, "Nombre requerido").transform((s) => s.trim()),
  alicuota_pct: z.coerce
    .number()
    .positive("La alícuota debe ser mayor a 0")
    .max(100, "La alícuota no puede superar 100%"),
  base: z.enum(["credito", "debito", "ambos"]),
});

export type CuentaImpuestoInput = z.infer<typeof cuentaImpuestoSchema>;

/**
 * Plata que entra y no es una venta.
 *
 * El caso que lo pide: el salón cobra una comisión por maquillajes que le
 * transfieren. Hasta ahora la caja sólo subía por una venta o por un ajuste de
 * apertura, así que esto se cargaba falseando el ajuste y el motivo se perdía.
 *
 * El concepto es obligatorio justamente por eso: un ingreso sin explicación es
 * indistinguible de un error de arqueo tres semanas después.
 */
export const ingresoManualSchema = z.object({
  cuenta_id: z.string().min(1, "Elegí a qué cuenta entra"),
  monto: z.coerce.number().positive("El monto debe ser mayor a 0"),
  concepto: z
    .string()
    .min(3, "Escribí de qué es este ingreso")
    .transform((s) => s.trim()),
  fecha: z
    .string()
    .nullish()
    .transform((s) => (s ? s : undefined))
    .refine((s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s), "Fecha inválida"),
});

export type IngresoManualInput = z.infer<typeof ingresoManualSchema>;
