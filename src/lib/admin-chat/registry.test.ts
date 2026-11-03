import { describe, expect, it } from "vitest";
import { rangoAr } from "./registry";

describe("rangoAr", () => {
  it("un día suelto cubre el día entero en hora de Argentina", () => {
    expect(rangoAr({ desde: "2026-11-02", hasta: "2026-11-02" })).toEqual({
      desde: "2026-11-02T03:00:00.000Z",
      hasta: "2026-11-03T02:59:59.999Z",
    });
  });

  it("respeta un instante ISO completo", () => {
    expect(rangoAr({ desde: "2026-11-02T15:00:00.000Z" })).toEqual({
      desde: "2026-11-02T15:00:00.000Z",
      hasta: undefined,
    });
  });

  it("sin fechas no filtra", () => {
    expect(rangoAr({})).toEqual({ desde: undefined, hasta: undefined });
  });
});
