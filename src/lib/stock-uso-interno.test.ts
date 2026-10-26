import { describe, expect, it } from "vitest";
import { costoRetiroUsoInterno } from "./stock-uso-interno";

describe("costoRetiroUsoInterno", () => {
  it("convierte envases a unidad base y la salida es negativa", () => {
    const r = costoRetiroUsoInterno(
      { tamanoEnvase: 250, precioEnvase: 10000, precioUnitario: null },
      2,
    );
    expect(r.delta).toBe(-500);
    expect(r.costoUnitario).toBe(40);
  });

  it("usa el precio unitario cargado si lo hay", () => {
    const r = costoRetiroUsoInterno(
      { tamanoEnvase: 250, precioEnvase: 10000, precioUnitario: 45 },
      1,
    );
    expect(r.costoUnitario).toBe(45);
  });

  it("un producto por unidad: el costo es el del envase", () => {
    const r = costoRetiroUsoInterno(
      { tamanoEnvase: 1, precioEnvase: 18000, precioUnitario: null },
      3,
    );
    expect(r.delta).toBe(-3);
    expect(r.delta * -r.costoUnitario).toBe(54000);
  });

  it("no divide por cero si el envase vino en 0", () => {
    const r = costoRetiroUsoInterno(
      { tamanoEnvase: 0, precioEnvase: 5000, precioUnitario: null },
      1,
    );
    expect(r.delta).toBe(-1);
    expect(r.costoUnitario).toBe(5000);
  });
});
