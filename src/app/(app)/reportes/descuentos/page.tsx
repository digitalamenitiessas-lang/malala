import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { listIngresos } from "@/lib/data/ingresos";
import { listSucursales } from "@/lib/data/sucursales";
import { listMotivosDescuento } from "@/lib/data/motivos-descuento";
import { aggregate, descuentosPorMotivo } from "@/lib/data/ingresos-helpers";
import { formatARS, formatDateShort } from "@/lib/utils";
import { parseReporteFiltros, type ReporteFiltrosInput } from "../_filters";
import { ReporteFiltroForm } from "../_filter-form";
import { TableActionLink } from "@/components/table-action-link";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<ReporteFiltrosInput>;
}

export default async function ReportesDescuentosPage({
  searchParams,
}: PageProps) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerReportes) redirect("/dashboard");

  const sp = await searchParams;
  const filtros = parseReporteFiltros(sp, scope);

  const [sucursalesAll, motivosAll] = await Promise.all([
    listSucursales({ soloActivas: true }),
    listMotivosDescuento(),
  ]);
  const motivosById = new Map(motivosAll.map((m) => [m.id, m]));
  const sucursales = sucursalesAll.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );
  const sucursalNombreById = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const multiSucursal = sucursales.length > 1;

  const ingresos = await listIngresos({
    sucursalId: filtros.sucursalId,
    desde: filtros.desdeIso,
    hasta: filtros.hastaIso,
  });

  const totals = aggregate(ingresos);
  const porMotivo = descuentosPorMotivo(ingresos, motivosById);
  const conDescuento = ingresos.filter(
    (row) => row.ingreso.descuento_monto > 0,
  );
  const pctSobreTeorica =
    totals.ventaTeorica > 0
      ? (totals.descuentos / totals.ventaTeorica) * 100
      : 0;

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Descuentos
        </h1>
        <p className="text-sm text-muted-foreground">
          {filtros.desde} → {filtros.hasta} · usos y montos por tipo de
          descuento
        </p>
      </header>

      <ReporteFiltroForm
        action="/reportes/descuentos"
        filtros={filtros}
        sucursales={sucursales}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label="Total descontado"
          value={formatARS(totals.descuentos)}
          accent={totals.descuentos > 0 ? "danger" : undefined}
        />
        <Stat
          label="Ventas con descuento"
          value={String(conDescuento.length)}
          hint={`de ${totals.cantidad} ventas`}
        />
        <Stat
          label="% sobre venta teórica"
          value={`${pctSobreTeorica.toFixed(1)}%`}
        />
        <Stat label="Venta teórica" value={formatARS(totals.ventaTeorica)} />
      </section>

      <section className="bg-card border border-border rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-cream/30">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Descuentos por motivo
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2">Motivo</th>
              <th className="text-right font-medium px-4 py-2 w-28">Usos</th>
              <th className="text-right font-medium px-4 py-2 w-36">Monto</th>
              <th className="text-right font-medium px-4 py-2 w-20">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {porMotivo.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No se aplicaron descuentos en el período.
                </td>
              </tr>
            ) : (
              porMotivo.map((d) => (
                <tr key={d.motivo} className="hover:bg-cream/30">
                  <td className="px-4 py-2 font-medium">{d.motivo}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {d.cantidad}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-destructive">
                    − {formatARS(d.total)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground text-xs">
                    {totals.descuentos > 0
                      ? ((d.total / totals.descuentos) * 100).toFixed(0) + "%"
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {porMotivo.length > 0 && (
            <tfoot className="bg-cream/30 text-xs uppercase tracking-wider">
              <tr className="border-t-2 border-border">
                <td className="px-4 py-2 font-semibold">Total</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">
                  {conDescuento.length}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-destructive">
                  − {formatARS(totals.descuentos)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {conDescuento.length > 0 && (
        <section className="bg-card border border-border rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-cream/30">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              Ventas con descuento
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2 w-28">Fecha</th>
                {multiSucursal && (
                  <th className="text-left font-medium px-4 py-2 w-32">
                    Sucursal
                  </th>
                )}
                <th className="text-left font-medium px-4 py-2">Cliente</th>
                <th className="text-left font-medium px-4 py-2">Motivo</th>
                <th className="text-right font-medium px-4 py-2 w-32">
                  Descuento
                </th>
                <th className="text-right font-medium px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {conDescuento.map((row) => (
                <tr key={row.ingreso.id} className="hover:bg-cream/30">
                  <td className="px-4 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                    {formatDateShort(row.ingreso.fecha)}
                  </td>
                  {multiSucursal && (
                    <td className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                      {sucursalNombreById.get(row.ingreso.sucursal_id) ?? "—"}
                    </td>
                  )}
                  <td className="px-4 py-2">
                    {row.cliente?.nombre ?? (
                      <span className="text-muted-foreground italic">
                        sin cliente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.ingreso.descuento_motivo_id
                      ? (motivosById.get(row.ingreso.descuento_motivo_id)
                          ?.nombre ?? "Motivo eliminado")
                      : "Sin motivo"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-destructive">
                    − {formatARS(row.ingreso.descuento_monto)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <TableActionLink
                      href={`/ventas/${row.ingreso.id}`}
                      label="Ver venta"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "sage" | "danger";
}) {
  const color =
    accent === "sage"
      ? "text-sage-700"
      : accent === "danger"
        ? "text-destructive"
        : "";
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`font-display text-xl mt-1 tabular-nums ${color}`}>
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}
