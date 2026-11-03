import { registrarCliente } from "@/lib/mcp/oauth";
import { jsonConCors, preflight } from "@/lib/mcp/oauth-util";

// Registro dinámico de clientes (RFC 7591). Claude y ChatGPT se registran
// solos la primera vez que alguien agrega el conector: no hay que dar de alta
// nada a mano. Registrarse no da acceso a nada; el acceso lo da cada persona
// tocando "Permitir" con su usuario.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonConCors(
      { error: "invalid_client_metadata", error_description: "JSON inválido." },
      { status: 400 },
    );
  }

  const metodo =
    typeof body.token_endpoint_auth_method === "string"
      ? body.token_endpoint_auth_method
      : "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(metodo)) {
    return jsonConCors(
      {
        error: "invalid_client_metadata",
        error_description: `token_endpoint_auth_method no soportado: ${metodo}`,
      },
      { status: 400 },
    );
  }

  const res = await registrarCliente({
    nombre: body.client_name,
    redirectUris: body.redirect_uris,
    conSecreto: metodo !== "none",
  });
  if (!res.ok) {
    return jsonConCors(
      { error: "invalid_redirect_uri", error_description: res.error },
      { status: 400 },
    );
  }

  return jsonConCors(
    {
      client_id: res.clienteId,
      ...(res.secreto ? { client_secret: res.secreto, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: res.nombre,
      redirect_uris: res.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: metodo,
    },
    { status: 201 },
  );
}

export function OPTIONS() {
  return preflight();
}
