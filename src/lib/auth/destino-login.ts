/**
 * Adónde volver después de entrar. Solo a la pantalla "Permitir" de la
 * conexión con IA: cualquier otra cosa sería un redirect abierto.
 */
export function destinoSeguro(next: unknown): string | null {
  return typeof next === "string" && next.startsWith("/oauth/authorize?") ? next : null;
}
