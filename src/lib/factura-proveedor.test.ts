import { describe, expect, it } from "vitest";
import { costosNuevos, numeroFactura, planFactura } from "./factura-proveedor";

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

describe("productos nuevos", () => {
  it("una línea de producto nuevo no necesita producto elegido", () => {
    const r = planFactura(1275, [
      { insumoId: "", nuevo: { nombre: "Shampoo Metal Detox 1500 ml", tipo: "bacha", unidad: "ml", tamano: 1500 }, cantidad: 1, valor: 1000 },
    ]);
    expect(r.ok).toBe(true);
  });

  it("pide nombre y contenido del producto nuevo", () => {
    const r = planFactura(1275, [
      { insumoId: "", nuevo: { nombre: " ", tipo: "bacha", unidad: "ml", tamano: 0 }, cantidad: 1, valor: 1000 },
    ]);
    expect(!r.ok && r.errors.lineas).toHaveLength(2);
  });

  it("uno de reventa por unidad no pide contenido", () => {
    const r = planFactura(1275, [
      { insumoId: "", nuevo: { nombre: "Mascara Loreal 250ml_Absolut Repair", tipo: "venta", unidad: "ud", tamano: 0 }, cantidad: 1, valor: 1000 },
    ]);
    expect(r.ok).toBe(true);
  });
});

describe("costosNuevos", () => {
  // Factura de Loreal: los impuestos son 27,5% sobre los productos.
  const lineas = [
    { insumoId: "majirel", cantidad: 2, valor: 23936 },
    { insumoId: "majirel", cantidad: 2, valor: 23.94 },
    { insumoId: "oxidante", cantidad: 2, valor: 48.99 },
    { insumoId: "mascara", cantidad: 1, valor: 100358 },
  ];
  const total = Math.round(lineas.reduce((s, l) => s + l.valor, 0) * 1.275 * 100) / 100;
  const r = planFactura(total, lineas);
  if (!r.ok) throw new Error("plan");
  const costos = costosNuevos(lineas, r.plan, new Map([["majirel", 8491.86], ["oxidante", 29060.27], ["mascara", 115651.2]]));

  it("los pomos de regalo no bajan el costo de los pagos", () => {
    expect(costos.get("majirel")).toBeCloseTo((23936 * 1.275) / 2, 0);
  });

  it("un producto pagado en varias líneas queda al promedio", () => {
    const ls = [
      { insumoId: "a", cantidad: 1, valor: 100 },
      { insumoId: "a", cantidad: 3, valor: 360 },
    ];
    const p = planFactura(460, ls);
    if (!p.ok) throw new Error("plan");
    expect(costosNuevos(ls, p.plan, new Map([["a", 100]])).get("a")).toBe(115);
  });

  it("un regalo no pisa el costo", () => {
    expect(costos.has("oxidante")).toBe(false);
  });

  it("lo demás toma el precio de la factura con impuestos", () => {
    expect(costos.get("mascara")).toBeCloseTo(100358 * 1.275, 0);
  });

  it("los productos nuevos no están: se crean con su precio", () => {
    const n = costosNuevos(
      [{ insumoId: "", nuevo: { nombre: "x", tipo: "bacha", unidad: "ml", tamano: 1 }, cantidad: 1, valor: 10 }],
      { sumaLineas: 10, diferencia: 0, precioEnvase: [10] },
      new Map(),
    );
    expect(n.size).toBe(0);
  });
});
