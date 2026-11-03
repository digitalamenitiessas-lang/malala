import { describe, it, expect } from "vitest";
import {
  comisionMontoServicio,
  factorEfectivoSobreLista,
  computeDescuento,
  computeRecargos,
  tramosDePago,
  buildFacturadoPorLineaMap,
  buildCostoInsumosByServicio,
  buildRecetasByServicio,
  detallarLineas,
} from "./ingresos-helpers";
import type { IngresoLinea, Insumo } from "@/lib/types";

describe("computeDescuento", () => {
  it("descuento por porcentaje", () => {
    const r = computeDescuento({ subtotal: 1000, descuentoTipo: "pct", descuentoValor: 10 });
    expect(r.descuentoMonto).toBe(100);
    expect(r.descuentoPct).toBe(10);
    expect(r.totalNeto).toBe(900);
  });

  it("descuento por monto fijo deriva el porcentaje", () => {
    const r = computeDescuento({ subtotal: 1000, descuentoTipo: "monto", descuentoValor: 250 });
    expect(r.descuentoMonto).toBe(250);
    expect(r.descuentoPct).toBe(25);
    expect(r.totalNeto).toBe(750);
  });

  it("sin descuento", () => {
    const r = computeDescuento({ subtotal: 500, descuentoTipo: "pct", descuentoValor: 0 });
    expect(r.descuentoMonto).toBe(0);
    expect(r.totalNeto).toBe(500);
  });

  it("subtotal 0 no divide por cero al derivar pct", () => {
    const r = computeDescuento({ subtotal: 0, descuentoTipo: "monto", descuentoValor: 0 });
    expect(r.descuentoPct).toBe(0);
    expect(r.totalNeto).toBe(0);
  });
});

describe("computeRecargos", () => {
  it("sin recargo: total = neto y cobrado = valores", () => {
    const r = computeRecargos({
      totalNeto: 1000,
      mp1Id: "ef",
      valor1: 1000,
      recargoPctById: new Map(),
    });
    expect(r.valor1Cobrado).toBe(1000);
    expect(r.valor2Cobrado).toBeNull();
    expect(r.total).toBe(1000);
  });

  it("recargo de tarjeta sobre la porción cobrada con ese medio", () => {
    // mp1 efectivo (0%), mp2 tarjeta (10%) sobre 500 → +50
    const r = computeRecargos({
      totalNeto: 1000,
      mp1Id: "ef",
      valor1: 500,
      mp2Id: "tc",
      valor2: 500,
      recargoPctById: new Map([
        ["ef", 0],
        ["tc", 10],
      ]),
    });
    expect(r.recargo1).toBe(0);
    expect(r.recargo2).toBe(50);
    expect(r.valor1Cobrado).toBe(500);
    expect(r.valor2Cobrado).toBe(550);
    expect(r.total).toBe(1050);
  });

  it("valor2 nulo no genera recargo2", () => {
    const r = computeRecargos({
      totalNeto: 800,
      mp1Id: "tc",
      valor1: 800,
      mp2Id: undefined,
      valor2: null,
      recargoPctById: new Map([["tc", 5]]),
    });
    expect(r.recargo1).toBe(40);
    expect(r.recargo2).toBe(0);
    expect(r.valor1Cobrado).toBe(840);
    expect(r.valor2Cobrado).toBeNull();
    expect(r.total).toBe(840);
  });

  it("recargo del tercer medio sobre su porción", () => {
    // gift + gift + tarjeta 10% sobre 3.000 → +300
    const r = computeRecargos({
      totalNeto: 10000,
      mp1Id: "gift",
      valor1: 4000,
      mp2Id: "gift",
      valor2: 3000,
      mp3Id: "tc",
      valor3: 3000,
      recargoPctById: new Map([
        ["gift", 0],
        ["tc", 10],
      ]),
    });
    expect(r.recargo3).toBe(300);
    expect(r.valor3Cobrado).toBe(3300);
    expect(r.total).toBe(10300);
  });

  it("sin tercer medio, valor3Cobrado es null aunque venga un importe", () => {
    const r = computeRecargos({
      totalNeto: 1000,
      mp1Id: "ef",
      valor1: 1000,
      valor3: 0,
      recargoPctById: new Map(),
    });
    expect(r.recargo3).toBe(0);
    expect(r.valor3Cobrado).toBeNull();
  });
});

