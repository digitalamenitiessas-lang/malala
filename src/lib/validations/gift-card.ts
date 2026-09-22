import { z } from "zod";

// nullish: tolera `null` (lo que devuelve FormData.get cuando el campo no existe)
// además de undefined/"".
const optStr = z
  .string()
  .nullish()
  .transform((s) => (s && s.trim() !== "" ? s.trim() : undefined));

/**
 * Emisión de una gift card: la venta de la tarjeta.
 *
 * `mp_id` es cómo la pagó la clienta (efectivo, tarjeta, transferencia). Esa
 * plata sí entra a la caja — lo que NO entra es una venta, porque el servicio
 * todavía no se prestó.
 *
 * El código se normaliza acá (trim + mayúsculas) y el índice único de la base va
 * sobre upper(), así que las dos puntas coinciden.
 */
export const giftCardSchema = z.object({
  sucursal_id: z.string().min(1, "Sucursal requerida"),
  codigo: z
    .string()
    .min(1, "Código requerido")
    .max(32, "El código no puede tener más de 32 caracteres")
    .transform((s) => s.trim().toUpperCase()),
  importe: z.coerce.number().positive("El importe debe ser mayor a 0"),
  mp_id: optStr,
  mp_cuenta_id: optStr,
  vence_el: optStr,
  compradora: optStr,
  beneficiaria: optStr,
  observacion: optStr,
  /**
   * La tarjeta ya se había vendido antes de usar este sistema.
   *
   * Cambia lo único que importa: no se cobra nada hoy. Esa plata entró en su
   * momento, así que pedir un medio de pago y emitir el ingreso la contaría dos
   * veces e inflaría el arqueo del día.
   */
  pre_sistema: z.coerce.boolean().default(false),
  /** Cuándo se vendió realmente. Solo para las de antes del sistema. */
  fecha_venta: optStr,
})
  .superRefine((data, ctx) => {
    // El medio de pago solo se exige cuando hoy entra plata.
    if (!data.pre_sistema && !data.mp_id) {
      ctx.addIssue({
        code: "custom",
        path: ["mp_id"],
        message: "Medio de pago requerido",
      });
    }
  });

export type GiftCardInput = z.infer<typeof giftCardSchema>;

/**
 * Corrección del código impreso. Es lo único que puede tocar una encargada
 * después de emitida, porque es el error más probable y el más caro: el número
 * está escrito en una tarjeta que se llevó otra persona, y si no coincide con el
 * sistema el problema aparece semanas después, con la clienta en el mostrador.
 * No mueve plata, así que no es una operación contable — pero se audita igual.
 */
export const giftCardCodigoSchema = z.object({
  gift_card_id: z.string().min(1),
  codigo: z
    .string()
    .min(1, "Código requerido")
    .max(32, "El código no puede tener más de 32 caracteres")
    .transform((s) => s.trim().toUpperCase()),
  motivo: z.string().min(1, "Contá por qué se corrige, queda en el historial"),
});

/** Anulación: sólo admin, y con motivo. Deja la tarjeta sin valor. */
export const giftCardAnularSchema = z.object({
  gift_card_id: z.string().min(1),
  motivo: z.string().min(1, "Motivo requerido"),
});
