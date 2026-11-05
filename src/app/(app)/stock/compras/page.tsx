import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope, esAdmin } from "@/lib/auth/access";
import { sugerenciasCompra } from "@/lib/data/stock-control";
import { ComprasTabla } from "./tabla";

export const dynamic = "force-dynamic";

interface SearchParams {
  dias?: string;
  frecuencia?: string;
  margen?: string;
}

function entero(valor: string | undefined, porDefecto: number, min: number, max: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
}

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  if (!buildAccessScope(user).puedeVerStock) redirect("/dashboard");
  const sucursal = await getActiveSucursal();
  if (!sucursal) redirect("/stock");

  const sp = await searchParams;
  const dias = entero(sp.dias, 60, 7, 180);
  const frecuenciaDias = entero(sp.frecuencia, 15, 1, 90);
  const margenDias = entero(sp.margen, 7, 0, 60);
  const filas = await sugerenciasCompra(sucursal.id, dias, { frecuenciaDias, margenDias });
  const negativos = filas.filter((f) => f.stock < 0).length;
  const query = `dias=${dias}&frecuencia=${frecuenciaDias}&margen=${margenDias}`;

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">Para comprar</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            El sistema calcula cuánto se usa de cada producto (servicios, ventas y uso interno) y
            cuánto hay que comprar para llegar a la próxima compra con margen. El umbral sugerido
            es lo que se usa en los días de margen: si queda menos, el producto aparece como
            &quot;bajo&quot; en Stock.
          </p>
        </div>
        <a
          href={`/stock/compras/excel?${query}`}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-cream"
        >
          <Download className="h-4 w-4 stroke-[1.5]" />
          Lista en Excel
        </a>
      </header>

      <form
        action="/stock/compras"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-[1.5rem] border border-border bg-card p-4"
      >
        <Parametro name="frecuencia" label="Cada cuántos días compran" valor={frecuenciaDias} />
        <Parametro name="margen" label="Días de margen" valor={margenDias} />
        <Parametro name="dias" label="Consumo de los últimos (días)" valor={dias} />
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground"
        >
          Calcular
        </button>
      </form>

      {negativos > 0 && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Hay {negativos} productos con stock negativo: la lista los toma como si no hubiera nada.
          Hasta que se cargue el conteo, revisá esas cantidades antes de comprar.
        </p>
      )}

      <ComprasTabla
        filas={filas}
        sucursalId={sucursal.id}
        puedeGuardarUmbrales={esAdmin(user.rol)}
        frecuenciaDias={frecuenciaDias}
        margenDias={margenDias}
      />
    </div>
  );
}

function Parametro({ name, label, valor }: { name: string; label: string; valor: number }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="block text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={valor}
        min={0}
        className="w-28 rounded-xl border border-border bg-card px-3 py-1.5 tabular-nums"
      />
    </label>
  );
}
