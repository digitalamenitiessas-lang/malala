import { describe, it, expect } from "vitest";

/**
 * De donde salen las horas que se PAGAN, segun el arreglo.
 *
 * Para una profesional sus franjas de agenda son su jornada y pagarlas esta
 * bien. Para alguien mixto no: la agenda dice cuando se le pueden reservar
 * turnos —toda su jornada como profesional— y lo que se le paga por hora es
 * solo su turno de encargada. Mezclarlas le pagaba el mismo tiempo dos veces.
 *
 * "Estaba viendo lo de Valentina y no da."
 */
function horasAPagar(args: {
  tipoComision: "porcentaje" | "mixto" | "sueldo_fijo";
  horasDeFranjas: number;
  tieneFranjas: boolean;
  horasDeFicha: number;
}): number {
  if (args.tipoComision === "mixto") return args.horasDeFicha;
  return args.tieneFranjas ? args.horasDeFranjas : args.horasDeFicha;
}

describe("de dónde salen las horas que se pagan", () => {
  it("mixto: manda la ficha, no la agenda", () => {
    // Valentina: 41,5 h de agenda, 8,5 de encargada.
    expect(
      horasAPagar({
        tipoComision: "mixto",
        horasDeFranjas: 41.5,
        tieneFranjas: true,
        horasDeFicha: 8.5,
      }),
    ).toBe(8.5);
  });

  it("profesional: mandan las franjas, como siempre", () => {
    // Esto es lo que rompió cinco sueldos cuando se tocó: Zoe pasó de
    // $160.000 a $18.000 porque su ficha dice 0 y su semana vive en la agenda.
    expect(
      horasAPagar({
        tipoComision: "porcentaje",
        horasDeFranjas: 40,
        tieneFranjas: true,
        horasDeFicha: 0,
      }),
    ).toBe(40);
  });

  it("profesional sin franjas: cae a la ficha", () => {
    expect(
      horasAPagar({
        tipoComision: "porcentaje",
        horasDeFranjas: 0,
        tieneFranjas: false,
        horasDeFicha: 40,
      }),
    ).toBe(40);
  });

  it("el arreglo de Valentina da lo que dijo el salón", () => {
    const horas = horasAPagar({
      tipoComision: "mixto",
      horasDeFranjas: 41.5,
      tieneFranjas: true,
      horasDeFicha: 8.5,
    });
    // 8,5 h x $5.000 + básico $50.000, más la comisión que haya hecho.
    expect(horas * 5000 + 50000).toBe(92500);
  });
});
