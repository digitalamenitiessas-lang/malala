import { describe, expect, it } from "vitest";
import { calcularLiquidacion, type ArgsLiquidacion } from "./liquidacion-formula";

const args = (o: Partial<ArgsLiquidacion> = {}): ArgsLiquidacion => ({
  tipoComision: "porcentaje",
  totalComision: 0,
  sueldoHoras: 0,
  sueldoBasico: 0,
  viaticoAPagar: 0,
  totalAnticipos: 0,
  ...o,
});

/**
 * El caso que lo motivó: una liquidación de Jessica mostraba comisiones
 * $226.800 + sueldo por horas $240.000 = $466.800. Lo correcto era $240.000.
 *
 * El sistema sumaba los tres conceptos para todo el mundo, sin distinguir los
 * tres arreglos que tiene el salón. Reportado así: "me está sumando el
 * asegurado más comisión, y es solo una de las dos, la que sea mayor".
 */
describe("profesional · cobra la mayor, nunca las dos", () => {
  it("el caso de Jessica: asegurado 240.000 contra comisión 226.800", () => {
    const r = calcularLiquidacion(
      args({ totalComision: 226800, sueldoHoras: 240000 }),
    );
    expect(r.total).toBe(240000);
    expect(r.gana).toBe("asegurado");
    // Lo que hacía antes y estaba mal.
    expect(r.total).not.toBe(226800 + 240000);
  });

  it("si comisionó más que el asegurado, cobra la comisión", () => {
    const r = calcularLiquidacion(
      args({ totalComision: 250000, sueldoHoras: 240000 }),
    );
    expect(r.total).toBe(250000);
    expect(r.gana).toBe("comision");
  });

  it("el asegurado es un piso, no un extra: nunca cobra menos", () => {
    const r = calcularLiquidacion(
      args({ totalComision: 1000, sueldoHoras: 240000 }),
    );
    expect(r.total).toBe(240000);
  });

  it("empatados, cobra lo mismo y se lo llama asegurado", () => {
    const r = calcularLiquidacion(
      args({ totalComision: 240000, sueldoHoras: 240000 }),
    );
    expect(r.total).toBe(240000);
    expect(r.gana).toBe("asegurado");
  });
});

describe("encargada · horas MÁS comisión", () => {
  it("suma, porque su comisión es por productos y no compite con las horas", () => {
    const r = calcularLiquidacion(
      args({ tipoComision: "sueldo_fijo", totalComision: 18000, sueldoHoras: 132000 }),
    );
    expect(r.total).toBe(150000);
    expect(r.gana).toBeNull();
  });

  it("sin ventas de producto cobra sus horas igual", () => {
    const r = calcularLiquidacion(
      args({ tipoComision: "sueldo_fijo", sueldoHoras: 132000 }),
    );
    expect(r.total).toBe(132000);
  });
});

describe("mixto · el caso de Valentina, todo suma", () => {
  it("comisión + horas de encargada + básico", () => {
    const r = calcularLiquidacion(
      args({
        tipoComision: "mixto",
        totalComision: 180000,
        sueldoHoras: 60000,
        sueldoBasico: 50000,
      }),
    );
    expect(r.total).toBe(290000);
  });

  it("el básico sólo cuenta en mixto, no en profesional", () => {
    const comun = { totalComision: 100000, sueldoHoras: 0, sueldoBasico: 50000 };
    expect(calcularLiquidacion(args({ ...comun, tipoComision: "mixto" })).total).toBe(150000);
    expect(calcularLiquidacion(args({ ...comun, tipoComision: "porcentaje" })).total).toBe(100000);
  });
});

describe("viáticos y anticipos van en los tres arreglos", () => {
  it("se suman y se restan después del arreglo, no compiten con el asegurado", () => {
    const r = calcularLiquidacion(
      args({
        totalComision: 226800,
        sueldoHoras: 240000,
        viaticoAPagar: 12000,
        totalAnticipos: 30000,
      }),
    );
    // 240.000 (la mayor) + 12.000 − 30.000
    expect(r.total).toBe(222000);
    expect(r.base).toBe(240000);
  });

  it("un anticipo grande puede dejar el total en negativo y eso se ve", () => {
    // No se acota a cero a propósito: si se le adelantó más de lo que ganó, el
    // número negativo es el dato —queda a favor del salón— y taparlo lo
    // perdería.
    const r = calcularLiquidacion(
      args({ totalComision: 50000, sueldoHoras: 40000, totalAnticipos: 80000 }),
    );
    expect(r.total).toBe(-30000);
  });
});
