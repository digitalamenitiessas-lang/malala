import { z } from "zod";

export const lineaServicioSchema = z.object({
  tipo: z.literal("servicio"),
  servicio_id: z.string().min(1, "Servicio requerido"),
  empleado_id: z.string().min(1, "Empleado requerido"),
  precio_efectivo: z.coerce.number().nonnegative(),
  comision_pct: z.coerce.number().min(0).max(100),
  // true  → la empleada absorbe el descuento: comisión sobre el precio final pagado.
  // false → la empleada NO lo absorbe: comisión sobre el precio de lista (regular).
  soporta_descuento: z.coerce.boolean().default(false),
  // Si la línea proviene de una promo, id del servicio-promo (trazabilidad).
  promo_servicio_id: z
    .string()
    .nullish()
    .transform((s) => (s ? s : undefined)),
});

export const lineaProductoSchema = z.object({
  tipo: z.literal("producto"),
  insumo_id: z.string().min(1, "Producto requerido"),
  cantidad: z.coerce.number().positive("Cantidad debe ser mayor a 0"),
  precio_efectivo: z.coerce.number().nonnegative(),
  // Quién vendió el producto. Opcional, a diferencia del servicio: una reventa
  // de mostrador sin vendedora asignada es normal y no tiene comisión.
  empleado_id: z
    .string()
    .nullish()
    .transform((s) => (s ? s : undefined)),
  comision_pct: z.coerce.number().min(0).max(100).default(0),
});

export const lineaSchema = z.discriminatedUnion("tipo", [
  lineaServicioSchema,
  lineaProductoSchema,
]);

export type LineaServicioInput = z.infer<typeof lineaServicioSchema>;
export type LineaProductoInput = z.infer<typeof lineaProductoSchema>;
export type LineaInput = z.infer<typeof lineaSchema>;

function lineaSubtotal(linea: LineaInput): number {
  if (linea.tipo === "producto") return linea.precio_efectivo * linea.cantidad;
  return linea.precio_efectivo;
}

export const ingresoSchema = z
  .object({
    sucursal_id: z.string().min(1),
    cliente_id: z
      .string()
      .nullish()
      .transform((s) => (s ? s : undefined)),
    lineas: z.array(lineaSchema).min(1, "Agregá al menos una línea"),
    descuento_tipo: z.enum(["pct", "monto"]),
    descuento_valor: z.coerce.number().nonnegative().default(0),
    descuento_motivo_id: z
      .string()
      .nullish()
      .transform((s) => (s ? s : undefined)),
    mp1_id: z.string().min(1, "Medio de pago requerido"),
    valor1: z.coerce.number().nonnegative(),
    mp1_cuenta_id: z
      .string()
      .nullish()
      .transform((s) => (s ? s : undefined)),
    mp2_id: z
      .string()
      .nullish()
      .transform((s) => (s ? s : undefined)),
    valor2: z.coerce.number().optional(),
    mp2_cuenta_id: z
      .string()
      .nullish()
      .transform((s) => (s ? s : undefined)),
    // Qué tarjeta se canjea, cuando el medio de pago es GIFT. Va por tramo
    // porque una venta puede pagarse parte con gift card y parte con otra cosa.
    gift_card_1_id: z
      .string()
      .nullish()
      .transform((s) => (s ? s : undefined)),
    gift_card_2_id: z
      .string()
      .nullish()
      .transform((s) => (s ? s : undefined)),
    observacion: z
      .string()
      .nullish()
      .transform((s) => (s ?? "").trim() || undefined),
  })
  .superRefine((data, ctx) => {
    const subtotal = data.lineas.reduce((acc, l) => acc + lineaSubtotal(l), 0);
    const descMonto =
      data.descuento_tipo === "pct"
        ? subtotal * (data.descuento_valor / 100)
        : data.descuento_valor;
    const total = subtotal - descMonto;

    const pagado = data.valor1 + (data.valor2 ?? 0);
    if (Math.abs(pagado - total) > 0.01) {
      ctx.addIssue({
        code: "custom",
        path: ["valor1"],
        message: `La suma de pagos (${pagado.toFixed(2)}) no coincide con el total (${total.toFixed(2)})`,
      });
    }
    if (data.descuento_tipo === "monto" && data.descuento_valor > subtotal) {
      ctx.addIssue({
        code: "custom",
        path: ["descuento_valor"],
        message: "El descuento no puede ser mayor al subtotal",
      });
    }
    if (data.descuento_tipo === "pct" && data.descuento_valor > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["descuento_valor"],
        message: "El porcentaje no puede ser mayor a 100",
      });
    }
    if (descMonto > 0 && !data.descuento_motivo_id) {
      ctx.addIssue({
        code: "custom",
        path: ["descuento_motivo_id"],
        message: "Elegí un motivo para el descuento",
      });
    }
    // La misma tarjeta en los dos tramos gastaría el saldo dos veces sobre una
    // lectura sola. El UPDATE condicional del canje lo frenaría igual, pero acá
    // el error se ve en el formulario en vez de reventar la venta entera.
    if (
      data.gift_card_1_id &&
      data.gift_card_2_id &&
      data.gift_card_1_id === data.gift_card_2_id
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["gift_card_2_id"],
        message: "Es la misma gift card que el primer medio de pago",
      });
    }
  });

export type IngresoInput = z.infer<typeof ingresoSchema>;
