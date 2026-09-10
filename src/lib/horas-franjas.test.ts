import { describe, expect, it } from "vitest";
import {
  horasDeFranjasEnRango,
  horasDelDia,
  horasSemanales,
  type Franja,
} from "./horas-franjas";

/** Lun a vie 9 a 17 (8 h), sábado 9 a 13 (4 h) = 44 h semanales. */
const SEMANA: Franja[] = [
  { diaSemana: 1, apertura: "09:00", cierre: "17:00" },
  { diaSemana: 2, apertura: "09:00", cierre: "17:00" },
  { diaSemana: 3, apertura: "09:00", cierre: "17:00" },
  { diaSemana: 4, apertura: "09:00", cierre: "17:00" },
  { diaSemana: 5, apertura: "09:00", cierre: "17:00" },
  { diaSemana: 6, apertura: "09:00", cierre: "13:00" },
];

describe("horasSemanales", () => {
  it("suma todas las franjas de la semana", () => {
    expect(horasSemanales(SEMANA)).toBe(44);
  });

  it("sin franjas es cero", () => {
    expect(horasSemanales([])).toBe(0);
  });

  it("suma dos franjas del mismo día (jornada cortada por el almuerzo)", () => {
    expect(
      horasSemanales([
        { diaSemana: 1, apertura: "09:00", cierre: "13:00" },
        { diaSemana: 1, apertura: "16:00", cierre: "20:00" },
      ]),
    ).toBe(8);
  });

  it("una franja invertida suma cero, no resta", () => {
    expect(
      horasSemanales([
        { diaSemana: 1, apertura: "17:00", cierre: "09:00" },
        { diaSemana: 2, apertura: "09:00", cierre: "17:00" },
      ]),
    ).toBe(8);
  });

  it("maneja medias horas", () => {
    expect(
      horasSemanales([{ diaSemana: 3, apertura: "09:30", cierre: "13:15" }]),
    ).toBe(3.75);
  });
});

describe("horasDelDia", () => {
  it("devuelve las horas de ese día", () => {
    expect(horasDelDia(SEMANA, 6)).toBe(4);
    expect(horasDelDia(SEMANA, 1)).toBe(8);
  });

  it("un día sin franja es cero", () => {
    expect(horasDelDia(SEMANA, 0)).toBe(0);
  });
});

describe("horasDeFranjasEnRango", () => {
  it("una semana corrida coincide con el total semanal", () => {
    // Lunes 2026-09-07 a domingo 2026-09-13.
    expect(horasDeFranjasEnRango("2026-09-07", "2026-09-13", SEMANA)).toBe(
      horasSemanales(SEMANA),
    );
  });

  it("un solo día cuenta solo ese día", () => {
    // 2026-09-12 es sábado.
    expect(horasDeFranjasEnRango("2026-09-12", "2026-09-12", SEMANA)).toBe(4);
  });

  it("el domingo no suma nada", () => {
    expect(horasDeFranjasEnRango("2026-09-13", "2026-09-13", SEMANA)).toBe(0);
  });

  it("una quincena NO es dos semanas exactas", () => {
    // Del 1 al 15 de septiembre de 2026: martes a martes. Hay 3 martes y sólo
    // 2 sábados, así que multiplicar 44 h por dos semanas daría distinto.
    const real = horasDeFranjasEnRango("2026-09-01", "2026-09-15", SEMANA);
    expect(real).not.toBe(horasSemanales(SEMANA) * 2);
    // 11 días de 8 h (lun-vie) + 2 sábados de 4 h.
    expect(real).toBe(11 * 8 + 2 * 4);
  });

  it("rango invertido da cero", () => {
    expect(horasDeFranjasEnRango("2026-09-15", "2026-09-01", SEMANA)).toBe(0);
  });
});
