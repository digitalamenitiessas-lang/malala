import { describe, expect, it } from "vitest";
import { nombresCompatibles, planDuplicadas } from "./clientes-duplicadas";

const c = (id: string, nombre: string, telefono?: string, ventas = 0) => ({ id, nombre, telefono, ventas });

describe("nombresCompatibles", () => {
  it.each([
    ["Meli Tré", "Meli Tre"],
    ["Agus Cejas", "Agustina Cejas"],
    ["Artasu Agustina", "Agustina Artasu"],
    ["Lourdes", "Lourdes Perez Morales"],
    ["Agostina Baez", "Agostina Bez"],
    ["Elisa H", "Elisa Hauad"],
    ["Robles Maria Florencia", "María Florencia Robles"],
  ])("%s = %s", (a, b) => expect(nombresCompatibles(a, b)).toBe(true));

  it.each([
    ["Delfina Leal Reyes", "Emilia Leal Reyes"],
    ["Ana Inés Terán", "Faustina Terán"],
    ["Sofía Servitje", "Marisa Gutiérrez"],
    ["Elena Colombres Garmendia", "Elena Cruz"],
    ["Robles Maria Florencia", "Ance Fatima"],
    ["Lulu Castaño", "Lourdes castaño"],
  ])("%s ≠ %s", (a, b) => expect(nombresCompatibles(a, b)).toBe(false));
});

describe("planDuplicadas", () => {
  it("une el mismo número con el mismo nombre y deja la de más ventas", () => {
    const plan = planDuplicadas([
      c("1", "Meli Tre", "381 15 4154820", 1),
      c("2", "Meli Tré", "+5493814154820", 2),
    ]);
    expect(plan.unir).toHaveLength(1);
    expect(plan.unir[0].queda.id).toBe("2");
    expect(plan.unir[0].unir.map((x) => x.id)).toEqual(["1"]);
    expect(plan.dudosos).toEqual([]);
  });

  it("no une a la familia que comparte número: queda como dudoso", () => {
    const plan = planDuplicadas([
      c("1", "Delfina Leal Reyes", "3813942680"),
      c("2", "Emilia Leal Reyes", "3813942680"),
    ]);
    expect(plan.unir).toEqual([]);
    expect(plan.dudosos).toHaveLength(1);
  });

  it("en un número con dos personas repetidas, une cada una por separado", () => {
    const plan = planDuplicadas([
      c("1", "Ance Fatima", "3813311331"),
      c("2", "Ance Fatima", "3813311331"),
      c("3", "Robles Maria Florencia", "3813311331", 2),
      c("4", "Robles Maria Florencia", "3813311331", 1),
    ]);
    expect(plan.unir.map((g) => [g.queda.id, g.unir.map((x) => x.id).sort()]).sort()).toEqual([
      ["1", ["2"]],
      ["3", ["4"]],
    ].sort());
    expect(plan.dudosos).toHaveLength(1);
  });

  it("mismo nombre exacto sin teléfonos que choquen", () => {
    const plan = planDuplicadas([
      c("1", "María Ferre", "3813033389"),
      c("2", "Maria Ferre"),
      c("3", "Juana Paz", "3810000001"),
      c("4", "Juana Paz", "3810000002"),
      c("5", "Lourdes"),
      c("6", "Lourdes"),
    ]);
    expect(plan.unir.map((g) => g.motivo + ":" + [g.queda.id, ...g.unir.map((x) => x.id)].join(","))).toEqual([
      "nombre:1,2",
    ]);
  });
});

describe("planDuplicadas en una sola pasada", () => {
  it("la ficha sin teléfono se suma al grupo que ya se une por teléfono", () => {
    const plan = planDuplicadas([
      c("1", "Jo Viscido", "3816447860", 3),
      c("2", "Jo Viscido", "381 15 6447860"),
      c("3", "Jo Viscido"),
      c("4", "Beatriz Vaca", "3816447860"),
    ]);
    expect(plan.unir).toHaveLength(1);
    expect(plan.unir[0].queda.id).toBe("1");
    expect(plan.unir[0].unir.map((x) => x.id).sort()).toEqual(["2", "3"]);
  });

  it("después de unir, no queda nada más para unir", () => {
    const clientes = [
      c("1", "Mariana Teran", "3816228766"),
      c("2", "Mariana Teran", "3816228766"),
      c("3", "Mariana Teran", undefined, 1),
    ];
    const plan = planDuplicadas(clientes);
    const fuera = new Set(plan.unir.flatMap((g) => g.unir.map((x) => x.id)));
    expect(planDuplicadas(clientes.filter((x) => !fuera.has(x.id))).unir).toEqual([]);
  });
});
