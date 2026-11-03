import { headers } from "next/headers";
import {
  jsonConCors,
  metadataServidorAutorizacion,
  preflight,
  urlPublica,
} from "@/lib/mcp/oauth-util";

// RFC 8414: dónde están el login, el canje de tokens y el registro de clientes.
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonConCors(metadataServidorAutorizacion(urlPublica(await headers())));
}

export function OPTIONS() {
  return preflight();
}
