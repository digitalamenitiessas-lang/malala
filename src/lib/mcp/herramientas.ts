import { toolsForRole, type ToolEntry } from "@/lib/admin-chat/registry";
import { listSucursales } from "@/lib/data/sucursales";
import { listMovimientosCc } from "@/lib/data/cuenta-corriente";
import type { Usuario } from "@/lib/types";

/**
 * Las herramientas que ve la IA conectada por MCP. Son las mismas del chat del
 * panel (src/lib/admin-chat/registry.ts), con tres diferencias:
 *
 * - Solo las de lectura. Las que cargan o cambian turnos no salen por acá.
 * - La sucursal: el chat del panel trabaja sobre la sucursal del selector; acá
 *   no hay selector, así que quien tiene más de una (los dueños) puede pasar
 *   sucursal_id en cada consulta. Sin eso, usa su sucursal principal.
 * - list_sucursales devuelve todas las que la persona puede ver, no solo una.
 */

export interface HerramientaMcp {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: true; openWorldHint: false };
}

export interface HerramientaEjecutable {
  def: HerramientaMcp;
  /** Corre adentro del contexto del usuario (ver contexto-mcp.ts). */
  execute: (args: Record<string, unknown>, ctx: { sucursalId: string }) => Promise<unknown>;
}

const PARAM_SUCURSAL = "sucursal_id";

function sucursalesDe(usuario: Usuario): string[] {
  return usuario.sucursal_ids_permitidas?.length
    ? usuario.sucursal_ids_permitidas
    : [usuario.sucursal_default_id];
}

/** Reemplazos sobre las del panel; mismo nombre, otra respuesta. */
function reemplazos(usuario: Usuario): Record<string, Partial<ToolEntry>> {
  const permitidas = sucursalesDe(usuario);
  return {
    list_sucursales: {
      execute: async () =>
        (await listSucursales({ soloActivas: true }))
          .filter((s) => permitidas.includes(s.id))
          .map((s) => ({
            id: s.id,
            nombre: s.nombre,
            principal: s.id === usuario.sucursal_default_id,
          })),
    },
    // La deuda es por local: se mira la de la sucursal de la consulta, igual
    // que en la ficha de la clienta.
    get_cuenta_corriente_cliente: {
      execute: (a, ctx) => listMovimientosCc(String(a.clienteId ?? ""), ctx.sucursalId),
    },
  };
}

export function herramientasPara(usuario: Usuario): Map<string, HerramientaEjecutable> {
  const variasSucursales = sucursalesDe(usuario).length > 1;
  const cambios = reemplazos(usuario);
  const { entries } = toolsForRole(usuario.rol);
  const out = new Map<string, HerramientaEjecutable>();

  for (const [name, entry] of Object.entries(entries)) {
    if (entry.mode !== "read") continue;
    const fn = entry.def.type === "function" ? entry.def.function : null;
    if (!fn) continue;

    const params = (fn.parameters ?? { type: "object", properties: {} }) as {
      type: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    let description = (fn.description ?? name).replace(/tu sucursal activa/g, "la sucursal");
    const properties = { ...(params.properties ?? {}) };
    if (name === "list_sucursales") {
      description = "Las sucursales que podés consultar, con su ID. La marcada como principal es la que se usa si no se indica sucursal_id.";
    } else if (variasSucursales) {
      properties[PARAM_SUCURSAL] = {
        type: "string",
        description: "ID de la sucursal (ver list_sucursales). Si no se indica, la principal.",
      };
      description += " Por defecto consulta la sucursal principal; para otra, pasá sucursal_id.";
    }

    out.set(name, {
      def: {
        name,
        description,
        inputSchema: {
          type: "object",
          properties,
          ...(params.required?.length ? { required: params.required } : {}),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      execute: cambios[name]?.execute ?? entry.execute,
    });
  }
  return out;
}

/**
 * Qué sucursal usa una consulta. Si pide una que no puede ver, error: no se
 * cae en silencio a otra, porque la IA contestaría con datos de otro local
 * creyendo que son del que preguntaron.
 */
export function resolverSucursal(
  usuario: Usuario,
  args: Record<string, unknown>,
): { ok: true; sucursalId: string; resto: Record<string, unknown> } | { ok: false; error: string } {
  const { [PARAM_SUCURSAL]: pedida, ...resto } = args;
  if (pedida === undefined || pedida === null || pedida === "") {
    return { ok: true, sucursalId: usuario.sucursal_default_id, resto };
  }
  if (typeof pedida !== "string" || !sucursalesDe(usuario).includes(pedida)) {
    return {
      ok: false,
      error: "No tenés acceso a esa sucursal. Usá list_sucursales para ver los IDs.",
    };
  }
  return { ok: true, sucursalId: pedida, resto };
}
