import { describe, expect, it } from "vitest";
import { giftCardSchema } from "./gift-card";

/**
 * El campo "lo que pagan" de una gift card es opcional y vacío significa que
 * pagaron el importe completo, que es el caso normal.
 *
 * z.coerce.number() convierte "" en 0. Con eso, dejar el campo en blanco
 * registraba que no entró un peso: GC-0193 se emitió por $40.000 y la caja
 * anotó $0, y el salón contó $40.000 de menos sin que nada avisara.
 */
function base(extra: Record<string, unknown>) {
  return {
    sucursal_id: "seed-000002",
    codigo: "GC-TEST",
    importe: "40000",
    origen: "venta",
    mp_id: "mp-1",
    ...extra,
  };
}

describe("giftCardSchema · cobrado", () => {
  it("el string vacio significa 'sin valor', no cero", () => {
    const r = giftCardSchema.safeParse(base({ cobrado: "" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cobrado).toBeUndefined();
  });

  it("null y ausente tambien son 'sin valor'", () => {
    for (const v of [null, undefined]) {
      const r = giftCardSchema.safeParse(base({ cobrado: v }));
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.cobrado).toBeUndefined();
    }
  });

  it("un monto con descuento se respeta", () => {
    const r = giftCardSchema.safeParse(base({ cobrado: "24000" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cobrado).toBe(24000);
  });

  /**
   * El campo es un CurrencyField: guarda un número y arranca en 0, así que no
   * puede mandar vacío. El schema deja pasar el 0 y es createGiftCard quien lo
   * lee como "no lo especificaron" — una tarjeta que de verdad no se cobra es
   * una cortesía, que es otro origen y ni muestra este campo.
   *
   * Este test decía antes que el cero "sigue siendo cero", y esa suposición
   * fue la que dejó cuatro gift cards de un día registrando $0 de ingreso.
   */
  it("deja pasar el cero, que el alta interpreta como sin especificar", () => {
    const r = giftCardSchema.safeParse(base({ cobrado: "0" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cobrado).toBe(0);
  });

  it("rechaza lo que no es un numero", () => {
    expect(giftCardSchema.safeParse(base({ cobrado: "pepe" })).success).toBe(false);
  });
});

/**
 * El descuento dejo de inferirse de un campo en cero y pasa a ser una casilla.
 * Inferirlo no distinguia "no pusieron nada" de "se perdio lo que pusieron", y
 * a Belen Bobba se le cargaron $84.000 cuando pagaba $63.000.
 */
describe("giftCardSchema · con_descuento", () => {
  it("sin la casilla es false", () => {
    for (const v of [null, undefined, ""]) {
      const r = giftCardSchema.safeParse(base({ con_descuento: v }));
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.con_descuento).toBe(false);
    }
  });

  it("la casilla marcada llega como 'on' y es true", () => {
    const r = giftCardSchema.safeParse(base({ con_descuento: "on" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.con_descuento).toBe(true);
  });

  it("convive con el monto cobrado", () => {
    const r = giftCardSchema.safeParse(
      base({ con_descuento: "on", cobrado: "63000" }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.con_descuento).toBe(true);
      expect(r.data.cobrado).toBe(63000);
    }
  });
});
