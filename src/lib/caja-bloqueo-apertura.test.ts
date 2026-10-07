import { describe, expect, it } from "vitest";
import { cajaQueBloqueaApertura } from "./caja-bloqueo-apertura";

const cerradas = (...f: string[]) => new Set(f);

describe("cajaQueBloqueaApertura", () => {
  it("frena si quedó un día anterior sin cerrar", () => {
    const aperturas = [{ fecha: "2026-10-06" }];
    expect(
      cajaQueBloqueaApertura(aperturas, cerradas(), "2026-10-07"),
    ).toBe("2026-10-06");
  });

  it("no frena si ese día anterior ya se cerró", () => {
    const aperturas = [{ fecha: "2026-10-06" }];
    expect(
      cajaQueBloqueaApertura(aperturas, cerradas("2026-10-06"), "2026-10-07"),
    ).toBeNull();
  });

  /**
   * El caso de Centro: cargar el 26/09 con la caja de hoy abierta. Antes esto
   * devolvía la fecha de hoy y la apertura no se guardaba nunca.
   */
  it("deja abrir un dia viejo aunque hoy este abierta", () => {
    const aperturas = [{ fecha: "2026-10-06" }, { fecha: "2026-10-07" }];
    expect(
      cajaQueBloqueaApertura(aperturas, cerradas(), "2026-09-26"),
    ).toBeNull();
  });

  it("si hay varios dias viejos abiertos, nombra uno de ellos", () => {
    const aperturas = [{ fecha: "2026-10-01" }, { fecha: "2026-10-03" }];
    const r = cajaQueBloqueaApertura(aperturas, cerradas(), "2026-10-07");
    expect(["2026-10-01", "2026-10-03"]).toContain(r);
  });

  it("el mismo dia no se bloquea a si mismo", () => {
    const aperturas = [{ fecha: "2026-10-07" }];
    expect(
      cajaQueBloqueaApertura(aperturas, cerradas(), "2026-10-07"),
    ).toBeNull();
  });

  it("sin aperturas no hay nada que frene", () => {
    expect(cajaQueBloqueaApertura([], cerradas(), "2026-09-26")).toBeNull();
  });
});
