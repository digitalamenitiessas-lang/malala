import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { sugerenciasCompra } from "@/lib/data/stock-control";
import { formatYmdAr, hoyAr } from "@/lib/fecha-ar";
import { hojaCompras } from "@/lib/stock-planillas";
import { crearXlsx, respuestaXlsx } from "@/lib/xlsx";

function entero(valor: string | null, porDefecto: number, min: number, max: number): number {
  const n = Number(valor);
  return valor && Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
}

/** La lista para comprar, por proveedor: sólo lo que hay que pedir. */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!buildAccessScope(user).puedeVerStock) return new Response("Sin permiso", { status: 403 });
  const sucursal = await getActiveSucursal();
  if (!sucursal) return new Response("Sin sucursal", { status: 400 });

  const sp = new URL(request.url).searchParams;
  const dias = entero(sp.get("dias"), 60, 7, 180);
  const p = {
    frecuenciaDias: entero(sp.get("frecuencia"), 15, 1, 90),
    margenDias: entero(sp.get("margen"), 7, 0, 60),
  };
  const filas = (await sugerenciasCompra(sucursal.id, dias, p)).filter(
    (f) => f.sugerencia.comprarEnvases > 0,
  );
  const hoy = hoyAr();
  const archivo = crearXlsx([
    hojaCompras(filas, { sucursal: sucursal.nombre, fecha: formatYmdAr(hoy), dias, p }),
  ]);
  return respuestaXlsx(archivo, `Para comprar ${sucursal.nombre} ${hoy}.xlsx`);
}
