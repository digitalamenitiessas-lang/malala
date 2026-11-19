import { redirect } from "next/navigation";
import { RESERVAS_PROPIAS } from "@/lib/features";

/**
 * La agenda de turnos está apagada (ver src/lib/features.ts): un link guardado
 * a /turnos o a la agenda de una profesional vuelve al dashboard en vez de
 * mostrar una agenda vacía.
 */
export default function TurnosLayout({ children }: { children: React.ReactNode }) {
  if (!RESERVAS_PROPIAS) redirect("/dashboard");
  return children;
}
