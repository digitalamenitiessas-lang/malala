import { describe, expect, it } from "vitest";
import {
  diasTrabajadosEnPeriodo,
  esDePeriodoAnterior,
  pisoDePendientes,
} from "./liquidacion-periodo";

describe("pisoDePendientes", () => {
  it("el caso de Ángela: la venta del 24 entra en el período que arranca el 25", () => {
    // Su primera liquidación arrancó el 18: todo lo suelto desde ahí entra.
    const piso = pisoDePendientes("2026-10-18", "2026-10-25");
    expect(piso).toBe("2026-10-18");
    expect("2026-10-24" >= piso).toBe(true);
  });

  it("quien nunca se liquidó arranca en el desde del período, no en el principio de los tiempos", () => {
    expect(pisoDePendientes(null, "2026-10-25")).toBe("2026-10-25");
    expect(pisoDePendientes(undefined, "2026-10-25")).toBe("2026-10-25");
  });

  it("lo de antes de la primera liquidación no se arrastra", () => {
    expect(pisoDePendientes("2026-09-01", "2026-10-25")).toBe("2026-09-01");
    expect("2026-08-31" >= pisoDePendientes("2026-09-01", "2026-10-25")).toBe(
      false,
    );
  });

  it("un período cargado para atrás, antes de la primera, usa su propio desde", () => {
    expect(pisoDePendientes("2026-10-18", "2026-10-04")).toBe("2026-10-04");
  });
});

describe("esDePeriodoAnterior", () => {
  it("marca lo de antes del desde y nada más", () => {
    expect(esDePeriodoAnterior("2026-10-24", "2026-10-25")).toBe(true);
    expect(esDePeriodoAnterior("2026-10-25", "2026-10-25")).toBe(false);
    expect(esDePeriodoAnterior("2026-10-24T15:00:00.000Z", "2026-10-25")).toBe(
      true,
    );
  });
});

describe("diasTrabajadosEnPeriodo", () => {
  it("una línea vieja se paga pero no suma un día al período", () => {
    const fechas = ["2026-10-24", "2026-10-25", "2026-10-25", "2026-10-27"];
    expect(diasTrabajadosEnPeriodo(fechas, "2026-10-25", "2026-10-31")).toBe(2);
  });

  it("sin líneas en el período, cero días", () => {
    expect(diasTrabajadosEnPeriodo(["2026-10-24"], "2026-10-25", "2026-10-31")).toBe(
      0,
    );
  });
});
