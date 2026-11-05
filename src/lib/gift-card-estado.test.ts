import { describe, it, expect } from "vitest";
import {
  esCanjeable,
  estadoGiftCard,
  montoAplicable,
  textoFormaDePago,
  vencimientoPorDefecto,
} from "./gift-card-estado";

const HOY = "2026-08-26";

function gc(overrides: Partial<Parameters<typeof estadoGiftCard>[0]> = {}) {
  return { estado: "activa" as const, saldo: 50000, vence_el: "2026-09-25", ...overrides };
}

describe("estadoGiftCard — precedencia", () => {
  it("una tarjeta nueva con saldo y en fecha está activa", () => {
    expect(estadoGiftCard(gc(), HOY)).toBe("activa");
  });
  it("sin saldo cuenta como canjeada", () => {
    expect(estadoGiftCard(gc({ saldo: 0 }), HOY)).toBe("canjeada");
  });
  it("un resto de centavos por redondeo no la deja viva", () => {
    expect(estadoGiftCard(gc({ saldo: 0.004 }), HOY)).toBe("canjeada");
  });
  it("pasada la fecha, con saldo, está vencida", () => {
    expect(estadoGiftCard(gc({ vence_el: "2026-08-25" }), HOY)).toBe("vencida");
  });
  it("el día del vencimiento todavía NO está vencida", () => {
    expect(estadoGiftCard(gc({ vence_el: HOY }), HOY)).toBe("activa");
  });
  it("sin vencimiento nunca vence", () => {
    expect(estadoGiftCard(gc({ vence_el: undefined }), HOY)).toBe("activa");
  });
  it("anulada gana sobre vencida y sobre canjeada", () => {
    expect(estadoGiftCard(gc({ estado: "anulada", vence_el: "2020-01-01" }), HOY)).toBe("anulada");
    expect(estadoGiftCard(gc({ estado: "anulada", saldo: 0 }), HOY)).toBe("anulada");
  });
  it("canjeada gana sobre vencida: si ya se usó, la fecha da igual", () => {
    expect(estadoGiftCard(gc({ saldo: 0, vence_el: "2020-01-01" }), HOY)).toBe("canjeada");
  });
});

describe("esCanjeable", () => {
  it("la vencida SE PUEDE canjear igual, con advertencia", () => {
    const r = esCanjeable(gc({ vence_el: "2026-08-01" }), HOY);
    expect(r.canjeable).toBe(true);
    expect(r.advertencia).toContain("2026-08-01");
  });
  it("la anulada no", () => {
    expect(esCanjeable(gc({ estado: "anulada" }), HOY)).toEqual({
      canjeable: false,
      motivo: "Anulada",
    });
  });
  it("la que ya se usó entera tampoco", () => {
    expect(esCanjeable(gc({ saldo: 0 }), HOY).canjeable).toBe(false);
  });
  it("la sana no trae ni motivo ni advertencia", () => {
    expect(esCanjeable(gc(), HOY)).toEqual({ canjeable: true });
  });
});

describe("montoAplicable", () => {
  it("cubre todo cuando alcanza", () => {
    expect(montoAplicable({ saldo: 50000 }, 30000)).toBe(30000);
  });
  it("se corta en el saldo cuando no alcanza", () => {
    expect(montoAplicable({ saldo: 40000 }, 55000)).toBe(40000);
  });
  it("nunca devuelve negativo", () => {
    expect(montoAplicable({ saldo: 40000 }, -10)).toBe(0);
  });
});

describe("vencimientoPorDefecto", () => {
  it("son 30 días desde la emisión", () => {
    expect(vencimientoPorDefecto(new Date("2026-08-26T12:00:00-03:00"))).toBe("2026-09-25");
  });
  it("cruza fin de mes y fin de año sin romperse", () => {
    expect(vencimientoPorDefecto(new Date("2026-12-20T12:00:00-03:00"))).toBe("2027-01-19");
  });
  it("una emisión de las 22 h no pierde un día por el corrimiento a UTC", () => {
    // 22 h en Argentina ya es el día siguiente en UTC: si se calculara sobre la
    // fecha UTC, esta tarjeta vencería el 26 en vez del 25.
    expect(vencimientoPorDefecto(new Date("2026-08-26T22:00:00-03:00"))).toBe("2026-09-25");
  });
});

describe("textoFormaDePago", () => {
  const venta = { origen: "venta" as const };

  it("muestra el medio y la cuenta cuando la cuenta agrega algo", () => {
    expect(textoFormaDePago(venta, { medio: "Transferencia", cuenta: "Galicia" })).toBe(
      "Transferencia (Galicia)",
    );
    expect(textoFormaDePago(venta, { medio: "Efectivo", cuenta: "Caja Efectivo" })).toBe(
      "Efectivo",
    );
    expect(textoFormaDePago(venta, { medio: "Cuenta corriente" })).toBe("Cuenta corriente");
  });

  it("cuenta las cuotas del descuento de sueldo", () => {
    expect(textoFormaDePago(venta, { medio: "Descuento de sueldo", cuotas: 3 })).toBe(
      "Descuento de sueldo · 3 cuotas",
    );
    expect(textoFormaDePago(venta, { medio: "Descuento de sueldo", cuotas: 1 })).toBe(
      "Descuento de sueldo",
    );
  });

  it("de una vieja a cuenta compartida dice los medios posibles", () => {
    expect(
      textoFormaDePago(venta, { cuenta: "Macro", posibles: ["Crédito", "Débito"] }),
    ).toBe("Crédito o Débito (Macro) · no quedó registrado cuál");
    expect(
      textoFormaDePago(venta, { cuenta: "Macro", posibles: ["Crédito", "Débito", "Transferencias"] }),
    ).toBe("Crédito, Débito o Transferencias (Macro) · no quedó registrado cuál");
  });

  it("cortesía, antes del sistema y sin rastro", () => {
    expect(textoFormaDePago({ origen: "cortesia" }, {})).toBe("No se cobró: la regaló el salón");
    expect(textoFormaDePago({ origen: "pre_sistema" }, {})).toBe("Se cobró antes del sistema");
    expect(textoFormaDePago(venta, { cuenta: "Galicia" })).toBe("Entró a Galicia");
    expect(textoFormaDePago(venta, {})).toBe("No quedó registrada");
  });
});
