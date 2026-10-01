import { describe, expect, it } from "vitest";
import { expandirLineas, type LineaRepartible } from "./reparto-comision";
import { comisionMontoServicio } from "@/lib/data/ingresos-helpers";

const linea = (o: Partial<LineaRepartible> = {}): LineaRepartible => ({
  tipo: "servicio",
  tempId: "l1",
  empleado_id: "emp-a",
  precio: 30000,
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

  it("parte el porcentaje, que es lo que define la comisión", () => {
    const [a, b] = expandirLineas([
      linea({ reparto: { empleado_id: "emp-b", parte: 50 } }),
    ]);
    expect(a.comision_pct).toBe(15);
    expect(b.comision_pct).toBe(15);
    expect(a.empleado_id).toBe("emp-a");
    expect(b.empleado_id).toBe("emp-b");
    expect(a.reparto).toBeUndefined();
    expect(b.reparto).toBeUndefined();
  });

  it("las dos partes suman el precio original, aunque sea impar", () => {
    const [a, b] = expandirLineas([
      linea({ precio: 10001, reparto: { empleado_id: "emp-b", parte: 50 } }),
    ]);
    expect(a.precio + b.precio).toBe(10001);
  });

  it("reparte desparejo según la parte elegida", () => {
    const [a, b] = expandirLineas([
      linea({ reparto: { empleado_id: "emp-b", parte: 70 } }),
    ]);
    expect(a.comision_pct).toBeCloseTo(21);
    expect(b.comision_pct).toBeCloseTo(9);
    expect(a.precio + b.precio).toBe(30000);
  });
});

/**
 * Lo único que de verdad importa: repartir cambia A QUIÉN se le paga, nunca
 * CUÁNTO. Si estos tests se ponen rojos, el salón está pagando distinto por el
 * mismo servicio según cómo se cargó.
 *
 * El caso que motivó todo esto es el último: partir el precio y dejar el
 * porcentaje entero paga el doble, porque la comisión no sale del precio de la
 * línea sino del precio de catálogo.
 */
describe("repartir no cambia la plata", () => {
  const PRECIO_EFECTIVO = 30000;
  const comision = (precio: number, pct: number, cantidad = 1, descuento = 0) =>
    comisionMontoServicio({
      precioCobrado: precio * cantidad,
      precioEfectivoServicio: PRECIO_EFECTIVO * cantidad,
      esDePromo: false,
      comisionPct: pct,
      soportaDescuento: true,
      subtotal: 30000 * cantidad,
      descuentoMonto: descuento,
    });

  const totalDe = (ls: LineaRepartible[], cantidad = 1, descuento = 0) =>
    expandirLineas(ls).reduce(
      (acc, l) => acc + comision(l.precio, l.comision_pct, cantidad, descuento),
      0,
    );

  it("la comisión total es la misma repartida que entera", () => {
    const entera = totalDe([linea()]);
    const partida = totalDe([
      linea({ reparto: { empleado_id: "emp-b", parte: 50 } }),
    ]);
    expect(partida).toBeCloseTo(entera);
    expect(entera).toBe(9000);
  });

  it("tampoco cambia con descuento, cantidad ni reparto desparejo", () => {
    const entera = totalDe([linea()], 2, 12000);
    const partida = totalDe(
      [linea({ reparto: { empleado_id: "emp-b", parte: 70 } })],
      2,
      12000,
    );
    expect(partida).toBeCloseTo(entera);
  });

  it("partir el precio SIN partir el porcentaje pagaría el doble", () => {
    // Esto no es lo que hace expandirLineas: es lo que haría alguien a mano, y
    // es la razón de ser de esta función.
    const aMano = comision(15000, 30) + comision(15000, 30);
    expect(aMano).toBe(18000);
    expect(aMano).toBe(totalDe([linea()]) * 2);
  });
});
