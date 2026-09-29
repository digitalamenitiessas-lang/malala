import { describe, expect, it } from "vitest";
import { ingresoSchema } from "./ingreso";

/**
 * Estos tests existen por un caso real del mostrador.
 *
 * Cuando se agregó "cantidad" a las líneas de servicio, el formulario sumaba
 * bien y el guardado sumaba bien, pero esta validación tenía su propia copia de
 * la cuenta y seguía ignorando la cantidad. El resultado era una venta que no
 * se podía guardar, con un mensaje incomprensible: "la suma de pagos (60000) no
 * coincide con el total (55000)" sobre un ticket donde las dos cifras en
 * pantalla decían 60000.
 */
const lineaServicio = (precio: number, cantidad: number) => ({
  tipo: "servicio",
  servicio_id: "srv-1",
  empleado_id: "emp-1",
  precio_efectivo: precio,
  cantidad,
  comision_pct: 30,
});

const venta = (lineas: unknown[], valor1: number, descuento = 0) => ({
  sucursal_id: "suc-1",
  lineas,
  descuento_tipo: "monto",
  descuento_valor: descuento,
  mp1_id: "mp-1",
  valor1,
});

describe("ingresoSchema · total contra lo cobrado", () => {
  it("multiplica el precio del servicio por su cantidad", () => {
    // 25.000 + (5.000 × 2) + 25.000 = 60.000
    const r = ingresoSchema.safeParse(
      venta(
        [
          lineaServicio(25000, 1),
          lineaServicio(5000, 2),
          lineaServicio(25000, 1),
        ],
        60000,
      ),
    );
    expect(r.success).toBe(true);
  });

  it("rechaza cuando lo cobrado no cubre la cantidad cargada", () => {
    const r = ingresoSchema.safeParse(
      venta([lineaServicio(5000, 2)], 5000),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => /no coincide con el total/.test(i.message))).toBe(
        true,
      );
    }
  });

  it("sin cantidad asume una sola", () => {
    const sinCantidad: Record<string, unknown> = lineaServicio(25000, 1);
    delete sinCantidad.cantidad;
    const r = ingresoSchema.safeParse(venta([sinCantidad], 25000));
    expect(r.success).toBe(true);
  });

  it("el descuento se aplica sobre el subtotal ya multiplicado", () => {
    // (20.000 × 3) − 10.000 = 50.000
    const r = ingresoSchema.safeParse(
      {
        ...venta([lineaServicio(20000, 3)], 50000, 10000),
        descuento_motivo_id: "mot-1",
      },
    );
    expect(r.success).toBe(true);
  });

  it("una línea de producto sigue multiplicando igual", () => {
    const r = ingresoSchema.safeParse(
      venta(
        [
          {
            tipo: "producto",
            insumo_id: "ins-1",
            cantidad: 4,
            precio_efectivo: 7500,
            comision_pct: 10,
          },
        ],
        30000,
      ),
    );
    expect(r.success).toBe(true);
  });
});
