import Link from "next/link";
import { redirect } from "next/navigation";
import { History, SlidersHorizontal } from "lucide-react";
import { listStockBySucursal } from "@/lib/data/stock";
import { getAccessScopeForUser } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { formatARS } from "@/lib/utils";
import { listSucursales } from "@/lib/data/sucursales";

const UNIDAD_LABEL: Record<string, string> = {
  ud: "ud",
  ml: "ml",
  g: "g",
  aplicacion: "apl.",
};

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

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-3">Insumo</th>
              <th className="text-right font-medium px-4 py-3">Stock</th>
              <th className="text-right font-medium px-4 py-3">Umbral</th>
              <th className="text-right font-medium px-4 py-3">$ unitario</th>
              <th className="text-right font-medium px-4 py-3">Valor en stock</th>
              <th className="text-center font-medium px-4 py-3 w-28">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ insumo, cantidad, estado }) => {
              const valor =
                insumo.precio_unitario != null
                  ? cantidad * insumo.precio_unitario
                  : null;
              return (
                <tr key={insumo.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 font-medium">{insumo.nombre}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div>
                      {cantidad.toLocaleString("es-AR")}{" "}
                      {UNIDAD_LABEL[insumo.unidad_medida]}
                    </div>
                    {insumo.tamano_envase !== 1 && (
                      <div className="text-[11px] text-muted-foreground">
                        ≈{" "}
                        {(cantidad / insumo.tamano_envase).toLocaleString(
                          "es-AR",
                          { maximumFractionDigits: 2 },
                        )}{" "}
                        env. de {insumo.tamano_envase}{" "}
                        {UNIDAD_LABEL[insumo.unidad_medida]}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {insumo.umbral_stock_bajo}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {insumo.precio_unitario != null
                      ? formatARS(insumo.precio_unitario)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {valor != null ? formatARS(valor) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {estado === "negativo" && (
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          backgroundColor: "rgb(168 74 61 / 0.12)",
                          color: "var(--danger)",
                        }}
                      >
                        Negativo
                      </span>
                    )}
                    {estado === "bajo" && (
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          backgroundColor: "rgb(201 169 97 / 0.15)",
                          color: "var(--warning)",
                        }}
                      >
                        Bajo
                      </span>
                    )}
                    {estado === "ok" && (
                      <span className="bg-sage-100 text-sage-900 px-2 py-0.5 rounded text-xs font-medium">
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
