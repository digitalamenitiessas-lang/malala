import { describe, expect, it } from "vitest";
import { ingresoDesdeFormData, ingresoSchema } from "./ingreso";

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

/**
 * Este bloque existe por otro caso real, y peor que el anterior: durante un
 * tiempo NINGUNA venta cobrada con gift card se pudo guardar en ninguna de las
 * dos sucursales.
 *
 * El formulario mandaba gift_card_1_id y el schema lo declaraba, pero el objeto
 * que se le pasa a safeParse se arma campo por campo y ese campo no estaba en
 * la lista. Quedaba undefined, y el chequeo del servidor contestaba "elegí qué
 * gift card se está canjeando" con la tarjeta elegida ahí en pantalla. Desde el
 * mostrador se reportó como "me salta el error de que ponga la gc pero si la
 * estoy poniendo", y se buscó dos veces del lado del formulario.
 */
describe("ingresoDesdeFormData", () => {
  const formDe = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };

  it("no pierde ningún campo que el schema declare", () => {
    // La red de seguridad de verdad: cualquier campo que se agregue al schema y
    // se olvide acá aparece como un test rojo y no como una venta que no se
    // puede guardar.
    const delSchema = Object.keys(ingresoSchema.shape).sort();
    const delForm = Object.keys(ingresoDesdeFormData(new FormData(), [])).sort();
    expect(delForm).toEqual(delSchema);
  });

  it("deja pasar la gift card de cada medio de pago", () => {
    const obj = ingresoDesdeFormData(
      formDe({ gift_card_1_id: "gc-1", gift_card_2_id: "gc-2" }),
      [],
    );
    expect(obj.gift_card_1_id).toBe("gc-1");
    expect(obj.gift_card_2_id).toBe("gc-2");
  });

  it("una venta con gift card pasa la validación", () => {
    const r = ingresoSchema.safeParse(
      ingresoDesdeFormData(
        formDe({
          sucursal_id: "suc-1",
          mp1_id: "mp-gift",
          valor1: "10000",
          gift_card_1_id: "gc-1",
        }),
        [lineaServicio(10000, 1)],
      ),
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gift_card_1_id).toBe("gc-1");
  });
});

/**
 * Tercer medio de pago. El caso que lo trajo, Yerba Buena 03/11/2026: una
 * clienta pagó con dos gift cards (GC-0191 y GC-0192) y el resto por
 * transferencia, y con dos medios la venta no se podía cargar entera.
 */
describe("ingresoSchema · tercer medio de pago", () => {
  const dosGiftYTransferencia = (extra: Record<string, unknown> = {}) => ({
    ...venta([lineaServicio(50000, 1)], 20000),
    mp1_id: "mp-gift",
    gift_card_1_id: "gc-0191",
    mp2_id: "mp-gift",
    valor2: 15000,
    gift_card_2_id: "gc-0192",
    mp3_id: "mp-transf",
    valor3: 15000,
    ...extra,
  });

  it("dos gift cards y una transferencia cierran el total", () => {
    const r = ingresoSchema.safeParse(dosGiftYTransferencia());
    expect(r.success).toBe(true);
  });

  it("el tercer importe cuenta para la diferencia", () => {
    const r = ingresoSchema.safeParse(dosGiftYTransferencia({ valor3: 10000 }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => /no coincide con el total/.test(i.message))).toBe(
        true,
      );
    }
  });

  it("no acepta un tercer medio sin segundo", () => {
    const r = ingresoSchema.safeParse({
      ...venta([lineaServicio(30000, 1)], 15000),
      mp3_id: "mp-transf",
      valor3: 15000,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain("mp3_id");
  });

  it.each([
    ["el primero", { gift_card_3_id: "gc-0191" }, "primer"],
    ["el segundo", { gift_card_3_id: "gc-0192" }, "segundo"],
  ])("rechaza la misma gift card en el tercero que en %s", (_, extra, ordinal) => {
    const r = ingresoSchema.safeParse(
      dosGiftYTransferencia({ mp3_id: "mp-gift", ...extra }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === "gift_card_3_id");
      expect(issue?.message).toContain(`el ${ordinal} medio`);
    }
  });

  it("tres gift cards distintas pasan", () => {
    const r = ingresoSchema.safeParse(
      dosGiftYTransferencia({ mp3_id: "mp-gift", gift_card_3_id: "gc-0193" }),
    );
    expect(r.success).toBe(true);
  });

  it("el FormData trae los campos del tercer medio", () => {
    const fd = new FormData();
    fd.set("mp3_id", "mp-transf");
    fd.set("valor3", "15000");
    fd.set("mp3_cuenta_id", "cta-1");
    fd.set("gift_card_3_id", "gc-3");
    const obj = ingresoDesdeFormData(fd, []);
    expect(obj).toMatchObject({
      mp3_id: "mp-transf",
      valor3: "15000",
      mp3_cuenta_id: "cta-1",
      gift_card_3_id: "gc-3",
    });
  });
});
