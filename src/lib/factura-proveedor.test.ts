import { describe, expect, it } from "vitest";
import { numeroFactura, planFactura } from "./factura-proveedor";

describe("planFactura", () => {
  it("la diferencia con el total es el IVA, y la deuda da la factura", () => {
    const r = planFactura(121000, [
      { insumoId: "a", cantidad: 10, valor: 60000 },
      { insumoId: "b", cantidad: 2, valor: 40000 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.sumaLineas).toBe(100000);
    expect(r.plan.diferencia).toBe(21000);
    // El costo lleva su parte del IVA: 6.000 × 1,21 y 20.000 × 1,21.
    expect(r.plan.precioEnvase).toEqual([7260, 24200]);
  });

  it("sin diferencia, no hay línea de IVA y el costo es el de la línea", () => {
    const r = planFactura(50000.5, [{ insumoId: "a", cantidad: 1, valor: 50000.5 }]);
    expect(r.ok && r.plan.diferencia).toBe(0);
    expect(r.ok && r.plan.precioEnvase).toEqual([50000.5]);
  });

  it("no deja cargar líneas que suman más que la factura", () => {
    const r = planFactura(1000, [{ insumoId: "a", cantidad: 1, valor: 1200 }]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.total?.[0]).toContain("$200");
  });

  it("pide total, producto, cantidad e importe", () => {
    const r = planFactura(0, [{ insumoId: "", cantidad: 0, valor: 0 }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.total).toBeDefined();
    expect(r.errors.lineas).toHaveLength(3);
  });

  it("sin líneas no hay factura", () => {
    const r = planFactura(1000, []);
    expect(!r.ok && r.errors.lineas).toBeDefined();
  });
});

describe("numeroFactura", () => {
  it.each([
    ["0070-00436916", "436916"],
    ["00436916", "436916"],
    ["N 0070-0436916", "436916"],
    ["FACT-00001-00017349", "17349"],
    ["Factura: 0070-00437333", "437333"],
  ])("%s → %s", (a, b) => expect(numeroFactura(a)).toBe(b));

  it("sin números no hay número", () => {
    expect(numeroFactura("remito")).toBeNull();
    expect(numeroFactura(null)).toBeNull();
    expect(numeroFactura("000")).toBeNull();
  });
});
