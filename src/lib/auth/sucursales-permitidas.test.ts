import { describe, expect, it } from "vitest";
import { ordenarSucursalesPermitidas } from "./sucursales-permitidas";

/**
 * Este camino nunca se ejecutó en producción: el rol superadmin estaba
 * declarado en el schema de Drizzle pero no existía en el enum de Postgres, así
 * que durante toda la vida del sistema nadie lo tuvo. Salió al dar de alta a la
 * primera persona que necesita ver las dos sucursales.
 *
 * Lo que se prueba es el ORDEN, que no es cosmético: clampSucursalId cae al
 * primero del array cuando la URL no trae sucursal, así que ese elemento decide
 * en qué sede aterriza la persona al abrir cada pantalla.
 */
const CENTRO = "seed-000001";
const YB = "seed-000002";

describe("ordenarSucursalesPermitidas", () => {
  it("pone primero la sucursal de la persona", () => {
    // El caso real: la dueña trabaja en Yerba Buena y Centro viene antes por
    // orden alfabético. Sin esto abría el sistema parado en la sede equivocada.
    expect(ordenarSucursalesPermitidas([CENTRO, YB], YB)).toEqual([YB, CENTRO]);
  });

  it("no cambia nada si su sucursal ya venía primera", () => {
    expect(ordenarSucursalesPermitidas([CENTRO, YB], CENTRO)).toEqual([
      CENTRO,
      YB,
    ]);
  });

  it("conserva todas las sucursales, no solo las dos de hoy", () => {
    const tres = [CENTRO, YB, "seed-000003"];
    const r = ordenarSucursalesPermitidas(tres, YB);
    expect(r[0]).toBe(YB);
    expect([...r].sort()).toEqual([...tres].sort());
  });

  it("si su sucursal no está entre las activas, no la inventa", () => {
    // Puede pasar si se desactiva la sede de alguien: es preferible que caiga en
    // otra activa a que el sistema la mande a una sucursal apagada.
    expect(ordenarSucursalesPermitidas([CENTRO], "seed-999")).toEqual([CENTRO]);
  });
});
