import { describe, expect, it } from "vitest";
import { tryNormalizarTelefonoAR as n } from "./phone";

describe("normalizarTelefonoAR", () => {
  it.each([
    ["3815123456"],
    ["381 512-3456"],
    ["+54 9 381 512-3456"],
    ["5493815123456"],
    ["543815123456"],
    ["03815123456"],
    ["+54 381 5123456"],
    // Formatos de mostrador que antes quedaban sin normalizar y dejaban
    // cargar a la misma clienta dos veces.
    ["381 15 5123456"],
    ["0381 15 5123456"],
    ["0381-15-512-3456"],
    ["155123456"],
    ["15-512-3456"],
    ["5123456"],
    ["+549 549 3815123456"],
  ])("%s → +5493815123456", (entrada) => {
    expect(n(entrada)).toBe("+5493815123456");
  });

  it("Buenos Aires con y sin 15", () => {
    expect(n("11 5555 6666")).toBe("+5491155556666");
    expect(n("011 15 5555 6666")).toBe("+5491155556666");
    expect(n("+54 9 11 5555-6666")).toBe("+5491155556666");
  });

  it("código de área de 4 dígitos con 15", () => {
    expect(n("3865 15 123456")).toBe("+5493865123456");
    expect(n("3865123456")).toBe("+5493865123456");
  });

  it("rechaza lo que no es un teléfono argentino", () => {
    expect(n("")).toBeNull();
    expect(n("abc")).toBeNull();
    expect(n("+34 600 292 978")).toBeNull();
    expect(n("12345")).toBeNull();
  });
});
