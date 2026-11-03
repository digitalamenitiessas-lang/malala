import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Rol } from "@/lib/types";

/**
 * Piezas sin base de datos del servidor OAuth del MCP: así se pueden probar
 * solas. Ver oauth.ts para la parte que guarda y valida contra la base.
 */

/** El único permiso que existe: consultar. No hay herramientas de escritura. */
export const SCOPE_MCP = "malala.consulta";

/**
 * Quién puede conectar su IA. Las empleadas no: las herramientas listan los
 * turnos y la caja de toda la sucursal, y lo de "que cada profesional vea solo
 * lo suyo" es otro trabajo.
 */
export const ROLES_MCP: Rol[] = ["superadmin", "admin", "encargada"];

export function rolPuedeUsarMcp(rol: Rol): boolean {
  return ROLES_MCP.includes(rol);
}

export const ACCESS_TTL_SEGUNDOS = 60 * 60;
export const REFRESH_TTL_DIAS = 60;
export const CODIGO_TTL_SEGUNDOS = 5 * 60;

/** Un secreto al azar, con prefijo para reconocerlo si aparece en un log. */
export function generarSecreto(prefijo: string): string {
  return `${prefijo}${randomBytes(32).toString("base64url")}`;
}

/** En la base van solo los hash: si se filtra la tabla, los tokens no sirven. */
export function hashSecreto(secreto: string): string {
  return createHash("sha256").update(secreto).digest("hex");
}

function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** PKCE con S256 (RFC 7636): el único método que aceptamos. */
export function verificarPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const calculado = createHash("sha256").update(verifier).digest("base64url");
  return igualSeguro(calculado, challenge);
}

export function verificarSecreto(secreto: string, hash: string): boolean {
  return igualSeguro(hashSecreto(secreto), hash);
}

/**
 * Adónde puede volver el usuario después de "Permitir": https, o la propia
 * computadora (Claude Code, el inspector de MCP). Nada de esquemas raros ni
 * fragmentos.
 */
export function redirectUriValida(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") {
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  }
  return false;
}

/**
 * La dirección pública del sistema, la que ve la IA. Mismo criterio que los
 * links de WhatsApp (getBaseUrl en integraciones/whatsapp.ts): en localhost,
 * el host del request; afuera, MALALA_PUBLIC_BASE_URL (el dominio de
 * producción) y si no está, lo que diga el request. Detrás de Caddy el
 * protocolo viene en X-Forwarded-Proto.
 *
 * Tiene que dar siempre lo mismo: es el "issuer" de los tokens y la IA lo
 * compara.
 */
export function urlPublica(headers: Headers): string {
  const host =
    headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headers.get("host") ||
    "localhost:3000";
  const esLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || (esLocal ? "http" : "https");
  if (esLocal) return `${proto}://${host}`;
  const fija = process.env.MALALA_PUBLIC_BASE_URL?.trim();
  if (fija) return fija.replace(/\/+$/, "");
  return `${proto}://${host}`;
}

export function urlMcp(base: string): string {
  return `${base}/api/mcp`;
}

export function metadataRecursoProtegido(base: string) {
  return {
    resource: urlMcp(base),
    authorization_servers: [base],
    scopes_supported: [SCOPE_MCP],
    bearer_methods_supported: ["header"],
    resource_name: "MALALA",
  };
}

export function metadataServidorAutorizacion(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    scopes_supported: [SCOPE_MCP],
  };
}

/** Las IA que corren en el navegador (el inspector de MCP) necesitan CORS. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

export function jsonConCors(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
