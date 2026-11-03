import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client/postgres";
import {
  mcpRegistro,
  oauthClientes,
  oauthCodigos,
  oauthTokens,
  profiles,
} from "@/lib/db/schema";
import { cargarUsuario } from "@/lib/auth/session";
import type { Usuario } from "@/lib/types";
import {
  ACCESS_TTL_SEGUNDOS,
  CODIGO_TTL_SEGUNDOS,
  REFRESH_TTL_DIAS,
  SCOPE_MCP,
  generarSecreto,
  hashSecreto,
  redirectUriValida,
  rolPuedeUsarMcp,
  verificarPkce,
  verificarSecreto,
} from "./oauth-util";

/**
 * Servidor OAuth 2.1 del MCP, contra la base. El flujo es el estándar que
 * esperan Claude y ChatGPT:
 *
 *   1. La IA se registra sola (registrarCliente) y recibe un client_id.
 *   2. Manda a la persona a /oauth/authorize: entra con su usuario de MALALA y
 *      toca "Permitir" (crearCodigo).
 *   3. La IA cambia el código por tokens (canjearCodigo), probando con PKCE
 *      que es la misma que empezó el flujo.
 *   4. Cada consulta trae el access token (validarAccessToken); cuando vence,
 *      lo renueva con el refresh (refrescarTokens).
 */

export interface TokensEmitidos {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export type ErrorOAuth = {
  error: "invalid_request" | "invalid_client" | "invalid_grant" | "unauthorized_client";
  error_description: string;
};

function enSegundos(s: number): Date {
  return new Date(Date.now() + s * 1000);
}

// ───────────────────────── Clientes ─────────────────────────

export async function registrarCliente(input: {
  nombre?: unknown;
  redirectUris?: unknown;
  conSecreto: boolean;
}): Promise<
  | { ok: true; clienteId: string; secreto?: string; nombre: string; redirectUris: string[] }
  | { ok: false; error: string }
> {
  const uris = Array.isArray(input.redirectUris)
    ? input.redirectUris.filter((u): u is string => typeof u === "string")
    : [];
  if (uris.length === 0 || uris.length > 10) {
    return { ok: false, error: "redirect_uris es obligatorio (entre 1 y 10)." };
  }
  const invalida = uris.find((u) => !redirectUriValida(u));
  if (invalida) {
    return { ok: false, error: `redirect_uri no permitida: ${invalida}` };
  }
  const nombre =
    typeof input.nombre === "string" && input.nombre.trim()
      ? input.nombre.trim().slice(0, 100)
      : new URL(uris[0]).hostname;

  const clienteId = generarSecreto("mlla_cli_");
  const secreto = input.conSecreto ? generarSecreto("mlla_cs_") : undefined;
  await getDb()
    .insert(oauthClientes)
    .values({
      id: clienteId,
      nombre,
      redirectUris: uris,
      secretoHash: secreto ? hashSecreto(secreto) : null,
    });
  return { ok: true, clienteId, secreto, nombre, redirectUris: uris };
}

export async function getCliente(clienteId: string) {
  if (!clienteId) return null;
  const [row] = await getDb()
    .select()
    .from(oauthClientes)
    .where(eq(oauthClientes.id, clienteId))
    .limit(1);
  return row ?? null;
}

/** Si el cliente se registró con secreto, tiene que mandarlo; si no, PKCE alcanza. */
async function autenticarCliente(
  clienteId: string,
  secreto: string | undefined,
): Promise<ErrorOAuth | null> {
  const cliente = await getCliente(clienteId);
  if (!cliente) {
    return { error: "invalid_client", error_description: "Cliente desconocido." };
  }
  if (cliente.secretoHash && !(secreto && verificarSecreto(secreto, cliente.secretoHash))) {
    return { error: "invalid_client", error_description: "Secreto de cliente inválido." };
  }
  return null;
}

// ───────────────────────── Autorización ─────────────────────────

export async function crearCodigo(input: {
  clienteId: string;
  usuarioId: string;
  redirectUri: string;
  codeChallenge: string;
}): Promise<string> {
  const codigo = generarSecreto("mlla_cod_");
  await getDb()
    .insert(oauthCodigos)
    .values({
      codigoHash: hashSecreto(codigo),
      clienteId: input.clienteId,
      usuarioId: input.usuarioId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      expiraEn: enSegundos(CODIGO_TTL_SEGUNDOS),
    });
  return codigo;
}

async function emitirTokens(clienteId: string, usuarioId: string): Promise<TokensEmitidos> {
  const access = generarSecreto("mlla_at_");
  const refresh = generarSecreto("mlla_rt_");
  await getDb()
    .insert(oauthTokens)
    .values({
      id: crypto.randomUUID(),
      clienteId,
      usuarioId,
      accessHash: hashSecreto(access),
      accessExpiraEn: enSegundos(ACCESS_TTL_SEGUNDOS),
      refreshHash: hashSecreto(refresh),
      refreshExpiraEn: enSegundos(REFRESH_TTL_DIAS * 24 * 60 * 60),
    });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SEGUNDOS,
    refresh_token: refresh,
    scope: SCOPE_MCP,
  };
}

