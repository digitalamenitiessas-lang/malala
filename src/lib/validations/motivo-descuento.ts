import { z } from "zod";

export const motivoDescuentoSchema = z.object({
  nombre: z
    .string()
    .min(1, "Nombre requerido")
    .transform((s) => s.trim()),
  activo: z.coerce.boolean().default(true),
  // El descuento lo pone el local: la venta no le baja la comisión a la empleada.
  comision_ignora_descuento: z.coerce.boolean().default(false),
});

export type MotivoDescuentoInput = z.infer<typeof motivoDescuentoSchema>;