describe("tramosDePago", () => {
  it("devuelve los tres medios en orden con su banco", () => {
    const t = tramosDePago({
      mp1_id: "gift",
      valor1: 20000,
      mp2_id: "gift",
      valor2: 15000,
      mp3_id: "transf",
      valor3: 15000,
      mp3_cuenta_id: "macro",
    });
    expect(t).toEqual([
      { mpId: "gift", valor: 20000, cuentaId: undefined },
      { mpId: "gift", valor: 15000, cuentaId: undefined },
      { mpId: "transf", valor: 15000, cuentaId: "macro" },
    ]);
  });

  it("el primero va siempre; el 2 y el 3 sólo con medio e importe", () => {
    expect(tramosDePago({ mp1_id: "ef", valor1: 0 })).toHaveLength(1);
    expect(
      tramosDePago({ mp1_id: "ef", valor1: 100, mp2_id: "tc", valor2: 0, mp3_id: "tr" }),
    ).toEqual([{ mpId: "ef", valor: 100, cuentaId: undefined }]);
  });
});

describe("comisionMontoServicio", () => {
  // El caso que reportó Centro: Kapping con precio de lista $31.200 y precio en
  // efectivo $26.000. La clienta paga con tarjeta, así que se cobra $31.200; la
  // diferencia de $5.200 es el recargo de la tarjeta, que lo paga el local.
  it("paga sobre el precio en efectivo aunque se haya cobrado el de lista", () => {
    const c = comisionMontoServicio({
      precioCobrado: 31200,
      precioEfectivoServicio: 26000,
      esDePromo: false,
      comisionPct: 30,
      soportaDescuento: true,
      subtotal: 31200,
      descuentoMonto: 0,
    });
    expect(c).toBe(7800); // 30% de 26.000, no de 31.200
  });

  // Las líneas de una promo valen una fracción del precio de la promo: ahí el
  // precio bajo es el acordado, no un recargo de menos. Con el precio de
  // catálogo se pagaría comisión sobre plata que nadie cobró.
  it("las líneas de promo comisionan sobre lo cobrado", () => {
    const c = comisionMontoServicio({
      precioCobrado: 12000,
      precioEfectivoServicio: 26000,
      esDePromo: true,
      comisionPct: 30,
      soportaDescuento: true,
      subtotal: 12000,
      descuentoMonto: 0,
    });
    expect(c).toBe(3600); // 30% de 12.000
  });

  it("sin precio de catálogo cae a lo cobrado", () => {
    const c = comisionMontoServicio({
      precioCobrado: 800,
      precioEfectivoServicio: undefined,
      esDePromo: false,
      comisionPct: 30,
      soportaDescuento: true,
      subtotal: 800,
      descuentoMonto: 0,
    });
    expect(c).toBe(240);
  });

  it("soporta_descuento=false → el descuento del ticket no le baja la comisión", () => {
    const c = comisionMontoServicio({
      precioCobrado: 1000,
      precioEfectivoServicio: 800,
      esDePromo: false,
      comisionPct: 30,
      soportaDescuento: false,
      subtotal: 1000,
      descuentoMonto: 100,
    });
    expect(c).toBe(240); // 30% de 800, entero
  });

  // Publicidad / canje: el servicio se regala por decisión del negocio, así que
  // el 100% de descuento no puede dejar la comisión en cero. Caso real: Kapping
  // de YB (lista $27.500, efectivo $22.000) a una influencer.
  it("con el descuento a cargo del local, el 100% off no toca la comisión", () => {
    const c = comisionMontoServicio({
      precioCobrado: 22000,
      precioEfectivoServicio: 22000,
      esDePromo: false,
      comisionPct: 30,
      soportaDescuento: false,
      subtotal: 22000,
      descuentoMonto: 22000, // 100%
    });
    expect(c).toBe(6600);
  });

  it("soporta_descuento=true descuenta la parte del ticket que le toca", () => {
    // línea de 1000 sobre subtotal 1000 → se lleva todo el descuento de 100
    const c = comisionMontoServicio({
      precioCobrado: 1000,
      precioEfectivoServicio: 1000,
      esDePromo: false,
      comisionPct: 30,
      soportaDescuento: true,
      subtotal: 1000,
      descuentoMonto: 100,
    });
    expect(c).toBe(270); // 30% de 900
  });

  it("prorratea el descuento entre varias líneas", () => {
    // subtotal 2000, descuento 200; esta línea aporta 500 → le toca 50
    const c = comisionMontoServicio({
      precioCobrado: 500,
      precioEfectivoServicio: 500,
      esDePromo: false,
      comisionPct: 30,
      soportaDescuento: true,
      subtotal: 2000,
      descuentoMonto: 200,
    });
    expect(c).toBeCloseTo(135, 5); // 30% de 450
  });

  // Un descuento grande sobre un ticket de varias líneas puede dejar la base
  // por debajo de cero. La comisión es cero, no una deuda de la empleada.
  it("nunca devuelve una comisión negativa", () => {
    const c = comisionMontoServicio({
      precioCobrado: 1000,
      precioEfectivoServicio: 200,
      esDePromo: false,
      comisionPct: 30,
      soportaDescuento: true,
      subtotal: 1000,
      descuentoMonto: 1200,
    });
    expect(c).toBe(0);
  });

  // Caso real de Anita: Nutrición intensa cargada a precio de lista ($190.000,
  // efectivo $152.000) con 35% off. El descuento en pesos está calculado sobre
  // el precio de tarjeta; restárselo tal cual al precio en efectivo le cobraría
  // el recargo dos veces.
  it("el descuento se aplica como tasa, no como monto, sobre la base", () => {
    const c = comisionMontoServicio({
      precioCobrado: 190000,
      precioEfectivoServicio: 152000,
      esDePromo: false,
      comisionPct: 30,
      soportaDescuento: true,
      subtotal: 190000,
      descuentoMonto: 66500, // 35%
    });
    expect(c).toBe(29640); // 30% de (152.000 − 35%) = 30% de 98.800
  });

  it("subtotal 0 no divide por cero", () => {
    const c = comisionMontoServicio({
      precioCobrado: 0,
      precioEfectivoServicio: 0,
      esDePromo: false,
      comisionPct: 30,
      soportaDescuento: true,
      subtotal: 0,
      descuentoMonto: 0,
    });
    expect(c).toBe(0);
  });
});

