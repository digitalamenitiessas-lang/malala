import { z } from "zod";

// Sólo aplica a productos de venta; en los de bacha la acción la ignora.
const ubicacion = z.enum(["deposito", "exhibicion"]).optional();

export const ajusteManualSchema = z.object({
  insumo_id: z.string().min(1, "Insumo requerido"),
  sucursal_id: z.string().min(1, "Sucursal requerida"),
  cantidad: z.coerce
    .number()
    .refine((n) => n !== 0, "La cantidad no puede ser cero"),
  motivo: z
    .string()
    .min(3, "Motivo requerido")
    .transform((s) => s.trim()),
  ubicacion,
});

export type AjusteManualInput = z.infer<typeof ajusteManualSchema>;

// Retiro de un producto de venta para usarlo en el salón. La cantidad va en
// ENVASES y siempre positiva: es una salida, el signo lo pone la acción.
export const retiroUsoInternoSchema = z.object({
  insumo_id: z.string().min(1, "Producto requerido"),
  sucursal_id: z.string().min(1, "Sucursal requerida"),
  empleado_id: z.string().min(1, "Indicá quién lo retiró"),
  cantidad: z.coerce
    .number()
    .refine((n) => Number.isFinite(n) && n > 0, "La cantidad tiene que ser mayor a cero"),
  motivo: z
    .string()
    .min(3, "Motivo requerido")
    .transform((s) => s.trim()),
  ubicacion,
});

export type RetiroUsoInternoInput = z.infer<typeof retiroUsoInternoSchema>;

// Del depósito a la góndola. En ENVASES, siempre positiva; el motivo es
// opcional porque reponer es lo de todos los días.
export const reposicionSchema = z.object({
  insumo_id: z.string().min(1, "Producto requerido"),
  sucursal_id: z.string().min(1, "Sucursal requerida"),
  cantidad: z.coerce
    .number()
    .refine((n) => Number.isFinite(n) && n > 0, "La cantidad tiene que ser mayor a cero"),
  motivo: z
    .string()
    .transform((s) => s.trim())
    .optional(),
});
