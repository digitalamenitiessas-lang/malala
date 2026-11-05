import Link from "next/link";
import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { ConteoStockForm } from "@/components/forms/conteo-stock-form";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { controlStockVisible } from "@/lib/stock-control";
import { buildAccessScope } from "@/lib/auth/access";
import { datosConteo } from "@/lib/data/stock-control";
import { instanteDeMomentoAr, momentoLocalAr } from "@/lib/fecha-ar";

export const dynamic = "force-dynamic";

interface SearchParams {
  /** Cuándo se contó, "YYYY-MM-DDTHH:mm" en hora argentina. */
  fecha?: string;
}

/** La hora pedida, o ahora si no vino o es futura. */
function momentoPedido(fecha: string | undefined): string {
  const ahora = new Date().toISOString();
  const instante = (fecha && instanteDeMomentoAr(fecha)) || ahora;
  return momentoLocalAr(instante > ahora ? ahora : instante);
}

export default async function ConteoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerStock) redirect("/dashboard");
  const sucursal = await getActiveSucursal();
  if (!sucursal || !controlStockVisible(user, sucursal)) redirect("/stock");

  const sp = await searchParams;
  const momento = momentoPedido(sp.fecha);
  const filas = await datosConteo(sucursal.id, instanteDeMomentoAr(momento)!);

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">Conteo de stock</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Cargá lo contado en envases. Los abiertos van como fracción: medio pomo es 0,5. Lo
            que dejes vacío no se toca. El sistema compara contra lo que había a la hora del
            conteo, así que podés cargarlo más tarde: lo vendido después sigue descontado.
          </p>
        </div>
        <Link
          href="/stock/conteos"
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-cream"
        >
          <History className="h-4 w-4 stroke-[1.5]" />
          Conteos anteriores
        </Link>
      </header>

      <ConteoStockForm
        sucursalId={sucursal.id}
        momento={momento}
        filas={filas}
        puedeCargar={scope.puedeGestionarStock}
      />
    </div>
  );
}
