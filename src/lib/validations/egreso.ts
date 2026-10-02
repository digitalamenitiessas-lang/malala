import { z } from "zod";

// nullish: tolera `null` (lo que devuelve FormData.get cuando el campo no existe)
// además de undefined/"".
const optStr = z
  .string()
  .nullish()
  .transform((s) => (s && s !== "" ? s : undefined));

export const egresoSchema = z
  .object({
    fecha: z.string().min(1).nullish(),
    sucursal_id: z.string().min(1, "Sucursal requerida"),
    rubro_id: z.string().min(1, "Rubro requerido"),
    insumo_id: optStr,
    proveedor_id: optStr,
    cantidad: z.coerce.number().nonnegative().nullish(),
    valor: z.coerce.number().positive("El monto debe ser > 0"),
    // Opcional a propósito: si el gasto queda a pagar (cuenta corriente del
    // proveedor), todavía no se sabe con qué se va a pagar. Obligarlo hacía
    // elegir uno de relleno, y después "marcar pagado" usaba ESE medio sin
    // volver a preguntar: si se eligió efectivo y al final se pagó por
    // transferencia, la plata salía de la cuenta equivocada. Se exige recién
    // cuando el gasto se marca pagado (ver superRefine y togglePagadoEgreso).
    mp_id: optStr,
    mp1_cuenta_id: optStr,
    mp2_id: optStr,
    valor2: z.coerce.number().nonnegative().nullish(),
    mp2_cuenta_id: optStr,
    observacion: z
      .string()
      .nullish()
      .transform((s) => (s ?? "").trim() || undefined),
    pagado: z
      .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean()])
      .nullish()
      .transform((v) => v === true || v === "on" || v === "true"),
  })
  .superRefine((data, ctx) => {
    // El medio de pago se exige sólo si la plata sale ahora.
    if (data.pagado && !data.mp_id) {
      ctx.addIssue({
        code: "custom",
        path: ["mp_id"],
        message: "Elegí con qué se pagó",
      });
    }
    // Un gasto a pagar SIN proveedor queda en el aire: no sale plata de la caja
    // y tampoco le queda deuda a nadie, porque la deuda se carga a la cuenta del
    // proveedor y sin proveedor no hay cuenta donde cargarla.
    //
    // Pasó con una compra de ampollas de $64.000: se dejó "a pagar" —que era lo
    // correcto— pero el campo decía "Proveedor (opcional)" y quedó vacío. El
    // insumo entró al stock, la plata nunca salió, y cuando fueron a buscar la
    // deuda del proveedor no había nada. El campo es opcional sólo cuando el
    // gasto ya está pagado.
    if (!data.pagado && !data.proveedor_id) {
      ctx.addIssue({
        code: "custom",
        path: ["proveedor_id"],
        message:
          "Elegí el proveedor: si el gasto queda a pagar, la deuda va a su cuenta. Sin proveedor no queda registrada en ningún lado.",
      });
    }
    // Si se vinculó un insumo, exigir cantidad > 0
    if (data.insumo_id && (!data.cantidad || data.cantidad <= 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["cantidad"],
        message: "Ingresá la cantidad de insumo recibido",
      });
    }
    // Si se eligió un segundo medio de pago, validar el split
    if (data.mp2_id) {
      if (data.mp2_id === data.mp_id) {
        ctx.addIssue({
          code: "custom",
          path: ["mp2_id"],
          message: "El segundo medio debe ser distinto al primero",
        });
      }
      if (!data.valor2 || data.valor2 <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["valor2"],
          message: "Ingresá cuánto pagás con el segundo medio",
        });
      } else if (data.valor2 >= data.valor) {
        ctx.addIssue({
          code: "custom",
          path: ["valor2"],
          message: "El monto del segundo medio no puede ser mayor o igual al total",
        });
      }
    }
  });

export type EgresoInput = z.infer<typeof egresoSchema>;
