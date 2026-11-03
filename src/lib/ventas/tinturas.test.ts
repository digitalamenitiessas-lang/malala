import { describe, expect, it } from "vitest";
import {
  ajusteCostoPorReemplazos,
  insumoUsado,
  limpiarReemplazos,
  tinturasElegiblesPorServicio,
} from "./tinturas";

const YB = "seed-000002";
const insumo = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id,
  sucursal_id: YB,
  nombre,
  unidad_medida: "g",
  activo: true,
  grupo_reemplazo: "Color L'Oréal",
  precio_unitario: 1,
  ...extra,
});
const majirel = insumo("majirel", "Tintura Majirel", { precio_unitario: 170 });
const igora = insumo("igora", "Tintura Igora Royal", { precio_unitario: 311.5 });
const color10 = insumo("color10", "Tintura Igora Color 10", { activo: false });
const centro = insumo("centro", "Tintura Igora Royal", { sucursal_id: "seed-000001" });
const diaLight = insumo("dialight", "Tintura Dia Light", { grupo_reemplazo: "Aclarado L'Oréal" });
const oxidante = insumo("oxi", "Oxidante", { grupo_reemplazo: undefined, unidad_medida: "ml" });
const insumos = [majirel, igora, color10, centro, diaLight, oxidante];
const insumosById = new Map(insumos.map((i) => [i.id, i]));

const receta = (servicio_id: string, insumo_id: string, cantidad = 30) => ({
  servicio_id,
  sucursal_id: YB,
  insumo_id,
  cantidad,
});

describe("tinturasElegiblesPorServicio", () => {
  it("ofrece las del mismo grupo, activas y de la misma sucursal, la de la receta primero", () => {
    const r = tinturasElegiblesPorServicio(
      [receta("raiz", "majirel"), receta("raiz", "oxi", 45), receta("balayage", "dialight")],
      insumos,
      YB,
    );
    expect(r).toEqual({
      raiz: [
        {
          insumo_receta_id: "majirel",
          opciones: [
            { id: "majirel", nombre: "Tintura Majirel" },
            { id: "igora", nombre: "Tintura Igora Royal" },
          ],
        },
      ],
    });
  });
});

describe("limpiarReemplazos", () => {
  const base = { insumosReceta: ["majirel", "oxi"], insumosById, sucursalId: YB };

  it("guarda solo lo que cambió", () => {
    expect(limpiarReemplazos({ ...base, reemplazos: { majirel: "igora" } })).toEqual({ majirel: "igora" });
    expect(limpiarReemplazos({ ...base, reemplazos: { majirel: "majirel" } })).toBeNull();
    expect(limpiarReemplazos({ ...base, reemplazos: undefined })).toBeNull();
  });

  it("frena lo que no corresponde", () => {
    expect(() => limpiarReemplazos({ ...base, reemplazos: { majirel: "dialight" } })).toThrow(/no se puede usar/);
    expect(() => limpiarReemplazos({ ...base, reemplazos: { majirel: "centro" } })).toThrow(/no se puede usar/);
    expect(() => limpiarReemplazos({ ...base, reemplazos: { majirel: "color10" } })).toThrow(/desactivada/);
    expect(() => limpiarReemplazos({ ...base, reemplazos: { dialight: "igora" } })).toThrow(/receta/);
  });
});

describe("costo y stock", () => {
  it("el usado es el elegido o el de la receta", () => {
    expect(insumoUsado("majirel", { majirel: "igora" })).toBe("igora");
    expect(insumoUsado("oxi", { majirel: "igora" })).toBe("oxi");
    expect(insumoUsado("majirel", null)).toBe("majirel");
  });

  it("los gramos de la receta a precio de la usada, menos los de la original", () => {
    const pu = (id: string) => insumosById.get(id)?.precio_unitario;
    const recetas = [{ insumo_id: "majirel", cantidad: 30 }, { insumo_id: "oxi", cantidad: 45 }];
    expect(ajusteCostoPorReemplazos(recetas, { majirel: "igora" }, pu)).toBeCloseTo(30 * (311.5 - 170));
    expect(ajusteCostoPorReemplazos(recetas, null, pu)).toBe(0);
  });
});
