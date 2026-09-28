import { z } from "zod";

export const empleadoSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").transform((s) => s.trim()),
  sucursal_principal_id: z.string().min(1, "Sucursal requerida"),
  tipo_comision: z.enum(["porcentaje", "mixto", "sueldo_fijo"]),
  porcentaje_default: z.coerce.number().min(0).max(100),
  valor_hora: z.coerce.number().nonnegative(),
  viatico_por_dia: z.coerce.number().nonnegative().default(0),
  horas_por_semana: z.coerce.number().nonnegative(),
  dias_trabajo: z
    .array(z.coerce.number().int().min(0).max(6))
    .default([])
    .transform((arr) => Array.from(new Set(arr)).sort((a, b) => a - b)),
  observacion: z
    .string()
    .optional()
    .transform((s) => (s ?? "").trim() || undefined),
  activo: z.coerce.boolean().default(true),
});

export type EmpleadoInput = z.infer<typeof empleadoSchema>;