/**
 * Un combo se puede canjear en visitas distintas: el salón lo vende como gift
 * card y deja usar cada servicio el día que la clienta pueda. Ahí el ticket
 * trae UNA línea de un combo de dos, y cada línea ya tiene guardada su parte.
 *
 * El reparto de abajo existe para repartir el precio del combo entre sus
 * líneas. Aplicado a un combo a medias le daba a esa única línea el precio
 * COMPLETO: un combo de $50.000 usado en dos días figuraba como $100.000
 * facturados, y las dos profesionales cobraban como si cada una hubiera hecho
 * el combo entero.
 */
describe("buildFacturadoPorLineaMap: combos canjeados por partes", () => {
  const COMBO = "combo-relax";
  const linea = (id: string, subtotal: number, precioLista: number) =>
    ({
      id,
      ingreso_id: "t1",
      servicio_id: `sv-${id}`,
      empleado_id: "emp",
      precio_efectivo: subtotal,
      cantidad: 1,
      subtotal,
      comision_pct: 30,
      comision_monto: 0,
      promo_servicio_id: COMBO,
      soporta_descuento: true,
      servicio: { precio_lista: precioLista } as never,
      insumo: null,
      empleado: null,
      costoInsumos: 0,
    }) as never;

  const ticket = (lineas: unknown[]) =>
    ({ ingreso: {}, cliente: null, mp1: null, mp2: null, lineas } as never);

  const precios = new Map([[COMBO, 50000]]);
  const componentes = new Map([[COMBO, 2]]);

  it("con el combo entero reparte el precio del combo", () => {
    const map = buildFacturadoPorLineaMap(
      ticket([linea("a", 23684.21, 45000), linea("b", 26315.79, 50000)]),
      precios,
      componentes,
    );
    expect(map.get("a")! + map.get("b")!).toBeCloseTo(50000, 2);
  });

  it("con media visita NO le da el combo entero a la única línea", () => {
    const map = buildFacturadoPorLineaMap(
      ticket([linea("b", 26315.79, 50000)]),
      precios,
      componentes,
    );
    expect(map.get("b")).toBeCloseTo(26315.79, 2);
    expect(map.get("b")).not.toBe(50000);
  });

  it("las dos visitas por separado suman el combo, no el doble", () => {
    const visita1 = buildFacturadoPorLineaMap(
      ticket([linea("a", 23684.21, 45000)]),
      precios,
      componentes,
    );
    const visita2 = buildFacturadoPorLineaMap(
      ticket([linea("b", 26315.79, 50000)]),
      precios,
      componentes,
    );
    expect(visita1.get("a")! + visita2.get("b")!).toBeCloseTo(50000, 2);
  });

  it("sin el dato de componentes mantiene el comportamiento viejo", () => {
    // Los tickets de antes siguen leyéndose igual: si no se sabe cuántos
    // servicios tiene el combo, no se puede distinguir media visita.
    const map = buildFacturadoPorLineaMap(
      ticket([linea("b", 26315.79, 50000)]),
      precios,
    );
    expect(map.get("b")).toBe(50000);
  });
});

