import { headers } from "next/headers";
import {
  jsonConCors,
  metadataRecursoProtegido,
  preflight,
  urlPublica,
} from "@/lib/mcp/oauth-util";

// RFC 9728: la IA pregunta acá quién da los permisos para /api/mcp. Algunas
// lo piden en la raíz y otras con la ruta del recurso atrás
// (/.well-known/oauth-protected-resource/api/mcp): las dos responden igual.
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonConCors(metadataRecursoProtegido(urlPublica(await headers())));
}

export function OPTIONS() {
  return preflight();
}
