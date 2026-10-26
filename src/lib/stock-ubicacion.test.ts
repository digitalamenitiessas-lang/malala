import { describe, expect, it } from "vitest";
import {
  aplicarEnUbicacion,
  exhibido,
  reponerExhibicion,
} from "./stock-ubicacion";

describe("aplicarEnUbicacion", () => {
  it("una compra al depósito suma al total y al depósito", () => {
    expect(aplicarEnUbicacion({ cantidad: 3, deposito: 1 }, 6, "deposito")).toEqual({
      cantidad: 9,
      deposito: 7,
      repuesto: 0,
    });
  });

  it("sacar del depósito más de lo que hay toma el resto de la góndola", () => {
    // Compra de 4 anulada cuando ya se habían pasado 3 a la góndola.
    const r = aplicarEnUbicacion({ cantidad: 6, deposito: 1 }, -4, "deposito");
    expect(r).toEqual({ cantidad: 2, deposito: 0, repuesto: 0 });
    expect(exhibido(r)).toBe(2);
  });

  it("una venta sale de la góndola si alcanza", () => {
    const r = aplicarEnUbicacion({ cantidad: 5, deposito: 3 }, -2);
    expect(r).toEqual({ cantidad: 3, deposito: 3, repuesto: 0 });
    expect(exhibido(r)).toBe(0);
  });

  it("si la góndola no alcanza, repone solo desde el depósito", () => {
    // 1 exhibido, 4 en depósito, se venden 3: faltan 2 en góndola.
    const r = aplicarEnUbicacion({ cantidad: 5, deposito: 4 }, -3, "exhibicion");
    expect(r).toEqual({ cantidad: 2, deposito: 2, repuesto: 2 });
    expect(exhibido(r)).toBe(0);
  });

  it("no repone más de lo que hay en depósito", () => {
    const r = aplicarEnUbicacion({ cantidad: 2, deposito: 1 }, -5);
    expect(r).toEqual({ cantidad: -3, deposito: 0, repuesto: 1 });
    expect(exhibido(r)).toBe(-3);
  });

  it("los insumos sin depósito (bacha) se comportan como antes", () => {
    expect(aplicarEnUbicacion({ cantidad: 900, deposito: 0 }, -50)).toEqual({
      cantidad: 850,
      deposito: 0,
      repuesto: 0,
    });
  });

  it("una entrada a exhibición no toca el depósito", () => {
    expect(aplicarEnUbicacion({ cantidad: 2, deposito: 2 }, 1)).toEqual({
      cantidad: 3,
      deposito: 2,
      repuesto: 0,
    });
  });
});

describe("reponerExhibicion", () => {
  it("pasa del depósito a la góndola sin cambiar el total", () => {
    expect(reponerExhibicion({ cantidad: 6, deposito: 4 }, 3)).toEqual({
      ok: true,
      saldo: { cantidad: 6, deposito: 1 },
    });
  });

  it("no deja reponer más de lo que hay en depósito", () => {
    expect(reponerExhibicion({ cantidad: 6, deposito: 2 }, 3).ok).toBe(false);
  });

  it("rechaza cero o negativo", () => {
    expect(reponerExhibicion({ cantidad: 6, deposito: 2 }, 0).ok).toBe(false);
  });
});