/**
 * Una promo cobrada con tarjeta va a precio de lista: "Semi manos + pies"
 * $40.000 en efectivo, $50.000 con crédito. La comisión sigue siendo sobre
 * efectivo, como en un servicio suelto, y el reporte la muestra a $50.000.
 */
describe("promo cobrada a precio de lista", () => {
  it("comisiona sobre la parte en efectivo, no sobre el recargo", () => {
    const c = comisionMontoServicio({
      precioCobrado: 23809.52,
      esDePromo: true,
      factorPromoLista: factorEfectivoSobreLista(40000, 50000),
      comisionPct: 30,
      soportaDescuento: true,
      subtotal: 50000,
      descuentoMonto: 0,
    });
    // 30% de su parte en efectivo (19.047,62), igual que si pagaba en efectivo.
    expect(c).toBeCloseTo(5714.29, 1);
  });

  it("el reporte no le reparte el precio en efectivo a un combo cobrado a lista", () => {
    const linea = (id: string, subtotal: number, precioLista: number) =>
      ({
        id,
        subtotal,
        cantidad: 1,
        promo_servicio_id: "semi-mp",
        servicio: { precio_lista: precioLista },
      }) as never;
    const map = buildFacturadoPorLineaMap(
      { ingreso: {}, cliente: null, mp1: null, mp2: null, lineas: [linea("a", 23809.52, 25000), linea("b", 26190.48, 27500)] } as never,
      new Map([["semi-mp", 40000]]),
      new Map([["semi-mp", 2]]),
      new Map([["semi-mp", 50000]]),
    );
    expect(map.get("a")! + map.get("b")!).toBeCloseTo(50000, 2);
  });
});

describe("detallarLineas: tintura cambiada al cobrar", () => {
  const insumo = (id: string, nombre: string, precio_unitario: number) =>
    ({ id, nombre, precio_unitario }) as unknown as Insumo;
  const insumosById = new Map([
    ["majirel", insumo("majirel", "Tintura Majirel", 170)],
    ["igora", insumo("igora", "Tintura Igora Royal", 311.5)],
    ["oxi", insumo("oxi", "Oxidante", 20)],
  ]);
  const recetas = [
    { id: "r1", sucursal_id: "yb", servicio_id: "raiz", insumo_id: "majirel", cantidad: 30, confirmada: true },
    { id: "r2", sucursal_id: "yb", servicio_id: "raiz", insumo_id: "oxi", cantidad: 45, confirmada: true },
  ];
  const lookups = {
    serviciosById: new Map(),
    insumosById,
    empleadosById: new Map(),
    costoInsumosByServicio: buildCostoInsumosByServicio(recetas, [...insumosById.values()]),
    recetasByServicio: buildRecetasByServicio(recetas),
  };
  const linea = (reemplazos?: Record<string, string>) =>
    ({
      id: "l1",
      ingreso_id: "v1",
      servicio_id: "raiz",
      precio_efectivo: 100000,
      cantidad: 2,
      subtotal: 200000,
      comision_pct: 30,
      comision_monto: 0,
      soporta_descuento: true,
      reemplazos,
    }) as IngresoLinea;

  it("sin cambio, el costo es el de la receta", () => {
    const [l] = detallarLineas([linea()], lookups, "yb");
    expect(l.costoInsumos).toBeCloseTo(2 * (30 * 170 + 45 * 20));
    expect(l.tinturasCambiadas).toBeUndefined();
  });

  it("con Igora, los mismos gramos a precio de Igora", () => {
    const [l] = detallarLineas([linea({ majirel: "igora" })], lookups, "yb");
    expect(l.costoInsumos).toBeCloseTo(2 * (30 * 311.5 + 45 * 20));
    expect(l.tinturasCambiadas).toEqual([{ receta: "Tintura Majirel", usada: "Tintura Igora Royal" }]);
  });
});
