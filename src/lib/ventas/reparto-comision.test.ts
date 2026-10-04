import { describe, expect, it } from "vitest";
import { expandirLineas, type LineaRepartible } from "./reparto-comision";
import { comisionMontoServicio } from "@/lib/data/ingresos-helpers";

const linea = (o: Partial<LineaRepartible> = {}): LineaRepartible => ({
  tipo: "servicio",
  tempId: "l1",
  empleado_id: "emp-a",
  precio: 30000,
  cantidad: 1,
  comision_pct: 30,
  ...o,
});

describe("expandirLineas", () => {
  it("deja igual una línea sin reparto", () => {
    const l = linea();
    expect(expandirLineas([l])).toEqual([l]);
  });

  it("no reparte si está abierto pero sin segunda persona elegida", () => {
    // A medio llenar la línea tiene que quedar entera: partirla a nombre de
    // nadie perdería la comisión de esa mitad.
    const l = linea({ reparto: { empleado_id: "", parte: 50 } });
    expect(expandirLineas([l])).toHaveLength(1);
  });

  it("parte la cantidad y deja el precio y el porcentaje intactos", () => {
    const [a, b] = expandirLineas([
      linea({ reparto: { empleado_id: "emp-b", parte: 50 } }),
    ]);
    expect(a.cantidad).toBe(0.5);
    expect(b.cantidad).toBe(0.5);
    expect(a.precio).toBe(30000);
    expect(b.precio).toBe(30000);
    expect(a.comision_pct).toBe(30);
    expect(b.comision_pct).toBe(30);
    expect(a.empleado_id).toBe("emp-a");
    expect(b.empleado_id).toBe("emp-b");
  });

  it("las dos partes suman la cantidad original, también desparejo", () => {
    for (const parte of [50, 70, 33, 1, 99]) {
      const [a, b] = expandirLineas([
        linea({ reparto: { empleado_id: "emp-b", parte } }),
      ]);
      expect(a.cantidad + b.cantidad).toBeCloseTo(1, 10);
    }
  });

  it("respeta una cantidad mayor a uno", () => {
    const [a, b] = expandirLineas([
      linea({ cantidad: 3, reparto: { empleado_id: "emp-b", parte: 50 } }),
    ]);
    expect(a.cantidad).toBe(1.5);
    expect(b.cantidad).toBe(1.5);
  });
});

/**
 * Repartir cambia A QUIÉN se le paga, nunca CUÁNTO, y tampoco cuánto insumo
 * salió del depósito.
 *
 * Lo segundo se aprendió caro. La primera versión partía el PRECIO y dejaba dos
 * líneas de cantidad 1, así que el sistema creía que el servicio se había hecho
 * dos veces: cobraba bien pero descontaba el doble de stock y reportaba el
 * doble de costo. Apareció en producción como un ticket de $216.000 con
 * $83.188 de insumos.
 */
describe("repartir no cambia la plata ni el consumo", () => {
  const PRECIO_EFECTIVO = 30000;
  const comision = (l: LineaRepartible, descuento = 0) =>
    comisionMontoServicio({
      precioCobrado: l.precio * l.cantidad,
      precioEfectivoServicio: PRECIO_EFECTIVO * l.cantidad,
      esDePromo: false,
      comisionPct: l.comision_pct,
      soportaDescuento: true,
      subtotal: 30000,
      descuentoMonto: descuento,
    });

  const totalComision = (ls: LineaRepartible[], descuento = 0) =>
    expandirLineas(ls).reduce((acc, l) => acc + comision(l, descuento), 0);

  /** Lo que gasta de receta: proporcional a la cantidad de cada línea. */
  const consumo = (ls: LineaRepartible[]) =>
    expandirLineas(ls).reduce((acc, l) => acc + l.cantidad, 0);

  /** Lo que se le cobra a la clienta. */
  const subtotal = (ls: LineaRepartible[]) =>
    expandirLineas(ls).reduce((acc, l) => acc + l.precio * l.cantidad, 0);

  it("la comisión total es la misma repartida que entera", () => {
    expect(totalComision([linea({ reparto: { empleado_id: "emp-b", parte: 50 } })]))
      .toBeCloseTo(totalComision([linea()]));
    expect(totalComision([linea()])).toBe(9000);
  });

  it("el ticket cobra lo mismo", () => {
    expect(subtotal([linea({ reparto: { empleado_id: "emp-b", parte: 70 } })]))
      .toBeCloseTo(30000);
  });

  it("gasta UNA receta, no dos: es el bug que llegó a producción", () => {
    expect(consumo([linea()])).toBe(1);
    expect(consumo([linea({ reparto: { empleado_id: "emp-b", parte: 50 } })])).toBe(1);
    expect(consumo([linea({ reparto: { empleado_id: "emp-b", parte: 70 } })]))
      .toBeCloseTo(1, 10);
  });

  it("con descuento y reparto desparejo tampoco cambia nada", () => {
    expect(totalComision([linea({ reparto: { empleado_id: "emp-b", parte: 70 } })], 6000))
      .toBeCloseTo(totalComision([linea()], 6000));
  });
});
