import { describe, expect, it } from "vitest";
import { coincide } from "./buscador-servicio";

/**
 * Nombres reales del catálogo de Centro, que es donde se pidió buscar
 * tipeando: 133 servicios en una lista nativa ordenada por rubro.
 */
describe("coincide", () => {
  it("encuentra por un pedazo del nombre", () => {
    expect(coincide("Lifting de pestañas coreano", "lift")).toBe(true);
    expect(coincide("Diseño y perfilado de cejas", "cejas")).toBe(true);
  });

  it("ignora los acentos y la ñ, que nadie escribe en el mostrador", () => {
    expect(coincide("Lifting de pestañas", "pestanas")).toBe(true);
    expect(coincide("Diseño y perfilado de cejas", "diseno")).toBe(true);
    expect(coincide("Aplicación de color 1", "aplicacion")).toBe(true);
  });

  it("ignora mayusculas", () => {
    expect(coincide("PLUMITAS", "plumi")).toBe(true);
    expect(coincide("combo", "COMBO")).toBe(true);
  });

  it("acepta las palabras en cualquier orden", () => {
    expect(coincide("Lifting de pestañas coreano", "coreano lifting")).toBe(true);
    expect(coincide("Laminado + perfilado cejas", "cejas laminado")).toBe(true);
  });

  it("exige que esten TODAS las palabras", () => {
    expect(coincide("Lifting de pestañas coreano", "lifting brasileno")).toBe(false);
  });

  it("no encuentra lo que no esta", () => {
    expect(coincide("Remoción Kapping", "balayage")).toBe(false);
  });

  it("una consulta vacia o de espacios no filtra nada", () => {
    expect(coincide("Cualquier cosa", "")).toBe(true);
    expect(coincide("Cualquier cosa", "   ")).toBe(true);
  });
});
