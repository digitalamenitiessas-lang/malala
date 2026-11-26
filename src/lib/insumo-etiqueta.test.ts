import { describe, expect, it } from "vitest";
import { etiquetaInsumo } from "./insumo-etiqueta";

const i = (nombre: string, tamano_envase: number, unidad_medida: "ml" | "g" | "ud" | "aplicacion", tipo: "bacha" | "venta") => ({
  nombre,
  tamano_envase,
  unidad_medida,
  tipo,
});

describe("etiquetaInsumo", () => {
  it("agrega el envase cuando el nombre no lo dice", () => {
    expect(etiquetaInsumo(i("Shampoo Vitamino Spectrum", 1500, "ml", "bacha"))).toBe(
      "Shampoo Vitamino Spectrum · 1500 ml · bacha",
    );
    expect(etiquetaInsumo(i("Tintura INOA", 60, "g", "bacha"))).toBe("Tintura INOA · 60 g · bacha");
  });

  it("no repite el contenido si ya está en el nombre", () => {
    expect(etiquetaInsumo(i("Shampoo 300 ml Absolut Repair", 300, "ml", "venta"))).toBe(
      "Shampoo 300 ml Absolut Repair · reventa",
    );
    expect(etiquetaInsumo(i("Removedor Delfina Sol (1 Litro)", 100, "ml", "bacha"))).toBe(
      "Removedor Delfina Sol (1 Litro) · bacha",
    );
    expect(etiquetaInsumo(i("Shampoo loreal 300ml _Pro Longer", 300, "ml", "venta"))).toBe(
      "Shampoo loreal 300ml _Pro Longer · reventa",
    );
  });

  it("las unidades sueltas no llevan envase", () => {
    expect(etiquetaInsumo(i("Algodón", 100, "ud", "bacha"))).toBe("Algodón · bacha");
  });
});
