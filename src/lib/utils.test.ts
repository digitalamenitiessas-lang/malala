import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatDayTime,
  formatTime,
} from "./utils";

/**
 * Estas pruebas corren igual de bien en una máquina en UTC que en una en
 * Argentina: ese es justamente el punto. El servidor de producción corre en
 * UTC, y hasta ahora imprimía las horas en UTC — los tickets del salón
 * aparecían tres horas adelantados.
 */
describe("fechas y horas en hora argentina", () => {
  it("una venta de las 11:23 no se muestra a las 14:23", () => {
    // 14:23 UTC = 11:23 en Argentina (UTC-3).
    expect(formatTime("2026-09-21T14:23:00.000Z")).toBe("11:23");
  });

  it("el último ticket de la noche sigue siendo del mismo día", () => {
    // Una venta de las 20:14 del 21 se guarda como 23:14 UTC del 21.
    expect(formatDayTime("2026-09-21T23:14:00.000Z")).toBe("21/9, 20:14");
  });

  it("después de las 21:00 la fecha no salta al día siguiente", () => {
    // 01:30 UTC del 22 son las 22:30 del 21 en Argentina.
    expect(formatDate("2026-09-22T01:30:00.000Z")).toBe("21/09/2026");
    expect(formatDateShort("2026-09-22T01:30:00.000Z")).toBe("21/09/26");
    expect(formatDateTime("2026-09-22T01:30:00.000Z")).toBe("21/09/26, 22:30");
  });

  it("una fecha sin hora no se corre de día", () => {
    // "2026-09-21" es un día del calendario, no un instante: leerlo como
    // medianoche UTC y mostrarlo en hora argentina lo retrocedía al 20.
    expect(formatDate("2026-09-21")).toBe("21/09/2026");
    expect(formatDateShort("2026-09-21")).toBe("21/09/26");
  });

  it("una hora ya escrita como HH:MM se deja como está", () => {
    // Los horarios de agenda se guardan así, no son instantes.
    expect(formatTime("09:30")).toBe("09:30");
  });

  it("la grilla completa del día de la foto queda dentro del horario del salón", () => {
    // Las horas UTC que el sistema mostraba tal cual (14:23, 16:19 … 23:14)
    // son en realidad de 11:23 a 20:14: un día de salón que abre 9 y cierra 21.
    const utc = [
      "14:23", "16:19", "17:47", "19:05", "20:10", "20:33",
      "21:12", "21:56", "21:59", "22:02", "22:03", "23:03", "23:14",
    ];
    const ar = utc.map((h) => formatTime(`2026-09-21T${h}:00.000Z`));
    expect(ar).toEqual([
      "11:23", "13:19", "14:47", "16:05", "17:10", "17:33",
      "18:12", "18:56", "18:59", "19:02", "19:03", "20:03", "20:14",
    ]);
    for (const h of ar) {
      const hora = Number(h.slice(0, 2));
      expect(hora).toBeGreaterThanOrEqual(9);
      expect(hora).toBeLessThan(21);
    }
  });
});
