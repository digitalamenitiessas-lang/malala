import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { controlStockVisible } from "@/lib/stock-control";
import { reporteStock } from "@/lib/data/stock-control";
import { finDeDiaArISO, formatYmdAr, hoyAr, inicioDeDiaArISO } from "@/lib/fecha-ar";
import { hojaReporte } from "@/lib/stock-planillas";
import { crearXlsx, respuestaXlsx } from "@/lib/xlsx";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const user = await requireUser();
  if (!buildAccessScope(user).puedeVerStock) return new Response("Sin permiso", { status: 403 });
  const sucursal = await getActiveSucursal();
  if (!sucursal) return new Response("Sin sucursal", { status: 400 });
  if (!controlStockVisible(user, sucursal)) return new Response("No disponible", { status: 404 });

  const sp = new URL(request.url).searchParams;
  const hoy = hoyAr();
  const desde = YMD.test(sp.get("desde") ?? "") ? sp.get("desde")! : `${hoy.slice(0, 7)}-01`;
  const hasta = YMD.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : hoy;
  const filas = await reporteStock(sucursal.id, inicioDeDiaArISO(desde), finDeDiaArISO(hasta));
  const archivo = crearXlsx([
    hojaReporte(filas, {
      sucursal: sucursal.nombre,
      periodo: `Del ${formatYmdAr(desde)} al ${formatYmdAr(hasta)}`,
    }),
  ]);
  return respuestaXlsx(archivo, `Reporte de stock ${sucursal.nombre} ${desde} a ${hasta}.xlsx`);
}
