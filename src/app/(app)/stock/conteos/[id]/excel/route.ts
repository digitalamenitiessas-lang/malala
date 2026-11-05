import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { getConteo } from "@/lib/data/stock-control";
import { listSucursales } from "@/lib/data/sucursales";
import { fechaArDeISO, formatYmdAr, momentoLocalAr } from "@/lib/fecha-ar";
import { hojaConteo } from "@/lib/stock-planillas";
import { crearXlsx, respuestaXlsx } from "@/lib/xlsx";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!buildAccessScope(user).puedeVerStock) return new Response("Sin permiso", { status: 403 });
  const { id } = await params;
  const conteo = await getConteo(id);
  if (!conteo) return new Response("No existe", { status: 404 });
  const sucursal = (await listSucursales()).find((s) => s.id === conteo.sucursal_id);
  const ymd = fechaArDeISO(conteo.fecha);
  const archivo = crearXlsx([
    hojaConteo(conteo, {
      sucursal: sucursal?.nombre ?? "",
      momento: `${formatYmdAr(ymd)} ${momentoLocalAr(conteo.fecha).slice(11)}`,
    }),
  ]);
  return respuestaXlsx(archivo, `Conteo ${sucursal?.nombre ?? ""} ${ymd}.xlsx`);
}
