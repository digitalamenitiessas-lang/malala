import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { controlStockVisible } from "@/lib/stock-control";
import { buildAccessScope } from "@/lib/auth/access";
import { reporteStock } from "@/lib/data/stock-control";
import {
  finDeDiaArISO,
  formatYmdAr,
  hoyAr,
  inicioDeDiaArISO,
  sumarDiasYmd,
} from "@/lib/fecha-ar";
import { ReporteStockTabla } from "./tabla";

export const dynamic = "force-dynamic";

interface SearchParams {
  desde?: string;
  hasta?: string;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Lunes de la semana de una fecha. */
function lunes(ymd: string): string {
  const dia = new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDiasYmd(ymd, -((dia + 6) % 7));
}

function periodos(hoy: string) {
  const esteLunes = lunes(hoy);
  const mes = hoy.slice(0, 7);
  const finMesPasado = sumarDiasYmd(`${mes}-01`, -1);
  return [
    { label: "Esta semana", desde: esteLunes, hasta: hoy },
    { label: "Semana pasada", desde: sumarDiasYmd(esteLunes, -7), hasta: sumarDiasYmd(esteLunes, -1) },
    { label: "Este mes", desde: `${mes}-01`, hasta: hoy },
    { label: "Mes pasado", desde: `${finMesPasado.slice(0, 7)}-01`, hasta: finMesPasado },
  ];
}

export default async function ReporteStockPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  if (!buildAccessScope(user).puedeVerStock) redirect("/dashboard");
  const sucursal = await getActiveSucursal();
  if (!sucursal || !controlStockVisible(user, sucursal)) redirect("/stock");

  const sp = await searchParams;
  const hoy = hoyAr();
  const opciones = periodos(hoy);
  let desde = sp.desde && YMD.test(sp.desde) ? sp.desde : opciones[2].desde;
  let hasta = sp.hasta && YMD.test(sp.hasta) ? sp.hasta : hoy;
  if (hasta > hoy) hasta = hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  const filas = await reporteStock(sucursal.id, inicioDeDiaArISO(desde), finDeDiaArISO(hasta));
  const query = `desde=${desde}&hasta=${hasta}`;

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">Reporte de stock</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Por producto: con cuánto empezó el período, qué entró, qué salió y con cuánto terminó.
            En envases; las salidas en negativo. {sucursal.nombre}, del {formatYmdAr(desde)} al{" "}
            {formatYmdAr(hasta)}.
          </p>
        </div>
        <a
          href={`/stock/reporte/excel?${query}`}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-cream"
        >
          <Download className="h-4 w-4 stroke-[1.5]" />
          Excel
        </a>
      </header>

      <form
        action="/stock/reporte"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-[1.5rem] border border-border bg-card p-4"
      >
        <div className="flex flex-wrap gap-2">
          {opciones.map((o) => {
            const activo = o.desde === desde && o.hasta === hasta;
            return (
              <Link
                key={o.label}
                href={`/stock/reporte?desde=${o.desde}&hasta=${o.hasta}`}
                className={`rounded-md border px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
                  activo ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-cream"
                }`}
              >
                {o.label}
              </Link>
            );
          })}
        </div>
        <label className="space-y-1 text-sm">
          <span className="block text-xs uppercase tracking-wider text-muted-foreground">Desde</span>
          <input
            type="date"
            name="desde"
            defaultValue={desde}
            max={hoy}
            className="rounded-xl border border-border bg-card px-3 py-1.5"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs uppercase tracking-wider text-muted-foreground">Hasta</span>
          <input
            type="date"
            name="hasta"
            defaultValue={hasta}
            max={hoy}
            className="rounded-xl border border-border bg-card px-3 py-1.5"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground"
        >
          Ver
        </button>
      </form>

      <ReporteStockTabla filas={filas} />
    </div>
  );
}
