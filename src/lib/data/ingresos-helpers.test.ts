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
  const base = { subtotal: 1000, descuentoMonto: 100 }; // 10% de descuento global

  it("soporta_descuento=false → sobre el precio de la línea, ignora el descuento", () => {
    const c = comisionMontoServicio({
      precioEfectivo: 800,
      comisionPct: 30,
      soportaDescuento: false,
      ...base,
    });
    expect(c).toBe(240); // 30% de 800, el descuento del ticket no la toca
  });

  // La regresión que motivó sacar precio_lista de acá: el servicio tiene una
  // segunda columna de precio (la de tarjeta) que no tiene nada que ver con el
  // descuento del ticket. Sin descuento, los dos criterios TIENEN que dar igual.
  it("sin descuento en el ticket, los dos criterios dan lo mismo", () => {
    const args = { precioEfectivo: 215000, comisionPct: 30, subtotal: 215000, descuentoMonto: 0 };
    expect(comisionMontoServicio({ ...args, soportaDescuento: true })).toBe(64500);
    expect(comisionMontoServicio({ ...args, soportaDescuento: false })).toBe(64500);
  });

  it("soporta_descuento=true → comisión sobre el precio final con descuento prorrateado", () => {
    // línea de 1000 sobre subtotal 1000 → se lleva todo el descuento de 100 → base 900
    const c = comisionMontoServicio({
      precioEfectivo: 1000,
      comisionPct: 30,
      soportaDescuento: true,
      subtotal: 1000,
      descuentoMonto: 100,
    });
    expect(c).toBe(270); // 30% de 900
  });

  it("soporta_descuento=true prorratea el descuento entre varias líneas", () => {
    // subtotal 2000, descuento 200; esta línea aporta 500 → le toca 50 de descuento → base 450
    const c = comisionMontoServicio({
      precioEfectivo: 500,
      comisionPct: 30,
      soportaDescuento: true,
      subtotal: 2000,
      descuentoMonto: 200,
    });
    expect(c).toBeCloseTo(135, 5); // 30% de 450
  });

  it("subtotal 0 no divide por cero", () => {
    const c = comisionMontoServicio({
      precioEfectivo: 0,
      comisionPct: 30,
      soportaDescuento: true,
      subtotal: 0,
      descuentoMonto: 0,
    });
    expect(c).toBe(0);
  });
});
