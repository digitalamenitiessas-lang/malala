import { describe, it, expect } from "vitest";
import {
  comisionMontoServicio,
  computeDescuento,
  computeRecargos,
} from "./ingresos-helpers";

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
