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

  it("un cero explicito sigue siendo cero", () => {
    const r = giftCardSchema.safeParse(base({ cobrado: "0" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cobrado).toBe(0);
  });

  it("rechaza lo que no es un numero", () => {
    expect(giftCardSchema.safeParse(base({ cobrado: "pepe" })).success).toBe(false);
  });
});
