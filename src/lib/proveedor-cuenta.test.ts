import { describe, expect, it } from "vitest";
import { imputarPagosACuenta, montosAPagar } from "./proveedor-cuenta";

describe("imputarPagosACuenta", () => {
  it("Walter: dos pagos de $200.000 contra una factura", () => {
    const r = imputarPagosACuenta(
      [{ id: "f1", fecha: "2026-10-22T20:40:33.000Z", valor: 686917.45 }],
      400000,
    );
    expect(r.get("f1")).toEqual({ cubierto: 400000, falta: 286917.45 });
  });

  it("cubre de la más vieja a la más nueva, sin importar el orden de entrada", () => {
    const r = imputarPagosACuenta(
      [
        { id: "nueva", fecha: "2026-10-20T12:00:00.000Z", valor: 300000 },
        { id: "vieja", fecha: "2026-10-01T12:00:00.000Z", valor: 100000 },
        { id: "media", fecha: "2026-10-10T12:00:00.000Z", valor: 200000 },
      ],
      250000,
    );
    expect(r.get("vieja")).toEqual({ cubierto: 100000, falta: 0 });
    expect(r.get("media")).toEqual({ cubierto: 150000, falta: 50000 });
    expect(r.get("nueva")).toEqual({ cubierto: 0, falta: 300000 });
  });

  it("si pagaron de más, las facturas quedan cubiertas y el sobrante no se reparte", () => {
    const r = imputarPagosACuenta(
      [{ id: "f1", fecha: "2026-10-01T12:00:00.000Z", valor: 100000 }],
      150000,
    );
    expect(r.get("f1")).toEqual({ cubierto: 100000, falta: 0 });
  });

  it("sin pagos a cuenta, todo falta", () => {
    const r = imputarPagosACuenta(
      [{ id: "f1", fecha: "2026-10-01T12:00:00.000Z", valor: 100000 }],
      0,
    );
    expect(r.get("f1")).toEqual({ cubierto: 0, falta: 100000 });
    expect(
      imputarPagosACuenta([{ id: "f1", fecha: "2026-10-01T12:00:00.000Z", valor: 1 }], -5).get("f1"),
    ).toEqual({ cubierto: 0, falta: 1 });
  });
});

describe("montosAPagar", () => {
  it("descuenta lo cubierto del primer medio", () => {
    expect(montosAPagar(686917.45, 0, 400000)).toEqual({ valor1: 286917.45, valor2: 0 });
  });

  it("si el primero no alcanza, sigue con el segundo", () => {
    expect(montosAPagar(100000, 50000, 120000)).toEqual({ valor1: 0, valor2: 30000 });
  });

  it("cubierta entera: no sale nada", () => {
    expect(montosAPagar(100000, 0, 100000)).toEqual({ valor1: 0, valor2: 0 });
  });
});
