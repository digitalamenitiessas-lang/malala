import { describe, it, expect } from "vitest";
import {
  fechaArDeISO,
  finDeDiaArISO,
  inicioDeDiaArISO,
  instanteEnFechaAr,
  sumarDiasYmd,
} from "./fecha-ar";

/**
 * El bug que estos tests fijan:
 *
 * El server corre en UTC y Argentina es UTC-3, así que a partir de las 21:00
 * hora argentina `new Date().toISOString().slice(0, 10)` devuelve la fecha del
 * DÍA SIGUIENTE. Como la apertura y el cierre de caja se guardan con la fecha
 * argentina, ese desfasaje hacía que a la noche la venta buscara la apertura de
 * mañana, no la encontrara, y tirara "Tenés que abrir la caja de hoy" con la
 * caja abierta — justo en el horario en que un salón cierra.
 *
 * Cada caso de abajo compara el helper contra la forma ingenua, para que quede
 * escrito cuál es la diferencia y no vuelva a colarse.
 */
const naive = (iso: string) => new Date(iso).toISOString().slice(0, 10);

describe("fechaArDeISO — el corte del día es a medianoche argentina", () => {
  it("a las 20:59 ART todavía es el mismo día para las dos formas", () => {
    const iso = "2026-09-08T20:59:00-03:00";
    expect(fechaArDeISO(iso)).toBe("2026-09-08");
    expect(naive(iso)).toBe("2026-09-08");
  });

  it("a las 21:00 ART la forma ingenua ya salta de día y el helper no", () => {
    const iso = "2026-09-08T21:00:00-03:00";
    expect(fechaArDeISO(iso)).toBe("2026-09-08");
    // Esto es exactamente lo que rompía la caja de noche.
    expect(naive(iso)).toBe("2026-09-09");
  });

  it("a las 23:59 ART sigue siendo el mismo día de negocio", () => {
    const iso = "2026-09-08T23:59:59-03:00";
    expect(fechaArDeISO(iso)).toBe("2026-09-08");
    expect(naive(iso)).toBe("2026-09-09");
  });

  it("a las 00:01 ART ya es el día siguiente", () => {
    expect(fechaArDeISO("2026-09-09T00:01:00-03:00")).toBe("2026-09-09");
  });

  it("cruza fin de mes y fin de año sin romperse", () => {
    expect(fechaArDeISO("2026-09-30T22:00:00-03:00")).toBe("2026-09-30");
    expect(fechaArDeISO("2026-12-31T23:00:00-03:00")).toBe("2026-12-31");
    expect(fechaArDeISO("2027-01-01T00:30:00-03:00")).toBe("2027-01-01");
  });
});

describe("límites del día argentino", () => {
  it("el inicio del día AR es 03:00 UTC del mismo día", () => {
    expect(inicioDeDiaArISO("2026-09-08")).toBe("2026-09-08T03:00:00.000Z");
  });

  it("el fin del día AR es 02:59 UTC del día siguiente", () => {
    expect(finDeDiaArISO("2026-09-08")).toBe("2026-09-09T02:59:59.999Z");
  });

  it("una venta de las 22:00 ART cae dentro del día que corresponde", () => {
    const venta = new Date("2026-09-08T22:00:00-03:00").toISOString();
    expect(venta >= inicioDeDiaArISO("2026-09-08")).toBe(true);
    expect(venta <= finDeDiaArISO("2026-09-08")).toBe(true);
    // Y NO cae en el día siguiente, que es donde la ponía el corte en UTC.
    expect(venta >= inicioDeDiaArISO("2026-09-09")).toBe(false);
  });
});

/**
 * Lo de arriba ya cubría el corte del día. Esto fija el caso real que apareció
 * después: los ayudantes existían, pero la caja seguía armando el día con el
 * reloj del proceso. El arqueo del 15 iba del 14 a las 21:00 al 15 a las 20:59,
 * así que la última venta del 15 (21:03) caía fuera de su propio cierre y el
 * sistema la reportaba como un "16/09 sin cerrar" imposible de cerrar: nunca
 * hubo caja el 16.
 */
describe("el día de caja del 15 de septiembre, con los datos reales", () => {
  const VENTA_2103 = "2026-09-16T00:03:43.347Z"; // 15/09 21:03 AR
  const EGRESO_2109 = "2026-09-15T00:09:00.000Z"; // 14/09 21:09 AR

  it("la venta de las 21:03 es del 15 y entra en el cierre del 15", () => {
    expect(fechaArDeISO(VENTA_2103)).toBe("2026-09-15");
    expect(VENTA_2103 >= inicioDeDiaArISO("2026-09-15")).toBe(true);
    expect(VENTA_2103 <= finDeDiaArISO("2026-09-15")).toBe(true);
  });

  it("y no arma un día 16 fantasma", () => {
    expect(fechaArDeISO(VENTA_2103)).not.toBe("2026-09-16");
  });

  it("el gasto del 14 a las 21:09 no se cuela en el arqueo del 15", () => {
    expect(fechaArDeISO(EGRESO_2109)).toBe("2026-09-14");
    expect(EGRESO_2109 < inicioDeDiaArISO("2026-09-15")).toBe(true);
  });

  it("un día termina justo donde empieza el siguiente", () => {
    const fin = new Date(finDeDiaArISO("2026-09-15")).getTime();
    const inicio = new Date(inicioDeDiaArISO("2026-09-16")).getTime();
    expect(inicio - fin).toBe(1);
  });
});

describe("sumarDiasYmd", () => {
  it("suma y resta días", () => {
    expect(sumarDiasYmd("2026-09-15", 1)).toBe("2026-09-16");
    expect(sumarDiasYmd("2026-09-15", -1)).toBe("2026-09-14");
    expect(sumarDiasYmd("2026-09-21", -14)).toBe("2026-09-07");
  });

  it("cruza fin de mes, fin de año y años bisiestos", () => {
    expect(sumarDiasYmd("2026-09-30", 1)).toBe("2026-10-01");
    expect(sumarDiasYmd("2026-01-01", -1)).toBe("2025-12-31");
    expect(sumarDiasYmd("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("instanteEnFechaAr — un gasto con fecha elegida a mano", () => {
  it("cae en ese día argentino", () => {
    const ahora = new Date("2026-09-21T12:30:00.000Z"); // 09:30 AR
    expect(fechaArDeISO(instanteEnFechaAr("2026-09-18", ahora))).toBe(
      "2026-09-18",
    );
  });

  it("también si se carga de noche, cuando en UTC ya es otro día", () => {
    // 00:30 UTC del 22 son las 21:30 AR del 21. Antes, armar el instante desde
    // la medianoche del server dejaba el gasto a las 21:00 del día ANTERIOR al
    // elegido, o sea en la caja equivocada.
    const ahora = new Date("2026-09-22T00:30:00.000Z");
    const iso = instanteEnFechaAr("2026-09-18", ahora);
    expect(fechaArDeISO(iso)).toBe("2026-09-18");
    expect(iso).toBe("2026-09-19T00:30:00.000Z");
  });
});
