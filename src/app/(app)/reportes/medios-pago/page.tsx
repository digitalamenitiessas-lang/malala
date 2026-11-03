import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { listIngresos } from "@/lib/data/ingresos";
import { listSucursales } from "@/lib/data/sucursales";
import { listMediosPago } from "@/lib/data/medios-pago";
import { listCuentas, sumImpuestosByCuenta } from "@/lib/data/cuentas-bancarias";
import { tramosDePago } from "@/lib/data/ingresos-helpers";
import { formatARS } from "@/lib/utils";
import { parseReporteFiltros, type ReporteFiltrosInput } from "../_filters";
import { ReporteFiltroForm } from "../_filter-form";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<ReporteFiltrosInput>;
}

interface FilaMedio {
  id: string;
  codigo: string;
  nombre: string;
  cuentaId?: string;
  cuentaNombre: string;
  recargoPct: number;
  monto: number;
  operaciones: number;
}

export default async function ReportesMediosPagoPage({
  searchParams,
}: PageProps) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerReportes) redirect("/dashboard");

  const sp = await searchParams;
  const filtros = parseReporteFiltros(sp, scope);

  const [sucursalesAll, mediosPago, cuentas, ingresos, impuestosByCuenta] =
    await Promise.all([
      listSucursales({ soloActivas: true }),
      // Incluimos CC (cuenta corriente): fiar es un medio de cobro más.
      listMediosPago({ incluirCuentaCorriente: true }),
      listCuentas(),
      listIngresos({
        sucursalId: filtros.sucursalId,
        desde: filtros.desdeIso,
        hasta: filtros.hastaIso,
      }),
      sumImpuestosByCuenta({
        sucursalId: filtros.sucursalId,
        desde: filtros.desdeIso,
        hasta: filtros.hastaIso,
      }),
    ]);

  const sucursales = sucursalesAll.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );
  const mpById = new Map(mediosPago.map((m) => [m.id, m]));
  const cuentaNombreById = new Map(cuentas.map((c) => [c.id, c.nombre]));

  // Agregamos por medio de pago: monto cobrado y cantidad de operaciones.
  // Cada tramo pagado (mp1 y, si hay, mp2 y mp3) cuenta como una operación.
  const filasById = new Map<string, FilaMedio>();
  function acumular(mpId: string, monto: number) {
    const mp = mpById.get(mpId);
    if (!mp) return;
    const fila = filasById.get(mp.id) ?? {
      id: mp.id,
      codigo: mp.codigo,
      nombre: mp.nombre,
      cuentaId: mp.cuenta_id,
      cuentaNombre: mp.cuenta_id
        ? (cuentaNombreById.get(mp.cuenta_id) ?? "—")
        : "—",
      recargoPct: mp.recargo_pct,
      monto: 0,
      operaciones: 0,
    };
    fila.monto += monto;
    fila.operaciones += 1;
    filasById.set(mp.id, fila);
  }

  for (const row of ingresos) {
    for (const tramo of tramosDePago(row.ingreso)) acumular(tramo.mpId, tramo.valor);
  }

  const filas = Array.from(filasById.values())
    .filter((f) => f.monto !== 0)
    .sort((a, b) => b.monto - a.monto);

  const total = filas.reduce((acc, f) => acc + f.monto, 0);
  const operacionesTotal = filas.reduce((acc, f) => acc + f.operaciones, 0);
  const ticketPromedio = operacionesTotal > 0 ? total / operacionesTotal : 0;

  // Impuestos son a nivel cuenta (no por medio). Para el total, sumamos las
  // cuentas destino distintas presentes en el reporte y evitamos duplicar
  // cuando varios medios comparten cuenta.
  const cuentasEnFilas = new Set(
    filas.map((f) => f.cuentaId).filter((id): id is string => Boolean(id)),
  );
  const totalImpuestos = Array.from(cuentasEnFilas).reduce(
    (acc, id) => acc + (impuestosByCuenta.get(id) ?? 0),
    0,
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Medios de pago
        </h1>
        <p className="text-sm text-muted-foreground">
          {filtros.desde} → {filtros.hasta} · cobros por medio de pago
        </p>
      </header>

      <ReporteFiltroForm
        action="/reportes/medios-pago"
        filtros={filtros}
        sucursales={sucursales}
      />

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Cobrado" value={formatARS(total)} accent="sage" />
        <KpiCard label="Operaciones" value={String(operacionesTotal)} hint="tramos cobrados" />
        <KpiCard label="Ticket prom." value={formatARS(ticketPromedio)} />
        <KpiCard label="Medios usados" value={String(filas.length)} />
        <KpiCard
          label="Impuestos"
          value={formatARS(totalImpuestos)}
          hint="cuentas destino"
          accent="warn"
        />
      </section>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-cream/30 space-y-1">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Detalle por medio de pago
          </h2>
          <p className="text-[11px] text-muted-foreground normal-case tracking-normal">
            “Impuestos cuenta” es el total retenido por la cuenta destino en el
            período (deb/cred + ingresos brutos), no solo de este medio. El total
            no duplica cuentas compartidas por varios medios.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2 w-20">Cod.</th>
              <th className="text-left font-medium px-4 py-2">Medio</th>
              <th className="text-left font-medium px-4 py-2">Cuenta destino</th>
              <th className="text-right font-medium px-4 py-2 w-32">
                Impuestos cuenta
              </th>
              <th className="text-right font-medium px-4 py-2 w-24">Oper.</th>
              <th className="text-right font-medium px-4 py-2 w-32">Cobrado</th>
              <th className="text-right font-medium px-4 py-2 w-28">Ticket prom.</th>
              <th className="text-right font-medium px-4 py-2 w-20">Recargo</th>
              <th className="text-right font-medium px-4 py-2 w-16">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  Sin cobros en el período.
                </td>
              </tr>
            ) : (
              filas.map((f) => (
                <tr key={f.id} className="hover:bg-cream/30">
                  <td className="px-4 py-2 font-medium tabular-nums">{f.codigo}</td>
                  <td className="px-4 py-2">{f.nombre}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {f.cuentaNombre}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {f.cuentaId && (impuestosByCuenta.get(f.cuentaId) ?? 0) > 0 ? (
                      <span className="text-warning">
                        {formatARS(impuestosByCuenta.get(f.cuentaId) ?? 0)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {f.operaciones}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatARS(f.monto)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {formatARS(f.operaciones > 0 ? f.monto / f.operaciones : 0)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground text-xs">
                    {f.recargoPct > 0 ? `${f.recargoPct}%` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground text-xs">
                    {total > 0 ? ((f.monto / total) * 100).toFixed(0) + "%" : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filas.length > 0 && (
            <tfoot className="bg-cream/30 text-xs uppercase tracking-wider">
              <tr className="border-t-2 border-border">
                <td colSpan={3} className="px-4 py-2 font-semibold">
                  Total
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-warning">
                  {formatARS(totalImpuestos)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">
                  {operacionesTotal}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">
                  {formatARS(total)}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
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
