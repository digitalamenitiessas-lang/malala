import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { listConteos } from "@/lib/data/stock-control";
import { formatARS, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ConteosPage() {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerStock) redirect("/dashboard");
  const sucursal = await getActiveSucursal();
  if (!sucursal) redirect("/stock");

  const conteos = await listConteos(sucursal.id);

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">Conteos</h1>
          <p className="text-sm text-muted-foreground">
            Quién contó, cuándo y qué diferencias hubo en {sucursal.nombre}.
          </p>
        </div>
        {scope.puedeGestionarStock && (
          <Link
            href="/stock/conteo"
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
          >
            <ClipboardList className="h-4 w-4 stroke-[1.5]" />
            Nuevo conteo
          </Link>
        )}
      </header>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Contado</th>
              <th className="px-4 py-3 text-left font-medium">Quién</th>
              <th className="px-4 py-3 text-right font-medium">Productos</th>
              <th className="px-4 py-3 text-right font-medium">Con diferencia</th>
              <th className="px-4 py-3 text-right font-medium">Faltante</th>
              <th className="px-4 py-3 text-right font-medium">Sobrante</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {conteos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Todavía no se cargó ningún conteo.
                </td>
              </tr>
            )}
            {conteos.map((c) => (
              <tr key={c.id} className="hover:bg-cream/30">
                <td className="px-4 py-3">
                  <Link
                    href={`/stock/conteos/${c.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {formatDateTime(c.fecha)}
                  </Link>
                  {c.nota && <div className="text-[11px] text-muted-foreground">{c.nota}</div>}
                </td>
                <td className="px-4 py-3">
                  {c.contado_por ?? "—"}
                  <div className="text-[11px] text-muted-foreground">cargó {c.usuario_nombre}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{c.productos}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.con_diferencia}</td>
                <td className="px-4 py-3 text-right tabular-nums text-destructive">
                  {formatARS(c.valor_faltante)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-sage-700">
                  +{formatARS(c.valor_sobrante)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
