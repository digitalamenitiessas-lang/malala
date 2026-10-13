import { describe, it, expect } from "vitest";

/**
 * El sabado se paga distinto: "las chicas del centro cobran los viaticos dia
 * de semana $3.000 y los sabados $7.000".
 *
 * Se prueba la deteccion del dia, que es donde esta el filo: con medianoche en
 * vez de mediodia, el corrimiento de huso mueve el dia de la semana y un
 * viernes se cobra como sabado.
 */
function esSabado(ymd: string): boolean {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay() === 6;
}

function montoDelDia(ymd: string, normal: number, sabado: number): number {
  return sabado > 0 && esSabado(ymd) ? sabado : normal;
}

describe("viático distinto los sábados", () => {
  it("el sábado cobra el monto de sábado", () => {
    // 2026-10-17 es sábado.
    expect(montoDelDia("2026-10-17", 3000, 7000)).toBe(7000);
  });

  it("el resto de la semana cobra el normal", () => {
    expect(montoDelDia("2026-10-13", 3000, 7000)).toBe(3000); // martes
    expect(montoDelDia("2026-10-16", 3000, 7000)).toBe(3000); // viernes
  });

  it("sin monto de sábado, el sábado cobra lo mismo que el resto", () => {
    expect(montoDelDia("2026-10-17", 4000, 0)).toBe(4000);
  });

  it("el viernes no se cuela como sábado por el huso horario", () => {
    // Con medianoche UTC, un ymd argentino se corre un dia. Por eso mediodia.
    expect(esSabado("2026-10-16")).toBe(false);
    expect(esSabado("2026-10-17")).toBe(true);
    expect(esSabado("2026-10-18")).toBe(false);
  });
});
