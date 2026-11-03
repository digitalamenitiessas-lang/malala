"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { crearCodigo } from "@/lib/mcp/oauth";
import { rolPuedeUsarMcp } from "@/lib/mcp/oauth-util";
import { CAMPOS_PEDIDO, revisarPedido, urlDeVuelta, type ParamsPedido } from "./pedido";

function leerPedido(formData: FormData): ParamsPedido {
  const p: ParamsPedido = {};
  for (const campo of CAMPOS_PEDIDO) {
    const v = formData.get(campo);
    if (typeof v === "string" && v) p[campo] = v;
  }
  return p;
}

export async function permitirAcceso(formData: FormData) {
  const pedido = await revisarPedido(leerPedido(formData));
  if (pedido.tipo !== "ok") redirect("/oauth/authorize");

  const user = await getCurrentUser();
  if (!user) redirect("/dev/login");
  if (!rolPuedeUsarMcp(user.rol)) {
    redirect(
      urlDeVuelta(pedido.redirectUri, {
        error: "access_denied",
        error_description: "Tu usuario no tiene habilitada la conexión con IA.",
        state: pedido.state,
      }),
    );
  }

  const codigo = await crearCodigo({
    clienteId: pedido.clienteId,
    usuarioId: user.id,
    redirectUri: pedido.redirectUri,
    codeChallenge: pedido.codeChallenge,
  });
  redirect(urlDeVuelta(pedido.redirectUri, { code: codigo, state: pedido.state }));
}

export async function cancelarAcceso(formData: FormData) {
  const pedido = await revisarPedido(leerPedido(formData));
  if (pedido.tipo !== "ok") redirect("/dashboard");
  redirect(
    urlDeVuelta(pedido.redirectUri, {
      error: "access_denied",
      error_description: "La persona no permitió el acceso.",
      state: pedido.state,
    }),
  );
}
