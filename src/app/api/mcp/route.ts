import { ejecutarComoUsuario } from "@/lib/auth/contexto-mcp";
import { hoyAr } from "@/lib/fecha-ar";
import { herramientasPara, resolverSucursal } from "@/lib/mcp/herramientas";
import { registrarUso, validarAccessToken, type SesionMcp } from "@/lib/mcp/oauth";
import { CORS_HEADERS, jsonConCors, preflight, urlPublica } from "@/lib/mcp/oauth-util";
import {
  atenderMensaje,
  errorResultado,
  textoResultado,
  type MensajeJsonRpc,
  type ResultadoHerramienta,
} from "@/lib/mcp/servidor";

// El servidor MCP: lo que Claude o ChatGPT llaman cuando la persona pregunta
// algo del salón. Cada pedido trae el token de la persona; las herramientas
// corren como ella, con sus permisos, y solo leen.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Respuesta grande = la IA se traba. Más que esto, mejor que filtre. */
const MAX_CARACTERES = 400_000;

function noAutorizado(req: Request): Response {
  const base = urlPublica(req.headers);
  return new Response(JSON.stringify({ error: "invalid_token" }), {
    status: 401,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      // Por acá la IA descubre adónde mandar a la persona a hacer login.
      "WWW-Authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/api/mcp"`,
    },
  });
}

function instrucciones(sesion: SesionMcp): string {
  return [
    "MALALA es el sistema de gestión de los salones de belleza Malala (Tucumán, Argentina).",
    `Estás consultando con el usuario de ${sesion.usuario.nombre}: ves lo mismo que esa persona ve en el sistema.`,
    "Todo es de solo lectura: no podés cargar, cambiar ni borrar nada. Los montos están en pesos argentinos y las fechas van como YYYY-MM-DD, en hora de Argentina.",
    `Al conectarse, hoy era ${hoyAr()}.`,
    "Las herramientas filtran por ID: para buscar a una profesional usá list_empleados, para una clienta list_clientes, y después pasá el ID.",
    // Al 03/11/2026 la agenda tenía un turno desde octubre: lo que pasó en el
    // salón está en las ventas, no en los turnos.
    "Los salones casi no usan la agenda de turnos: para saber qué se hizo, quién atendió o cuánto se vendió, mirá las ventas (list_ingresos, get_resumen_caja), no list_turnos.",
    // Lo que más le preguntaban a Luciano: "¿cómo hago…?".
    "Cuando pregunten cómo hacer algo en el sistema, buscá primero en el manual (herramienta ayuda) y contestá con sus pasos y los nombres de botones tal cual. Si el manual no lo cubre, decilo: no inventes pasos ni pantallas.",
    // Y lo segundo: "no me cierra la caja". Este es el orden en que Luciano
    // encontraba las diferencias a mano.
    "Si dicen que la caja no cierra o un saldo no coincide, revisá en este orden: 1) get_apertura_caja del día (¿con cuánto se abrió cada cuenta y hubo diferencia al abrir?); 2) get_estado_caja_dia (saldo inicial + ingresos − egresos por cuenta); 3) get_resumen_caja (ventas por medio de pago); 4) list_movimientos_cuenta de la cuenta que no cierra, buscando ingresos manuales, transferencias, gastos o ventas cargadas con otra fecha o en otra cuenta; 5) list_viaticos, list_anticipos y list_gift_cards si hubo plata entregada o gift cards vendidas en efectivo; 6) get_cierre_caja para ver el arqueo (esperado vs contado). Explicá la diferencia con montos y movimientos concretos.",
    "Si no encontrás la causa, si hace falta corregir un dato o si el sistema parece andar mal, contale a la persona qué encontraste y ofrecé reportarlo a soporte con reportar_problema, incluyendo en 'revisado' lo que ya consultaste.",
  ].join(" ");
}

async function llamar(
  sesion: SesionMcp,
  nombre: string,
  args: Record<string, unknown>,
): Promise<ResultadoHerramienta> {
  const herramienta = herramientasPara(sesion.usuario).get(nombre);
  if (!herramienta) return errorResultado(`No existe la herramienta ${nombre}.`);

  const sucursal = resolverSucursal(sesion.usuario, args);
  const inicio = Date.now();
  const registrar = (ok: boolean, error?: string) =>
    registrarUso({
      tokenId: sesion.tokenId,
      usuarioId: sesion.usuario.id,
      herramienta: nombre,
      argumentos: args,
      sucursalId: sucursal.ok ? sucursal.sucursalId : null,
      ok,
      error,
      duracionMs: Date.now() - inicio,
    }).catch((e) => console.error("[mcp] no se pudo registrar el uso", e));

  if (!sucursal.ok) {
    await registrar(false, sucursal.error);
    return errorResultado(sucursal.error);
  }

  try {
    const datos = await ejecutarComoUsuario(
      { usuario: sesion.usuario, sucursalId: sucursal.sucursalId },
      () => herramienta.execute(sucursal.resto, { sucursalId: sucursal.sucursalId }),
    );
    let resultado = textoResultado(datos);
    if (resultado.content[0].text.length > MAX_CARACTERES) {
      resultado = errorResultado(
        "La respuesta es demasiado grande. Acotá la consulta (por fecha, profesional o clienta).",
      );
    }
    await registrar(!resultado.isError);
    return resultado;
  } catch (e) {
    console.error(`[mcp] ${nombre} falló`, e);
    const mensaje = e instanceof Error ? e.message : String(e);
    await registrar(false, mensaje);
    return errorResultado("No se pudo hacer la consulta. Probá de nuevo o acotala.");
  }
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const sesion = token ? await validarAccessToken(token) : null;
  if (!sesion) return noAutorizado(req);

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return jsonConCors(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } },
      { status: 400 },
    );
  }

  const deps = {
    instrucciones: instrucciones(sesion),
    listarHerramientas: () => [...herramientasPara(sesion.usuario).values()].map((h) => h.def),
    llamarHerramienta: (nombre: string, args: Record<string, unknown>) =>
      llamar(sesion, nombre, args),
  };

  // Lotes: los saca la versión 2025-06-18 del protocolo, pero no cuesta nada atenderlos.
  if (Array.isArray(cuerpo)) {
    const respuestas = (
      await Promise.all(cuerpo.map((m) => atenderMensaje(m as MensajeJsonRpc, deps)))
    ).filter((r) => r !== null);
    if (respuestas.length === 0) return new Response(null, { status: 202, headers: CORS_HEADERS });
    return jsonConCors(respuestas);
  }

  const respuesta = await atenderMensaje(cuerpo as MensajeJsonRpc, deps);
  if (!respuesta) return new Response(null, { status: 202, headers: CORS_HEADERS });
  return jsonConCors(respuesta);
}

// Sin sesiones ni stream del servidor: GET y DELETE no aplican.
export function GET() {
  return new Response(null, { status: 405, headers: { ...CORS_HEADERS, Allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { ...CORS_HEADERS, Allow: "POST" } });
}

export function OPTIONS() {
  return preflight();
}
