"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { esAdmin } from "@/lib/auth/access";
import { getConexion, revocarConexion } from "@/lib/mcp/oauth";

/** Corta una conexión. Cada uno las suyas; los admin, cualquiera. */
export async function cortarConexion(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("conexion_id") ?? "");
  const conexion = await getConexion(id);
  if (!conexion) return;
  if (conexion.usuarioId !== user.id && !esAdmin(user.rol)) return;
  await revocarConexion(id);
  revalidatePath("/conexiones-ia");
}
