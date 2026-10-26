import { describe, expect, it } from "vitest";
import {
  calcularLiquidacion,
  resolverPago,
  type ArgsLiquidacion,
} from "./liquidacion-formula";

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

/**
 * El salón paga redondeado y la diferencia no se regala: "cuando me dice
 * $237.340 yo pago $237.000, en el sistema viejo la empleada queda con un
 * saldo a favor para la semana que viene".
 */
describe("arrastre de lo que quedó debiéndose", () => {
  const base = {
    tipoComision: "porcentaje" as const,
    totalComision: 200_000,
    sueldoHoras: 100_000,
    sueldoBasico: 0,
    viaticoAPagar: 0,
    totalAnticipos: 0,
  };

  it("suma al total lo que quedó debiendo de la semana pasada", () => {
    expect(calcularLiquidacion({ ...base, arrastre: 340 }).total).toBe(200_340);
  });

  it("sin arrastre el total no cambia", () => {
    expect(calcularLiquidacion(base).total).toBe(200_000);
    expect(calcularLiquidacion({ ...base, arrastre: 0 }).total).toBe(200_000);
  });

  it("no toca la base: el arreglo es el mismo, lo que cambia es lo que se paga", () => {
    const r = calcularLiquidacion({ ...base, arrastre: 340 });
    expect(r.base).toBe(200_000);
    expect(r.gana).toBe("comision");
  });

  it("el caso que lo pidió: cobra $237.340, le pagan $237.000, arrastra $340", () => {
    const semana1 = calcularLiquidacion({
      ...base,
      totalComision: 237_340,
      sueldoHoras: 0,
    });
    expect(semana1.total).toBe(237_340);

    // Le pagan redondeado. Lo que no se pagó entra en la semana siguiente.
    const pagado = 237_000;
    const semana2 = calcularLiquidacion({
      ...base,
      totalComision: 180_000,
      sueldoHoras: 0,
      arrastre: semana1.total - pagado,
    });
    expect(semana2.total).toBe(180_340);
  });

  it("redondeado para ARRIBA: lo de más se le descuenta la semana siguiente", () => {
    // "Si me dice $153.760 yo pago $154.000. Así muchas veces."
    const semana1 = calcularLiquidacion({
      ...base,
      totalComision: 153_760,
      sueldoHoras: 0,
    });
    expect(semana1.total).toBe(153_760);

    const pagado = 154_000;
    const semana2 = calcularLiquidacion({
      ...base,
      totalComision: 200_000,
      sueldoHoras: 0,
      arrastre: semana1.total - pagado, // −240
    });
    expect(semana2.total).toBe(199_760);
  });

  it("un arrastre negativo nunca deja el total por debajo de cero a escondidas", () => {
    // Si lo adelantado se come toda la semana, el total queda negativo y eso
    // tiene que verse: significa que sigue debiendo.
    const r = calcularLiquidacion({
      ...base,
      totalComision: 1_000,
      sueldoHoras: 0,
      arrastre: -5_000,
    });
    expect(r.total).toBe(-4_000);
  });

  it("convive con viáticos y anticipos", () => {
    const r = calcularLiquidacion({
      ...base,
      viaticoAPagar: 9_000,
      totalAnticipos: 50_000,
      arrastre: 340,
    });
    expect(r.total).toBe(200_000 + 9_000 - 50_000 + 340);
  });
});

describe("descuentos que no salieron de la caja", () => {
  const base = {
    tipoComision: "porcentaje" as const,
    totalComision: 300_000,
    sueldoHoras: 100_000,
    sueldoBasico: 0,
    viaticoAPagar: 0,
    totalAnticipos: 0,
  };

  it("el caso que lo pidió: un curso de $47.500 baja lo que se le paga", () => {
    expect(calcularLiquidacion({ ...base, totalDescuentos: 47_500 }).total).toBe(
      252_500,
    );
  });

  it("sin descuentos el total no cambia", () => {
    expect(calcularLiquidacion(base).total).toBe(300_000);
    expect(calcularLiquidacion({ ...base, totalDescuentos: 0 }).total).toBe(
      300_000,
    );
  });

  it("no toca la base: el arreglo es el mismo", () => {
    const r = calcularLiquidacion({ ...base, totalDescuentos: 47_500 });
    expect(r.base).toBe(300_000);
    expect(r.gana).toBe("comision");
  });

  it("se suman a los anticipos sin confundirse con ellos", () => {
    // Los dos restan, pero uno ya salio del cajon y el otro no. La cuenta es
    // la misma; lo que no puede pasar es que uno se cobre dos veces por estar
    // contado en los dos lados.
    const r = calcularLiquidacion({
      ...base,
      totalAnticipos: 100_000,
      totalDescuentos: 47_500,
    });
    expect(r.total).toBe(300_000 - 100_000 - 47_500);
  });

  it("convive con viáticos y arrastre", () => {
    const r = calcularLiquidacion({
      ...base,
      viaticoAPagar: 12_000,
      totalAnticipos: 100_000,
      totalDescuentos: 47_500,
      arrastre: -660,
    });
    expect(r.total).toBe(300_000 + 12_000 - 100_000 - 47_500 - 660);
  });
});

/**
 * Un total negativo: los descuentos superaron lo que ganó. No se le entrega
 * nada, y lo que quedó debiendo tiene que pasar a la próxima. Antes el 0 que
 * mandaba el formulario se tiraba como vacío y la deuda desaparecía.
 */
describe("pago de una liquidación con total negativo", () => {
  /** La cuenta de getArrastrePendiente para una liquidación pagada. */
  const debido = (totalPagar: number, totalPagado: number | null) =>
    totalPagar - (totalPagado ?? totalPagar);

  it("pagar 0 guarda el 0 y la deuda pasa a la próxima", () => {
    const total = calcularLiquidacion(
      args({ totalComision: 20_000, totalDescuentos: 35_000 }),
    ).total;
    expect(total).toBe(-15_000);

    const pago = resolverPago(total, 0);
    expect(pago.montoAPagar).toBe(0);
    expect(pago.totalPagado).toBe(0);
    expect(pago.quedaAFavor).toBe(-15_000);
    expect(debido(total, pago.totalPagado)).toBe(-15_000);

    // La semana siguiente se le descuenta.
    const proxima = calcularLiquidacion(
      args({ totalComision: 100_000, arrastre: debido(total, pago.totalPagado) }),
    );
    expect(proxima.total).toBe(85_000);
  });

  it("sin monto cargado tampoco se pierde: no se entrega nada y queda la deuda", () => {
    const pago = resolverPago(-15_000);
    expect(pago.montoAPagar).toBe(0);
    expect(pago.totalPagado).toBe(0);
    expect(debido(-15_000, pago.totalPagado)).toBe(-15_000);
  });

  it("si igual le dan algo, se suma a lo que debe", () => {
    const pago = resolverPago(-15_000, 5_000);
    expect(pago.montoAPagar).toBe(5_000);
    expect(debido(-15_000, pago.totalPagado)).toBe(-20_000);
  });
});

describe("pago de una liquidación con total positivo", () => {
  it("pagar justo no guarda nada aparte", () => {
    expect(resolverPago(237_340, 237_340)).toEqual({
      montoAPagar: 237_340,
      totalPagado: null,
      quedaAFavor: 0,
    });
    expect(resolverPago(237_340).totalPagado).toBeNull();
  });

  it("redondeado para abajo queda a favor de ella", () => {
    const pago = resolverPago(237_340, 237_000);
    expect(pago.totalPagado).toBe(237_000);
    expect(pago.quedaAFavor).toBe(340);
  });
});
