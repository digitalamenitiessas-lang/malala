import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { listIngresos } from "@/lib/data/ingresos";
import { listEgresos } from "@/lib/data/egresos";
import { listSucursales } from "@/lib/data/sucursales";
import { listMediosPago } from "@/lib/data/medios-pago";
import { tramosDePago } from "@/lib/data/ingresos-helpers";
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

export default async function ReportesFlujoCajaPage({
  searchParams,
}: PageProps) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerReportes) redirect("/dashboard");

  const sp = await searchParams;
  const filtros = parseReporteFiltros(sp, scope);

  const [sucursalesAll, mediosPago, ingresos, egresos] = await Promise.all([
    listSucursales({ soloActivas: true }),
    listMediosPago(),
    listIngresos({
      sucursalId: filtros.sucursalId,
      desde: filtros.desdeIso,
      hasta: filtros.hastaIso,
    }),
    listEgresos({
      sucursalId: filtros.sucursalId,
      desde: filtros.desdeIso,
      hasta: filtros.hastaIso,
    }),
  ]);

  const sucursales = sucursalesAll.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );
  const mpById = new Map(mediosPago.map((m) => [m.id, m]));

  // Ingresos por método de pago (suma de cada tramo según su mp)
  const ingresosPorMp = new Map<
    string,
    { codigo: string; nombre: string; monto: number }
  >();
  for (const row of ingresos) {
    for (const tramo of tramosDePago(row.ingreso)) {
      const mp = mpById.get(tramo.mpId);
      if (!mp) continue;
      const entry = ingresosPorMp.get(mp.id) ?? {
        codigo: mp.codigo,
        nombre: mp.nombre,
        monto: 0,
      };
      entry.monto += tramo.valor;
      ingresosPorMp.set(mp.id, entry);
    }
  }
  const ingresosPorMpFilas = Array.from(ingresosPorMp.values()).sort(
    (a, b) => b.monto - a.monto,
  );
  const ingresosTotal = ingresosPorMpFilas.reduce(
    (acc, f) => acc + f.monto,
    0,
  );

  // Egresos por rubro (solo pagados)
  const egresosPagados = egresos.filter((e) => e.egreso.pagado);
  const egresosPorRubro = new Map<
    string,
    { rubro: string; subrubro?: string; monto: number }
  >();
  for (const row of egresosPagados) {
    if (!row.rubro) continue;
    const key = row.rubro.id;
    const entry = egresosPorRubro.get(key) ?? {
      rubro: row.rubro.rubro,
      subrubro: row.rubro.subrubro,
      monto: 0,
    };
    entry.monto += row.egreso.valor;
    egresosPorRubro.set(key, entry);
  }
  const egresosPorRubroFilas = Array.from(egresosPorRubro.values()).sort(
    (a, b) => b.monto - a.monto,
  );
  const egresosTotal = egresosPorRubroFilas.reduce(
    (acc, f) => acc + f.monto,
    0,
  );

  const egresosPendientes = egresos
    .filter((e) => !e.egreso.pagado)
    .reduce((acc, e) => acc + e.egreso.valor, 0);

  const neto = ingresosTotal - egresosTotal;

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Flujo de caja
        </h1>
        <p className="text-sm text-muted-foreground">
          {filtros.desde} → {filtros.hasta} · ingresos por método y egresos por
          rubro
        </p>
      </header>

      <ReporteFiltroForm
        action="/reportes/flujo-caja"
        filtros={filtros}
        sucursales={sucursales}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Ingresos" value={formatARS(ingresosTotal)} accent="sage" />
        <KpiCard label="Egresos pagos" value={formatARS(egresosTotal)} accent="warn" />
        <KpiCard
          label="Neto del período"
          value={formatARS(neto)}
          accent={neto >= 0 ? "sage" : "danger"}
        />
        <KpiCard
          label="Egresos pendientes"
          value={formatARS(egresosPendientes)}
          hint="no pagados aún"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-cream/30">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              Ingresos por método de pago
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2 w-20">Cod.</th>
                <th className="text-left font-medium px-4 py-2">Medio</th>
                <th className="text-right font-medium px-4 py-2 w-32">Monto</th>
                <th className="text-right font-medium px-4 py-2 w-16">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ingresosPorMpFilas.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-sm text-muted-foreground"
                  >
                    Sin ingresos.
                  </td>
                </tr>
              ) : (
                ingresosPorMpFilas.map((f) => (
                  <tr key={f.codigo} className="hover:bg-cream/30">
                    <td className="px-4 py-2 font-medium tabular-nums">
                      {f.codigo}
                    </td>
                    <td className="px-4 py-2">{f.nombre}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatARS(f.monto)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground text-xs">
                      {ingresosTotal > 0
                        ? ((f.monto / ingresosTotal) * 100).toFixed(0) + "%"
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {ingresosPorMpFilas.length > 0 && (
              <tfoot className="bg-cream/30 text-xs uppercase tracking-wider">
                <tr className="border-t-2 border-border">
                  <td colSpan={2} className="px-4 py-2 font-semibold">
                    Total
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">
                    {formatARS(ingresosTotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="bg-card border border-border rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-cream/30">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              Egresos por rubro
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">Rubro</th>
                <th className="text-right font-medium px-4 py-2 w-32">Monto</th>
                <th className="text-right font-medium px-4 py-2 w-16">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {egresosPorRubroFilas.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-6 text-center text-sm text-muted-foreground"
                  >
                    Sin egresos pagados.
                  </td>
                </tr>
              ) : (
                egresosPorRubroFilas.map((f, i) => (
                  <tr key={i} className="hover:bg-cream/30">
                    <td className="px-4 py-2">
                      <span className="font-medium">{f.rubro}</span>
                      {f.subrubro && (
                        <span className="text-xs text-muted-foreground ml-1">
                          / {f.subrubro}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatARS(f.monto)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground text-xs">
                      {egresosTotal > 0
                        ? ((f.monto / egresosTotal) * 100).toFixed(0) + "%"
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {egresosPorRubroFilas.length > 0 && (
              <tfoot className="bg-cream/30 text-xs uppercase tracking-wider">
                <tr className="border-t-2 border-border">
                  <td className="px-4 py-2 font-semibold">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">
                    {formatARS(egresosTotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "sage" | "danger" | "warn";
}) {
  const color =
    accent === "sage"
      ? "text-sage-700"
      : accent === "danger"
        ? "text-destructive"
        : accent === "warn"
          ? "text-warning"
          : "";
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`font-display text-xl mt-1 tabular-nums ${color}`}>{value}</p>
      {hint && (
        <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
      )}
    </div>
  );
}
