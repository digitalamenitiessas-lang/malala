import { describe, expect, it } from "vitest";
import {
  armarReporteStock,
  calcularConteo,
  conceptoDe,
  consumoDiario,
  saldoEnMomento,
  sugerirCompra,
  validarEntradaConteo,
  type MovimientoCalculo,
} from "./stock-control";

const mov = (
  fecha: string,
  tipo: MovimientoCalculo["tipo"],
  cantidad: number,
  extra: Partial<MovimientoCalculo> = {},
): MovimientoCalculo => ({ insumo_id: "a", tipo, cantidad, fecha, ...extra });

describe("saldoEnMomento", () => {
  it("deshace lo que se movió después del instante", () => {
    const movs = [
      mov("2026-11-03T10:00:00Z", "compra", 10),
      mov("2026-11-03T15:00:00Z", "venta", -3),
      mov("2026-11-03T16:00:00Z", "venta", -2, { ubicacion: "deposito" }),
    ];
    // Se contó a las 12: después salieron 5 (2 del depósito).
    expect(saldoEnMomento({ cantidad: 20, deposito: 4 }, movs, "2026-11-03T12:00:00Z")).toEqual({
      cantidad: 25,
      deposito: 6,
    });
  });

  it("la reposición no cambia el total, vuelve al depósito", () => {
    const movs = [
      mov("2026-11-03T15:00:00Z", "reposicion", 3),
      mov("2026-11-03T15:00:00Z", "venta", -1),
    ];
    expect(saldoEnMomento({ cantidad: 5, deposito: 0 }, movs, "2026-11-03T12:00:00Z")).toEqual({
      cantidad: 6,
      deposito: 3,
    });
  });
});

describe("calcularConteo", () => {
  const tintura = { tipo: "bacha" as const, tamano_envase: 60, precio_unitario: 311.5 };
  const shampoo = { tipo: "venta" as const, tamano_envase: 1, precio_unitario: 1000 };

  it("bacha: en envases, con los abiertos como fracción", () => {
    // 93 cerrados y 21 abiertos a la mitad = 103,5 pomos.
    const r = calcularConteo(tintura, { cantidad: 6000, deposito: 0 }, { envases: 103.5 });
    expect(r).toMatchObject({ contado: { cantidad: 6210, deposito: 0 }, diferencia: 210 });
    expect(r!.valor).toBeCloseTo(210 * 311.5);
  });

  it("reventa: lo que no se contó queda como estaba", () => {
    const sistema = { cantidad: 10, deposito: 6 };
    expect(calcularConteo(shampoo, sistema, { exhibicion: 2 })).toMatchObject({
      contado: { cantidad: 8, deposito: 6 },
      diferencia: -2,
      diferenciaDeposito: 0,
      diferenciaExhibicion: -2,
    });
    expect(calcularConteo(shampoo, sistema, { deposito: 7, exhibicion: 4 })).toMatchObject({
      contado: { cantidad: 11, deposito: 7 },
      diferencia: 1,
      diferenciaDeposito: 1,
      diferenciaExhibicion: 0,
    });
  });

  it("sin nada cargado no hay conteo", () => {
    expect(calcularConteo(tintura, { cantidad: 1, deposito: 0 }, {})).toBeNull();
    expect(calcularConteo(shampoo, { cantidad: 1, deposito: 0 }, { envases: 3 })).toBeNull();
  });

  it("valida lo cargado", () => {
    expect(validarEntradaConteo({ envases: -1 })).toMatch(/negativo/);
    expect(validarEntradaConteo({ deposito: Number.NaN })).toMatch(/número/);
    expect(validarEntradaConteo({ envases: 0 })).toBeNull();
  });
});

