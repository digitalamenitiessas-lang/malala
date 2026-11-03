import { AsyncLocalStorage } from "node:async_hooks";
import type { Usuario } from "@/lib/types";

/**
 * Quién está consultando cuando la consulta llega por MCP (la IA de alguien),
 * no desde el navegador.
 *
 * Las funciones de src/lib/data/ sacan el usuario de la cookie de sesión
 * (requireUser) y, con eso, deciden qué puede ver. Una IA no trae cookie: trae
 * un token. En vez de duplicar cada consulta con otra firma, el endpoint MCP
 * corre la herramienta adentro de este contexto y getCurrentUser /
 * getActiveSucursalForUser lo leen primero. Así la IA ve exactamente lo mismo
 * que esa persona ve en pantalla, con los mismos controles.
 */
export interface ContextoMcp {
  usuario: Usuario;
  /** Sucursal sobre la que corre la consulta; ya validada contra las permitidas. */
  sucursalId: string;
}

const almacen = new AsyncLocalStorage<ContextoMcp>();

export function ejecutarComoUsuario<T>(
  contexto: ContextoMcp,
  fn: () => Promise<T>,
): Promise<T> {
  return almacen.run(contexto, fn);
}

export function contextoMcp(): ContextoMcp | null {
  return almacen.getStore() ?? null;
}
