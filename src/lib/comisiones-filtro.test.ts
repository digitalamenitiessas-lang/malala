import { describe, it, expect } from "vitest";

/**
 * Filtrar ventas por empleada tiene que traer SUS lineas, no las del ticket
 * entero.
 *
 * El salon lo encontro controlando comisiones antes de liquidar: "en Angela me
 * tendria que dar $42.000 no $53.700... en la venta de Facunda Garcia quizas
 * esta el problema, hay dos profesionales que lo realizaron". La diferencia
 * eran las dos lineas de la otra profesional en ese mismo ticket.
 */
interface Linea {
  ingreso_id: string;
  empleado_id: string | null;
  comision_monto: number;
}

/** La misma cuenta que hace listIngresos al filtrar por empleada. */
function lineasDeEmpleada(lineas: Linea[], empleadoId: string): Linea[] {
  const ventasSuyas = new Set(
    lineas.filter((l) => l.empleado_id === empleadoId).map((l) => l.ingreso_id),
  );
  return lineas.filter(
    (l) => ventasSuyas.has(l.ingreso_id) && l.empleado_id === empleadoId,
  );
}

const ticketCompartido: Linea[] = [
  { ingreso_id: "v1", empleado_id: "camila", comision_monto: 6000 },
  { ingreso_id: "v1", empleado_id: "camila", comision_monto: 5700 },
  { ingreso_id: "v1", empleado_id: "angela", comision_monto: 6000 },
  { ingreso_id: "v2", empleado_id: "angela", comision_monto: 12000 },
];

describe("comisiones al filtrar por empleada", () => {
  it("un ticket de dos profesionales no le suma la comisión de la otra", () => {
    const suyas = lineasDeEmpleada(ticketCompartido, "angela");
    const total = suyas.reduce((s, l) => s + l.comision_monto, 0);
    expect(total).toBe(18000);
  });

  it("no se cuela ninguna línea ajena", () => {
    const suyas = lineasDeEmpleada(ticketCompartido, "angela");
    expect(suyas.every((l) => l.empleado_id === "angela")).toBe(true);
  });

  it("a la otra profesional le da lo suyo, no lo del ticket", () => {
    const suyas = lineasDeEmpleada(ticketCompartido, "camila");
    expect(suyas.reduce((s, l) => s + l.comision_monto, 0)).toBe(11700);
  });

  it("las dos partes suman el ticket completo y no más", () => {
    const a = lineasDeEmpleada(ticketCompartido, "angela")
      .filter((l) => l.ingreso_id === "v1")
      .reduce((s, l) => s + l.comision_monto, 0);
    const c = lineasDeEmpleada(ticketCompartido, "camila")
      .filter((l) => l.ingreso_id === "v1")
      .reduce((s, l) => s + l.comision_monto, 0);
    expect(a + c).toBe(17700);
  });
});
