import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { datosConteo } from "@/lib/data/stock-control";
import { formatYmdAr, instanteDeMomentoAr, momentoLocalAr } from "@/lib/fecha-ar";
import { hojasPlanillaConteo } from "@/lib/stock-planillas";
import { crearXlsx, respuestaXlsx } from "@/lib/xlsx";

/** La planilla para contar a mano, con lo que dice el sistema. */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!buildAccessScope(user).puedeVerStock) return new Response("Sin permiso", { status: 403 });
  const sucursal = await getActiveSucursal();
  if (!sucursal) return new Response("Sin sucursal", { status: 400 });

  const pedido = new URL(request.url).searchParams.get("fecha");
  const instante = (pedido && instanteDeMomentoAr(pedido)) || new Date().toISOString();
  const momento = momentoLocalAr(instante);
  const filas = await datosConteo(sucursal.id, instante);
  const [ymd, hora] = momento.split("T");
  const archivo = crearXlsx(
    hojasPlanillaConteo(filas, {
      sucursal: sucursal.nombre,
      momento: `${formatYmdAr(ymd)} ${hora}`,
    }),
  );
  return respuestaXlsx(archivo, `Planilla de conteo ${sucursal.nombre} ${ymd}.xlsx`);
}
