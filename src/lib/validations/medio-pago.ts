import { z } from "zod";

export const medioPagoSchema = z.object({
  sucursal_id: z.string().min(1, "Sucursal requerida"),
  codigo: z
    .string()
    .min(1, "Código requerido")
    .max(8)
    .transform((s) => s.trim().toUpperCase()),
  nombre: z.string().min(1, "Nombre requerido").transform((s) => s.trim()),
  activo: z.coerce.boolean().default(true),
  cuenta_id: z
    .string()
    .optional()
    .transform((s) => (s && s.trim() ? s.trim() : undefined)),
  recargo_pct: z.coerce.number().min(0).max(100).default(0),
  /**
   * Llega como checkbox: "on" cuando está tildado, null cuando no.
   * .nullish() y no .optional() porque FormData.get devuelve null.
   */
  no_mueve_plata: z
    .union([z.literal("on"), z.boolean()])
    .nullish()
    .transform((v) => v === "on" || v === true),
});

export type MedioPagoInput = z.infer<typeof medioPagoSchema>;
