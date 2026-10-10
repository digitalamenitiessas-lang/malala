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
  /**
   * Lo que pagaron, si no es el importe. Vacío = pagaron el importe.
   *
   * El vacío se descarta ANTES de convertir a número, y ahí está el filo:
   * z.coerce.number() convierte "" en 0, no en "sin valor". Con .nullish()
   * sobre el coerce, dejar el campo en blanco —que es el caso normal— pasaba
   * como "cobraron cero". La gift card GC-0193 de $40.000 se emitió así y
   * registró $0 entrando a la caja; el salón contó $40.000 de menos en el
   * arqueo sin que nada avisara.
   */
  cobrado: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)))
    .refine(
      (v) => v === undefined || (Number.isFinite(v) && v >= 0),
      "Importe inválido",
    ),
  mp_id: optStr,
  mp_cuenta_id: optStr,
  vence_el: optStr,
  /** Marcada = paga menos de lo que vale. Sin marcar, cobrado se ignora. */
  con_descuento: z
    .union([z.string(), z.boolean(), z.null(), z.undefined()])
    // Un checkbox sin marcar no viaja: FormData devuelve null. Acepta
    // cualquier string igual, para no romperse con "" ni con "false".
    .transform((x) => x === true || x === "on" || x === "true"),
  compradora: optStr,
  /**
   * Cliente al que se le fía la tarjeta. Sólo cuando el medio es cuenta
   * corriente: ahí la deuda necesita un cliente, no un nombre escrito.
   */
  compradora_cliente_id: optStr,
  beneficiaria: optStr,
  observacion: optStr,
  /**
   * De dónde sale la tarjeta. Define lo único que importa acá: si hoy entra
   * plata o no.
   *
   *  - venta: el caso normal. Se cobra, así que se pide medio de pago.
   *  - pre_sistema: se vendió antes de usar el sistema. Esa plata entró en su
   *    momento, así que cobrarla hoy la contaría dos veces e inflaría el arqueo.
   *  - cortesia: la regala el salón. No entra plata hoy ni va a entrar nunca;
   *    el costo lo absorbe el negocio cuando la canjean.
   *
   * Antes esto era un booleano "pre_sistema", que mezclaba el hecho (no entra
   * plata) con el motivo (ya se cobró antes). Con las cortesías el motivo es el
   * contrario, y usar el mismo campo hacía que la pantalla afirmara de un
   * regalo que su venta ya estaba facturada.
   */
  origen: z.enum(["venta", "pre_sistema", "cortesia"]).default("venta"),
  /** Cuándo se vendió realmente. Solo para las de antes del sistema. */
  fecha_venta: optStr,
})
  .superRefine((data, ctx) => {
    // El medio de pago solo se exige cuando hoy entra plata.
    if (data.origen === "venta" && !data.mp_id) {
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
