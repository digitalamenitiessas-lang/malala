import { describe, expect, it } from "vitest";
import { reversoDe } from "./cuenta-corriente-reverso";

describe("reversoDe", () => {
  it("la reversa de un pago vuelve a subir la deuda", () => {
    expect(reversoDe("pago", 10_000)).toEqual({ tipo: "cargo", deltaSaldo: 10_000 });
  });

  it("la reversa de un cargo baja la deuda", () => {
    expect(reversoDe("cargo", 10_000)).toEqual({ tipo: "pago", deltaSaldo: -10_000 });
  });

  it("deshace exactamente el movimiento: aplicar los dos deja el saldo igual", () => {
    const saldoInicial = 35_000;
    const pago = 12_000;

    // Un pago de $12.000 baja la deuda.
    const trasPago = saldoInicial - pago;
    // Revertirlo tiene que devolver el saldo al punto de partida.
    const { deltaSaldo } = reversoDe("pago", pago);

    expect(trasPago + deltaSaldo).toBe(saldoInicial);
  });

  it("no inventa plata cuando el monto es cero", () => {
    expect(reversoDe("pago", 0).deltaSaldo).toBe(0);
  });
});
