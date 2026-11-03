import { canjearCodigo, refrescarTokens } from "@/lib/mcp/oauth";
import { jsonConCors, preflight } from "@/lib/mcp/oauth-util";

// Canje de tokens: el código de "Permitir" por tokens, o un refresh por otros
// nuevos. El cuerpo llega como formulario (lo normal en OAuth); aceptamos JSON
// por las dudas.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function leerCuerpo(req: Request): Promise<Record<string, string>> {
  const tipo = req.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) {
    const json = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(json).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
  }
  const form = new URLSearchParams(await req.text());
  return Object.fromEntries(form.entries());
}

/** client_secret_basic: "Authorization: Basic base64(id:secreto)". */
function credencialesBasic(req: Request): { id?: string; secreto?: string } {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("basic ")) return {};
  try {
    const [id, secreto] = Buffer.from(auth.slice(6), "base64").toString().split(":");
    return { id: decodeURIComponent(id ?? ""), secreto: decodeURIComponent(secreto ?? "") };
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const body = await leerCuerpo(req);
  const basic = credencialesBasic(req);
  const clienteId = basic.id || body.client_id || "";
  const clienteSecreto = basic.secreto || body.client_secret || undefined;

  let res;
  if (body.grant_type === "authorization_code") {
    if (!body.code || !body.redirect_uri || !body.code_verifier) {
      return jsonConCors(
        {
          error: "invalid_request",
          error_description: "Faltan code, redirect_uri o code_verifier.",
        },
        { status: 400 },
      );
    }
    res = await canjearCodigo({
      codigo: body.code,
      clienteId,
      clienteSecreto,
      redirectUri: body.redirect_uri,
      codeVerifier: body.code_verifier,
    });
  } else if (body.grant_type === "refresh_token") {
    if (!body.refresh_token) {
      return jsonConCors(
        { error: "invalid_request", error_description: "Falta refresh_token." },
        { status: 400 },
      );
    }
    res = await refrescarTokens({
      refreshToken: body.refresh_token,
      clienteId,
      clienteSecreto,
    });
  } else {
    return jsonConCors(
      { error: "unsupported_grant_type", error_description: "grant_type no soportado." },
      { status: 400 },
    );
  }

  if ("error" in res) {
    return jsonConCors(res, { status: res.error === "invalid_client" ? 401 : 400 });
  }
  return jsonConCors(res);
}

export function OPTIONS() {
  return preflight();
}