describe("conceptoDe", () => {
  it("separa consumo de servicios y ventas por el tipo de insumo", () => {
    expect(conceptoDe({ tipo: "venta" }, "bacha")).toBe("consumo");
    expect(conceptoDe({ tipo: "venta" }, "venta")).toBe("ventas");
  });

  it("las devoluciones van con lo que devuelven", () => {
    expect(conceptoDe({ tipo: "ajuste_manual", ref_tipo: "ingreso_anulado" }, "bacha")).toBe("consumo");
    expect(conceptoDe({ tipo: "ajuste_manual", ref_tipo: "egreso_anulado" }, "venta")).toBe("compras");
    expect(conceptoDe({ tipo: "ajuste_manual", ref_tipo: "recuento" }, "venta")).toBe("conteo");
    expect(conceptoDe({ tipo: "ajuste_manual", ref_tipo: "conteo" }, "venta")).toBe("conteo");
    expect(conceptoDe({ tipo: "ajuste_manual" }, "venta")).toBe("otros");
    expect(conceptoDe({ tipo: "reposicion" }, "venta")).toBeNull();
  });
});

describe("armarReporteStock", () => {
  it("inicial + conceptos = final", () => {
    const movs = [
      mov("2026-10-31T23:00:00Z", "compra", 100), // antes del período: no entra
      mov("2026-11-02T10:00:00Z", "compra", 20, { ubicacion: "deposito" }),
      mov("2026-11-03T10:00:00Z", "venta", -5),
      mov("2026-11-04T10:00:00Z", "ajuste_manual", -1, { ref_tipo: "conteo" }),
      mov("2026-11-05T10:00:00Z", "reposicion", 4),
      mov("2026-11-09T10:00:00Z", "venta", -3), // después: sólo para el final
    ];
    const [fila] = armarReporteStock(
      [{ id: "a", tipo: "venta" }],
      new Map([["a", { cantidad: 30, deposito: 16 }]]),
      movs.filter((m) => m.fecha >= "2026-11-01"),
      "2026-11-01T03:00:00.000Z",
      "2026-11-08T02:59:59.999Z",
    );
    expect(fila.final).toEqual({ cantidad: 33, deposito: 16 });
    expect(fila.inicial).toEqual({ cantidad: 19, deposito: 0 });
    expect(fila.conceptos).toEqual({
      compras: 20,
      consumo: 0,
      ventas: -5,
      uso_interno: 0,
      conteo: -1,
      otros: 0,
    });
  });
});

describe("consumo y compra", () => {
  it("consumo diario sin contar correcciones", () => {
    const movs = [
      { tipo: "venta" as const, cantidad: -300 },
      { tipo: "ajuste_manual" as const, ref_tipo: "ingreso_anulado", cantidad: 60 },
      { tipo: "ajuste_manual" as const, ref_tipo: "conteo", cantidad: -500 },
      { tipo: "compra" as const, cantidad: 600 },
    ];
    expect(consumoDiario(movs, "bacha", 30)).toBeCloseTo(8);
    expect(consumoDiario([], "bacha", 30)).toBe(0);
  });

  it("sugiere umbral y envases a comprar", () => {
    // 8 g por día, pomos de 60, compra cada 15 días con 7 de margen.
    const s = sugerirCompra(
      { stock: 100, consumoDiario: 8, tamanoEnvase: 60 },
      { frecuenciaDias: 15, margenDias: 7 },
    );
    expect(s.umbral).toBe(56);
    expect(s.necesario).toBe(176);
    expect(s.comprarEnvases).toBe(2); // faltan 76 g: 1,27 pomos
    expect(s.diasQueAlcanza).toBeCloseTo(12.5);
  });

  it("con stock de sobra o negativo", () => {
    const p = { frecuenciaDias: 15, margenDias: 7 };
    expect(sugerirCompra({ stock: 500, consumoDiario: 8, tamanoEnvase: 60 }, p).comprarEnvases).toBe(0);
    // El negativo cuenta como cero.
    expect(sugerirCompra({ stock: -50, consumoDiario: 8, tamanoEnvase: 60 }, p).comprarEnvases).toBe(3);
    expect(sugerirCompra({ stock: 5, consumoDiario: 0, tamanoEnvase: 1 }, p)).toMatchObject({
      comprarEnvases: 0,
      umbral: 0,
      diasQueAlcanza: null,
    });
  });
});

describe("compararProveedor", () => {
  it("los sin proveedor van al final", async () => {
    const { compararProveedor } = await import("./stock-planillas");
    expect(["Loreal", null, "Alfaparf", ""].sort(compararProveedor)).toEqual(["Alfaparf", "Loreal", null, ""]);
  });
});
