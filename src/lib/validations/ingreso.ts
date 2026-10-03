import { z } from "zod";

export const lineaServicioSchema = z.object({
  tipo: z.literal("servicio"),
  servicio_id: z.string().min(1, "Servicio requerido"),
  empleado_id: z.string().min(1, "Empleado requerido"),
  precio_efectivo: z.coerce.number().nonnegative(),
  // Cuántas veces se hizo el mismo servicio en el ticket. Viene una madre con
  // cinco hijas y son cinco cortes: cargarlos como cinco líneas iguales es
  // perder tiempo en el mostrador. El precio de la línea es unitario; el
  // subtotal, la comisión y el consumo de insumos se multiplican por esto.
  cantidad: z.coerce.number().int().positive().default(1),
  comision_pct: z.coerce.number().min(0).max(100),
  // true  → la empleada absorbe el descuento: comisión sobre el precio final pagado.
  // false → la empleada NO lo absorbe: comisión sobre el precio de lista (regular).
  // El default es true porque es la regla del salón y el mostrador ya no ofrece
  // la alternativa: si el campo no viene, la comisión sale de lo cobrado. La
  // excepción se marca después, sobre la venta guardada.
  soporta_descuento: z.coerce.boolean().default(true),
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

/**
 * Subtotal de una línea. El precio es unitario en los dos casos.
 *
 * Los servicios quedaron sin multiplicar cuando se les agregó cantidad, y esta
 * copia de la cuenta no salta en ningún test: el formulario sumaba bien, el
 * guardado sumaba bien, y sólo esta validación sumaba de menos. El resultado
 * era una venta que no se podía guardar con un mensaje incomprensible en el
 * mostrador —"la suma de pagos (60000) no coincide con el total (55000)"—
 * sobre un ticket donde en pantalla las dos cifras decían 60000.
 */
function lineaSubtotal(linea: LineaInput): number {
  return linea.precio_efectivo * linea.cantidad;
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
    /**
     * Día de la venta, cuando no es hoy.
     *
     * Vacío es el caso normal y significa ahora. Se usa para cargar un día que
     * quedó sin registrar: sin esto, esas ventas o no existen o caen en el día
     * equivocado, que ensucia dos días en vez de arreglar uno.
     */
    fecha: z
      .string()
      .nullish()
      .transform((s) => (s ? s : undefined))
      .refine((s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s), "Fecha inválida"),
    /**
     * Cotización usada cuando se cobró en otra moneda.
     *
     * Se guarda para poder explicar después de dónde salió el importe en
     * pesos. La carga quien cobra, en el momento, porque cambia todos los días
     * y el salón toma el tipo de cambio venta de su banco.
     *
     * Una sola por ticket: nadie paga con dólares a dos cambios distintos en
     * la misma venta.
     */
    cotizacion: z.coerce.number().optional(),
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

/**
 * Pasa el FormData del mostrador al objeto que valida ingresoSchema.
 *
 * Vive acá, al lado del schema, porque el armado es campo por campo y un campo
 * que falte no falla ruidosamente: queda undefined y lo rechaza alguna
 * validación de más abajo, con un error que apunta a otra cosa. Así se
 * perdieron gift_card_1_id y gift_card_2_id —el form los mandaba, el schema los
 * declaraba, y en el medio nadie los leía— y durante ese tiempo NINGUNA venta
 * cobrada con gift card se pudo guardar: el servidor contestaba "elegí qué gift
 * card se está canjeando" con la tarjeta elegida en pantalla.
 *
 * El test compara estas claves contra las del schema, que es lo único que
 * convierte "me olvidé un campo" en un error ruidoso.
 */
export function ingresoDesdeFormData(
  formData: FormData,
  lineas: unknown,
): Record<string, unknown> {
  return {
    sucursal_id: formData.get("sucursal_id"),
    cliente_id: formData.get("cliente_id"),
    lineas,
    descuento_tipo: formData.get("descuento_tipo") ?? "pct",
    descuento_valor: formData.get("descuento_valor") ?? 0,
    descuento_motivo_id: formData.get("descuento_motivo_id"),
    mp1_id: formData.get("mp1_id"),
    valor1: formData.get("valor1"),
    mp1_cuenta_id: formData.get("mp1_cuenta_id"),
    mp2_id: formData.get("mp2_id"),
    valor2: formData.get("valor2"),
    mp2_cuenta_id: formData.get("mp2_cuenta_id"),
    fecha: formData.get("fecha"),
    cotizacion: formData.get("cotizacion"),
    gift_card_1_id: formData.get("gift_card_1_id"),
    gift_card_2_id: formData.get("gift_card_2_id"),
    observacion: formData.get("observacion"),
  };
}
