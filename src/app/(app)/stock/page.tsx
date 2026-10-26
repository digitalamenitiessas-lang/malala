import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRightLeft,
  History,
  PackageMinus,
  SlidersHorizontal,
} from "lucide-react";
import { listStockBySucursal } from "@/lib/data/stock";
import { getAccessScopeForUser } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { formatARS } from "@/lib/utils";
import { listSucursales } from "@/lib/data/sucursales";
import { StockTabla } from "@/components/stock-tabla";

interface SearchParams {
  sucursal?: string;
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const scope = getAccessScopeForUser(user);
  if (!scope?.puedeVerStock) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const sucursalId =
    (sp.sucursal && scope.sucursalIdsPermitidas.includes(sp.sucursal)
      ? sp.sucursal
      : scope.sucursalIdsPermitidas[0]) ?? "";

  const [rows, sucursales] = await Promise.all([
    listStockBySucursal(sucursalId),
    listSucursales({ soloActivas: true }),
  ]);
  const negativos = rows.filter((r) => r.estado === "negativo").length;
  const bajos = rows.filter((r) => r.estado === "bajo").length;
  const totalValuado = rows.reduce((acc, row) => {
    const unit = row.insumo.precio_unitario ?? 0;
    return acc + Math.max(row.cantidad, 0) * unit;
  }, 0);

  return (
    <div className="space-y-8 max-w-6xl">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Stock
          </h1>
          <p className="text-sm text-muted-foreground">
            {scope.puedeVerGlobal
              ? "Vista consolidable por sucursal"
              : "Control operativo de tu sucursal"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/stock/movimientos"
            className="border border-border px-3 py-2 rounded-md text-sm font-medium hover:bg-cream transition-colors flex items-center gap-2"
          >
            <History className="h-4 w-4 stroke-[1.5]" />
            Movimientos
          </Link>
          {scope.puedeGestionarStock && (
            <Link
              href="/stock/reponer"
              className="border border-border px-3 py-2 rounded-md text-sm font-medium hover:bg-cream transition-colors flex items-center gap-2"
            >
              <ArrowRightLeft className="h-4 w-4 stroke-[1.5]" />
              Reponer exhibición
            </Link>
          )}
          {scope.puedeGestionarStock && (
            <Link
              href="/stock/retiro"
              className="border border-border px-3 py-2 rounded-md text-sm font-medium hover:bg-cream transition-colors flex items-center gap-2"
            >
              <PackageMinus className="h-4 w-4 stroke-[1.5]" />
              Uso interno
            </Link>
          )}
          {scope.rol === "admin" && (
            <Link
              href="/stock/ajuste"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors flex items-center gap-2"
            >
              <SlidersHorizontal className="h-4 w-4 stroke-[1.5]" />
              Ajuste manual
            </Link>
          )}
        </div>
      </header>

      <form action="/stock" method="get" className="rounded-[1.5rem] border border-border bg-card p-4">
        <label className="space-y-1.5 text-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Sucursal
          </span>
          <div className="flex gap-3">
            <select
              name="sucursal"
              defaultValue={sucursalId}
              className="w-full rounded-xl border border-border bg-card px-3 py-2"
            >
              {sucursales
                .filter((item) => scope.sucursalIdsPermitidas.includes(item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
            </select>
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground"
            >
              Ver
            </button>
          </div>
        </label>
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Valor del stock"
          value={formatARS(totalValuado)}
          hint="a costo · lo que queda × $ unitario"
        />
        <SummaryCard label="Stock bajo" value={String(bajos)} tone="warning" />
        <SummaryCard label="Stock negativo" value={String(negativos)} tone="danger" />
      </div>

      <p className="-mt-4 text-xs text-muted-foreground">
        <strong>Valor en stock</strong> es lo que te queda valuado a costo (stock ×
        $ unitario), no lo que pagaste. Lo pagado queda en Gastos.
      </p>

      <StockTabla filas={rows} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "warning" | "danger";
  hint?: string;
}) {
  const className =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/10"
      : tone === "warning"
        ? "border-warning/40 bg-warning/10"
        : "border-border bg-card";
  return (
    <div className={`rounded-[1.4rem] border p-5 ${className}`}>
      <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
