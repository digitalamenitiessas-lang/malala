import { z } from "zod";

export const insumoSchema = z
  .object({
    nombre: z.string().min(1, "Nombre requerido").transform((s) => s.trim()),
    // Código de la planilla del salón ("INS001"). Ver servicioSchema.codigo.
    codigo: z
      .string()
      .trim()
      .max(20, "Máximo 20 caracteres")
      .nullish()
      .transform((s) => (s ? s.toUpperCase() : undefined)),
    proveedor_ids: z
      .array(z.string())
      .default([])
      .transform((arr) => arr.filter(Boolean)),
    unidad_medida: z.enum(["ud", "ml", "g", "aplicacion"]),
    tamano_envase: z.coerce.number().positive("Debe ser > 0"),
    precio_envase: z.coerce
      .number()
      .positive("Cargá el precio del envase (mayor a 0)"),
    rinde: z.coerce.number().optional(),
    umbral_stock_bajo: z.coerce.number().nonnegative(),
    activo: z.coerce.boolean().default(true),
    // Bacha (recetas / uso interno) o venta (venta directa al público).
    tipo: z.enum(["bacha", "venta"]).default("bacha"),
    precio_venta: z
      .union([z.coerce.number().nonnegative(), z.literal("").transform(() => undefined)])
      .optional(),
    // Opcional incluso para los de venta: el salón decide si este producto
    // tiene un precio distinto pagando en efectivo o uno solo.
    precio_venta_efectivo: z
      .union([z.coerce.number().nonnegative(), z.literal("").transform(() => undefined)])
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === "venta" && (data.precio_venta == null || data.precio_venta <= 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["precio_venta"],
        message: "Indicá un precio de venta mayor a 0",
      });
    }
    // Un efectivo por encima del de lista es casi siempre un error de tipeo
    // (los dos campos están uno al lado del otro). Se avisa, no se adivina.
    if (
      data.tipo === "venta" &&
      data.precio_venta_efectivo != null &&
      data.precio_venta_efectivo > 0 &&
      data.precio_venta != null &&
      data.precio_venta_efectivo > data.precio_venta
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["precio_venta_efectivo"],
        message: "El precio efectivo no puede ser mayor al de lista",
      });
    }
  })
  .transform((data) => ({
    ...data,
    precio_unitario:
      data.tamano_envase > 0 ? data.precio_envase / data.tamano_envase : null,
    // `vendible` se deriva de `tipo` (columna legacy sincronizada).
    vendible: data.tipo === "venta",
    precio_venta: data.tipo === "venta" ? data.precio_venta : undefined,
    // 0 y vacío son lo mismo acá: "este producto no tiene precio efectivo".
    precio_venta_efectivo:
      data.tipo === "venta" && data.precio_venta_efectivo
        ? data.precio_venta_efectivo
        : undefined,
  }));

export type InsumoInput = z.infer<typeof insumoSchema>;
