import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { listIngresos } from "@/lib/data/ingresos";
import { listPromociones } from "@/lib/data/promociones";
import { listSucursales } from "@/lib/data/sucursales";
import {
  resumenSemanalPorProfesional,
  type SemanaProfesionalGroup,
} from "@/lib/data/ingresos-helpers";
import { formatARS } from "@/lib/utils";
import {
  parseReporteFiltros,
  type ReporteFiltrosInput,
} from "../_filters";
import { ReporteFiltroForm } from "../_filter-form";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<ReporteFiltrosInput>;
}

function formatWeekRange(desde: string, hasta: string) {
  const fmt = (value: string) => {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  };
  return `${fmt(desde)} - ${fmt(hasta)}`;
}

export default async function ReportesProfesionalesPage({
  searchParams,
}: PageProps) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerReportes) redirect("/dashboard");

  const sp = await searchParams;
  const filtros = parseReporteFiltros(sp, scope);

  const [sucursalesAll, ingresos, promociones] = await Promise.all([
    listSucursales({ soloActivas: true }),
    listIngresos({
      sucursalId: filtros.sucursalId,
      desde: filtros.desdeIso,
      hasta: filtros.hastaIso,
    }),
    listPromociones({ incluirInactivas: true }),
  ]);

  const sucursales = sucursalesAll.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );
  const promoPriceById = new Map(
    promociones.map((promo) => [promo.id, promo.precio_efectivo]),
  );
  // Cuántos servicios incluye cada combo: sirve para no repartir el precio
  // entero cuando el ticket trae sólo una parte del combo (se canjean en días
  // distintos). Ver buildFacturadoPorLineaMap.
  const promoComponentesById = new Map(
    promociones.map((promo) => [promo.id, promo.componentes.length]),
  );
  const promoListaById = new Map(
    promociones.map((promo) => [promo.id, promo.precio_lista]),
  );

  const weeklyGroups = resumenSemanalPorProfesional(ingresos, {
    desde: filtros.desde,
    hasta: filtros.hasta,
    promoPriceById,
    promoComponentesById,
    promoListaById,
  });
  const totalFacturado = weeklyGroups.reduce(
    (sum, group) => sum + group.totals.facturado,
    0,
  );
  const totalServicios = weeklyGroups.reduce(
    (sum, group) => sum + group.totals.servicios,
    0,
  );
  const profesionalesUnicos = new Set(
    weeklyGroups.flatMap((group) => group.rows.map((row) => row.empleadoId)),
  ).size;

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Resumen semanal por profesional
        </h1>
        <p className="text-sm text-muted-foreground">
          {filtros.desde} - {filtros.hasta} - {weeklyGroups.length} semana
          {weeklyGroups.length !== 1 ? "s" : ""} con datos
        </p>
      </header>

      <ReporteFiltroForm
        action="/reportes/profesionales"
        filtros={filtros}
        sucursales={sucursales}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Facturado" value={formatARS(totalFacturado)} accent="sage" />
        <Stat label="Servicios" value={String(totalServicios)} />
        <Stat label="Profesionales" value={String(profesionalesUnicos)} />
        <Stat
          label="Promedio por servicio"
          value={formatARS(totalServicios > 0 ? totalFacturado / totalServicios : 0)}
        />
      </section>

      {weeklyGroups.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No hay servicios cargados para los filtros aplicados.
        </div>
      ) : (
        <div className="space-y-6">
          {weeklyGroups.map((group) => (
            <SemanaCard key={group.key} group={group} />
          ))}
        </div>
      )}
    </div>
  );

  function SemanaCard({ group }: { group: SemanaProfesionalGroup }) {
    return (
      <section className="bg-card border border-border rounded-md overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border bg-cream/30 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Semana
            </p>
            <h2 className="font-display text-xl tracking-[0.12em] uppercase">
              {formatWeekRange(group.desde, group.hasta)}
            </h2>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="tabular-nums text-muted-foreground">
              Servicios: <strong className="text-foreground">{group.totals.servicios}</strong>
            </span>
            <span className="tabular-nums text-muted-foreground">
              Facturado: <strong className="text-sage-700">{formatARS(group.totals.facturado)}</strong>
            </span>
            <span className="tabular-nums text-muted-foreground">
              Promedio: <strong className="text-foreground">{formatARS(group.totals.promedioServicio)}</strong>
            </span>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-3">Profesional</th>
              <th className="text-right font-medium px-3 py-3 w-24">Servicios</th>
              <th className="text-right font-medium px-3 py-3 w-32">Facturado</th>
              <th className="text-right font-medium px-3 py-3 w-36">Promedio servicio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {group.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  Sin movimientos para esta semana.
                </td>
              </tr>
            ) : (
              group.rows.map((row) => (
                <tr key={`${group.key}-${row.empleadoId}`} className="hover:bg-cream/30">
                  <td className="px-3 py-3 font-medium">{row.nombre}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.servicios}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">
                    {formatARS(row.facturado)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {formatARS(row.promedioServicio)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {group.rows.length > 0 && (
            <tfoot className="bg-cream/30 text-xs uppercase tracking-wider">
              <tr className="border-t-2 border-border">
                <td className="px-3 py-3 font-semibold">Totales</td>
                <td className="px-3 py-3 text-right tabular-nums font-semibold">
                  {group.totals.servicios}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-semibold text-sage-700">
                  {formatARS(group.totals.facturado)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-semibold">
                  {formatARS(group.totals.promedioServicio)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>
    );
  }
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "sage";
}) {
  const color = accent === "sage" ? "text-sage-700" : "";
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`font-display text-xl mt-1 tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