export async function canjearCodigo(input: {
  codigo: string;
  clienteId: string;
  clienteSecreto?: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokensEmitidos | ErrorOAuth> {
  const errCliente = await autenticarCliente(input.clienteId, input.clienteSecreto);
  if (errCliente) return errCliente;

  // Se marca usado ANTES de mirar el resto: un código vale una sola vez, aunque
  // el intento falle. Si dos pedidos llegan juntos, solo uno lo consigue.
  const [codigo] = await getDb()
    .update(oauthCodigos)
    .set({ usadoEn: new Date() })
    .where(
      and(
        eq(oauthCodigos.codigoHash, hashSecreto(input.codigo)),
        isNull(oauthCodigos.usadoEn),
        gt(oauthCodigos.expiraEn, new Date()),
      ),
    )
    .returning();

  const invalido: ErrorOAuth = {
    error: "invalid_grant",
    error_description: "El código no es válido, ya se usó o venció.",
  };
  if (!codigo) return invalido;
  if (codigo.clienteId !== input.clienteId) return invalido;
  if (codigo.redirectUri !== input.redirectUri) return invalido;
  if (!verificarPkce(input.codeVerifier, codigo.codeChallenge)) {
    return { error: "invalid_grant", error_description: "code_verifier no coincide." };
  }
  return emitirTokens(codigo.clienteId, codigo.usuarioId);
}

/** Renueva la conexión: cambia access Y refresh (el refresh viejo deja de valer). */
export async function refrescarTokens(input: {
  refreshToken: string;
  clienteId: string;
  clienteSecreto?: string;
}): Promise<TokensEmitidos | ErrorOAuth> {
  const errCliente = await autenticarCliente(input.clienteId, input.clienteSecreto);
  if (errCliente) return errCliente;

  const access = generarSecreto("mlla_at_");
  const refresh = generarSecreto("mlla_rt_");
  const [fila] = await getDb()
    .update(oauthTokens)
    .set({
      accessHash: hashSecreto(access),
      accessExpiraEn: enSegundos(ACCESS_TTL_SEGUNDOS),
      refreshHash: hashSecreto(refresh),
      refreshExpiraEn: enSegundos(REFRESH_TTL_DIAS * 24 * 60 * 60),
    })
    .where(
      and(
        eq(oauthTokens.refreshHash, hashSecreto(input.refreshToken)),
        eq(oauthTokens.clienteId, input.clienteId),
        isNull(oauthTokens.revocadoEn),
        gt(oauthTokens.refreshExpiraEn, new Date()),
      ),
    )
    .returning({ id: oauthTokens.id });

  if (!fila) {
    return {
      error: "invalid_grant",
      error_description: "La conexión venció o fue cortada. Hay que volver a conectar.",
    };
  }
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SEGUNDOS,
    refresh_token: refresh,
    scope: SCOPE_MCP,
  };
}

// ───────────────────────── Uso ─────────────────────────

export interface SesionMcp {
  tokenId: string;
  usuario: Usuario;
}

/**
 * El dueño de un access token, si el token sigue valiendo y la persona sigue
 * pudiendo usar el MCP. El usuario se carga de nuevo en cada consulta: si la
 * dan de baja o le cambian el rol, la IA lo nota en la próxima pregunta.
 */
export async function validarAccessToken(token: string): Promise<SesionMcp | null> {
  if (!token.startsWith("mlla_at_")) return null;
  const db = getDb();
  const [fila] = await db
    .select({ id: oauthTokens.id, usuarioId: oauthTokens.usuarioId })
    .from(oauthTokens)
    .where(
      and(
        eq(oauthTokens.accessHash, hashSecreto(token)),
        isNull(oauthTokens.revocadoEn),
        gt(oauthTokens.accessExpiraEn, new Date()),
      ),
    )
    .limit(1);
  if (!fila) return null;

  const usuario = await cargarUsuario(fila.usuarioId);
  if (!usuario || !rolPuedeUsarMcp(usuario.rol)) return null;

  await db
    .update(oauthTokens)
    .set({ ultimoUsoEn: new Date() })
    .where(eq(oauthTokens.id, fila.id));
  return { tokenId: fila.id, usuario };
}

export async function registrarUso(input: {
  tokenId: string;
  usuarioId: string;
  herramienta: string;
  argumentos: unknown;
  sucursalId: string | null;
  ok: boolean;
  error?: string;
  duracionMs: number;
}) {
  await getDb()
    .insert(mcpRegistro)
    .values({
      id: crypto.randomUUID(),
      tokenId: input.tokenId,
      usuarioId: input.usuarioId,
      herramienta: input.herramienta,
      argumentos: input.argumentos ?? null,
      sucursalId: input.sucursalId,
      ok: input.ok,
      error: input.error?.slice(0, 500) ?? null,
      duracionMs: input.duracionMs,
    });
}

// ───────────────────────── Pantalla de conexiones ─────────────────────────

export interface ConexionIa {
  id: string;
  cliente: string;
  usuarioId: string;
  usuarioNombre: string;
  creadoEn: Date;
  ultimoUsoEn: Date | null;
}

/** Las conexiones de una persona, o las de todos si no se pasa usuario. */
export async function listarConexiones(usuarioId?: string): Promise<ConexionIa[]> {
  const rows: ConexionIa[] = await getDb()
    .select({
      id: oauthTokens.id,
      cliente: oauthClientes.nombre,
      usuarioId: oauthTokens.usuarioId,
      usuarioNombre: profiles.nombre,
      creadoEn: oauthTokens.creadoEn,
      ultimoUsoEn: oauthTokens.ultimoUsoEn,
    })
    .from(oauthTokens)
    .innerJoin(oauthClientes, eq(oauthClientes.id, oauthTokens.clienteId))
    .innerJoin(profiles, eq(profiles.userId, oauthTokens.usuarioId))
    .where(
      and(
        isNull(oauthTokens.revocadoEn),
        gt(oauthTokens.refreshExpiraEn, new Date()),
        usuarioId ? eq(oauthTokens.usuarioId, usuarioId) : undefined,
      ),
    )
    .orderBy(desc(oauthTokens.creadoEn));
  return rows;
}

export async function getConexion(tokenId: string) {
  const [row] = await getDb()
    .select({ id: oauthTokens.id, usuarioId: oauthTokens.usuarioId })
    .from(oauthTokens)
    .where(eq(oauthTokens.id, tokenId))
    .limit(1);
  return row ?? null;
}

export async function revocarConexion(tokenId: string): Promise<void> {
  await getDb()
    .update(oauthTokens)
    .set({ revocadoEn: new Date() })
    .where(and(eq(oauthTokens.id, tokenId), isNull(oauthTokens.revocadoEn)));
}

export interface UsoMcp {
  id: string;
  usuarioNombre: string;
  herramienta: string;
  ok: boolean;
  creadoEn: Date;
}

export async function listarUsosRecientes(
  usuarioId: string | undefined,
  limite = 30,
): Promise<UsoMcp[]> {
  return getDb()
    .select({
      id: mcpRegistro.id,
      usuarioNombre: profiles.nombre,
      herramienta: mcpRegistro.herramienta,
      ok: mcpRegistro.ok,
      creadoEn: mcpRegistro.creadoEn,
    })
    .from(mcpRegistro)
    .innerJoin(profiles, eq(profiles.userId, mcpRegistro.usuarioId))
    .where(usuarioId ? eq(mcpRegistro.usuarioId, usuarioId) : undefined)
    .orderBy(desc(mcpRegistro.creadoEn))
    .limit(limite);
}
