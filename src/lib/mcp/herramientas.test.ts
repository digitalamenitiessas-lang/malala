import { describe, expect, it } from "vitest";
import type { Usuario } from "@/lib/types";
import { herramientasPara, resolverSucursal } from "./herramientas";

const encargada: Usuario = {
  id: "u1",
  email: "elu@malala.com",
  nombre: "Elu",
  rol: "encargada",
  sucursal_default_id: "yb",
  sucursal_ids_permitidas: ["yb"],
  activo: true,
};

const duenio: Usuario = {
  ...encargada,
  id: "u2",
  nombre: "Isaías",
  rol: "superadmin",
  sucursal_ids_permitidas: ["yb", "centro"],
};

describe("herramientasPara", () => {
  it("no expone ninguna herramienta de escritura", () => {
    const nombres = [...herramientasPara(duenio).keys()];
    expect(nombres).toContain("list_turnos");
    expect(nombres).toContain("get_resumen_caja");
    expect(nombres).not.toContain("crear_turno");
    expect(nombres).not.toContain("reprogramar_turno");
    expect(nombres).not.toContain("cambiar_estado_turno");
  });

  it("todas son de solo lectura menos reportar_problema", () => {
    for (const [nombre, h] of herramientasPara(encargada)) {
      expect(h.def.annotations.readOnlyHint).toBe(nombre !== "reportar_problema");
    }
  });

  it("incluye las de detalle de caja", () => {
    const nombres = [...herramientasPara(encargada).keys()];
    for (const n of ["get_apertura_caja", "get_cierre_caja", "get_estado_caja_dia", "list_movimientos_cuenta", "list_viaticos", "list_gift_cards", "list_proveedores"]) {
      expect(nombres).toContain(n);
    }
  });

  it("sucursal_id aparece solo para quien tiene más de una", () => {
    const props = (u: Usuario) =>
      Object.keys(
        (herramientasPara(u).get("list_turnos")!.def.inputSchema as {
          properties: Record<string, unknown>;
        }).properties,
      );
    expect(props(duenio)).toContain("sucursal_id");
    expect(props(encargada)).not.toContain("sucursal_id");
  });
});

describe("resolverSucursal", () => {
  it("sin sucursal_id usa la principal y no la pasa a la herramienta", () => {
    expect(resolverSucursal(duenio, { fecha: "2026-11-03" })).toEqual({
      ok: true,
      sucursalId: "yb",
      resto: { fecha: "2026-11-03" },
    });
  });

  it("acepta otra sucursal permitida", () => {
    const r = resolverSucursal(duenio, { sucursal_id: "centro" });
    expect(r).toEqual({ ok: true, sucursalId: "centro", resto: {} });
  });

  it("rechaza una sucursal que no puede ver, en vez de caer a otra", () => {
    expect(resolverSucursal(encargada, { sucursal_id: "centro" }).ok).toBe(false);
  });
});
