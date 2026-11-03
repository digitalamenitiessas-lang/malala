import { describe, expect, it, vi } from "vitest";
import { atenderMensaje, textoResultado, type Dependencias } from "./servidor";

function deps(): Dependencias {
  return {
    instrucciones: "hola",
    listarHerramientas: () => [{ name: "list_turnos" }],
    llamarHerramienta: vi.fn(async (nombre: string, args: Record<string, unknown>) =>
      textoResultado({ nombre, args }),
    ),
  };
}

describe("atenderMensaje", () => {
  it("initialize devuelve la versión pedida si la soporta", async () => {
    const r = await atenderMensaje(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      deps(),
    );
    expect(r?.result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "malala" },
      instructions: "hola",
    });
  });

  it("initialize con una versión desconocida contesta con la más nueva", async () => {
    const r = await atenderMensaje(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } },
      deps(),
    );
    expect((r?.result as { protocolVersion: string }).protocolVersion).toBe("2025-11-25");
  });

  it("las notificaciones no llevan respuesta", async () => {
    expect(
      await atenderMensaje({ jsonrpc: "2.0", method: "notifications/initialized" }, deps()),
    ).toBeNull();
  });

  it("tools/list lista las herramientas", async () => {
    const r = await atenderMensaje({ jsonrpc: "2.0", id: "a", method: "tools/list" }, deps());
    expect(r).toEqual({ jsonrpc: "2.0", id: "a", result: { tools: [{ name: "list_turnos" }] } });
  });

  it("tools/call pasa nombre y argumentos", async () => {
    const d = deps();
    const r = await atenderMensaje(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_turnos", arguments: { fecha: "2026-11-03" } },
      },
      d,
    );
    expect(d.llamarHerramienta).toHaveBeenCalledWith("list_turnos", { fecha: "2026-11-03" });
    expect(r?.result).toEqual(textoResultado({ nombre: "list_turnos", args: { fecha: "2026-11-03" } }));
  });

  it("tools/call sin nombre es un error de parámetros", async () => {
    const r = await atenderMensaje({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {} }, deps());
    expect(r?.error?.code).toBe(-32602);
  });

  it("un método desconocido es -32601", async () => {
    const r = await atenderMensaje({ jsonrpc: "2.0", id: 4, method: "sampling/createMessage" }, deps());
    expect(r?.error?.code).toBe(-32601);
  });

  it("un mensaje sin método es un pedido inválido", async () => {
    const r = await atenderMensaje({ jsonrpc: "2.0", id: 5 }, deps());
    expect(r?.error?.code).toBe(-32600);
  });
});
