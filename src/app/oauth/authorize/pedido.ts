import { getCliente } from "@/lib/mcp/oauth";

/**
 * Lo que manda la IA a /oauth/authorize, revisado. Lo usan la página (para
 * mostrar "Permitir") y la acción (que lo vuelve a revisar: los campos ocultos
 * del formulario se pueden tocar).
 *
 * Si el cliente o la dirección de vuelta no cierran, NO se redirige a ningún
 * lado: se muestra el error acá. Mandar a alguien a una dirección que no es la
 * registrada es justamente lo que hay que evitar.
 */
export type PedidoAutorizacion =
  | { tipo: "fatal"; mensaje: string }
  | {
      tipo: "error";
      redirectUri: string;
      state?: string;
      error: string;
      descripcion: string;
    }
  | {
      tipo: "ok";
      clienteId: string;
      clienteNombre: string;
      redirectUri: string;
      state?: string;
      codeChallenge: string;
    };

export const CAMPOS_PEDIDO = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;

export type ParamsPedido = Partial<Record<(typeof CAMPOS_PEDIDO)[number], string>>;

export async function revisarPedido(p: ParamsPedido): Promise<PedidoAutorizacion> {
  const cliente = p.client_id ? await getCliente(p.client_id) : null;
  if (!cliente) {
    return {
      tipo: "fatal",
      mensaje: "La aplicación que pidió acceso no está registrada. Volvé a agregar el conector desde tu IA.",
    };
  }
  const redirectUri = p.redirect_uri ?? "";
  if (!cliente.redirectUris.includes(redirectUri)) {
    return {
      tipo: "fatal",
      mensaje: "La dirección de vuelta no coincide con la registrada por la aplicación.",
    };
  }

  const volverConError = (error: string, descripcion: string): PedidoAutorizacion => ({
    tipo: "error",
    redirectUri,
    state: p.state,
    error,
    descripcion,
  });
  if (p.response_type !== "code") {
    return volverConError("unsupported_response_type", "Solo se acepta response_type=code.");
  }
  if (!p.code_challenge || p.code_challenge_method !== "S256") {
    return volverConError("invalid_request", "Hace falta PKCE con S256.");
  }

  return {
    tipo: "ok",
    clienteId: cliente.id,
    clienteNombre: cliente.nombre,
    redirectUri,
    state: p.state,
    codeChallenge: p.code_challenge,
  };
}

export function urlDeVuelta(
  redirectUri: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return url.toString();
}
