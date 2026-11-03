/**
 * El protocolo MCP (JSON-RPC 2.0 sobre HTTP, "Streamable HTTP" sin estado):
 * cada POST trae un mensaje y se contesta con JSON. No usamos streams ni
 * sesiones porque todas las herramientas son consultas que terminan enseguida.
 *
 * Esto no sabe nada de la base ni del usuario: recibe cómo listar y cómo
 * ejecutar herramientas. Así se prueba solo (servidor.test.ts).
 */

export const VERSIONES_PROTOCOLO = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export interface MensajeJsonRpc {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface RespuestaJsonRpc {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface ResultadoHerramienta {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface Dependencias {
  instrucciones: string;
  listarHerramientas: () => unknown[];
  llamarHerramienta: (nombre: string, args: Record<string, unknown>) => Promise<ResultadoHerramienta>;
}

const ERR_METODO = -32601;
const ERR_PARAMS = -32602;
const ERR_PEDIDO = -32600;

function ok(id: RespuestaJsonRpc["id"], result: unknown): RespuestaJsonRpc {
  return { jsonrpc: "2.0", id, result };
}

function error(id: RespuestaJsonRpc["id"], code: number, message: string): RespuestaJsonRpc {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** null = era una notificación (sin id): no lleva respuesta. */
export async function atenderMensaje(
  msg: MensajeJsonRpc,
  deps: Dependencias,
): Promise<RespuestaJsonRpc | null> {
  if (!msg || typeof msg !== "object" || typeof msg.method !== "string") {
    return error(msg?.id ?? null, ERR_PEDIDO, "Pedido JSON-RPC inválido.");
  }
  const esNotificacion = msg.id === undefined || msg.id === null;
  if (esNotificacion) return null;
  const id = msg.id as string | number;

  switch (msg.method) {
    case "initialize": {
      const pedida = msg.params?.protocolVersion;
      const version =
        typeof pedida === "string" && VERSIONES_PROTOCOLO.includes(pedida)
          ? pedida
          : VERSIONES_PROTOCOLO[0];
      return ok(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "malala", title: "MALALA", version: "1.0.0" },
        instructions: deps.instrucciones,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: deps.listarHerramientas() });
    case "tools/call": {
      const nombre = msg.params?.name;
      const args = msg.params?.arguments ?? {};
      if (typeof nombre !== "string" || typeof args !== "object" || Array.isArray(args)) {
        return error(id, ERR_PARAMS, "tools/call necesita name y arguments.");
      }
      return ok(id, await deps.llamarHerramienta(nombre, args as Record<string, unknown>));
    }
    // No ofrecemos recursos ni prompts, pero hay clientes que preguntan igual.
    case "resources/list":
      return ok(id, { resources: [] });
    case "resources/templates/list":
      return ok(id, { resourceTemplates: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      return error(id, ERR_METODO, `Método no soportado: ${msg.method}`);
  }
}

export function textoResultado(datos: unknown): ResultadoHerramienta {
  return { content: [{ type: "text", text: JSON.stringify(datos) }] };
}

export function errorResultado(mensaje: string): ResultadoHerramienta {
  return { content: [{ type: "text", text: mensaje }], isError: true };
}
