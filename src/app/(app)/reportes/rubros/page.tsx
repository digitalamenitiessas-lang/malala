import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { listIngresos } from "@/lib/data/ingresos";
import { listSucursales } from "@/lib/data/sucursales";
import { formatARS } from "@/lib/utils";
import { sumarDiasYmd } from "@/lib/fecha-ar";
import { parseReporteFiltros, type ReporteFiltrosInput } from "../_filters";
import { ReporteFiltroForm } from "../_filter-form";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<ReporteFiltrosInput>;
}

/** Los productos de reventa no tienen rubro de servicio; van en su propia fila. */
const RUBRO_REVENTA = "Reventa de productos";

/**
 * Qué vende cada sucursal, por rubro.
 *
 * La comparación útil entre sucursales NO es en pesos: Yerba Buena tiene 237
 * servicios y Centro 61, así que cualquier rubro va a dar más grande en YB y eso
 * no dice nada. Lo que se compara es la MEZCLA — qué parte de lo que factura
 * cada una viene de cada rubro. Ahí sí aparece algo accionable: "en Centro las
 * uñas son el 40% y en Yerba Buena el 15%".
 *
 * Por eso cada sucursal muestra su peso y su porcentaje sobre SU propio total, y
 * la comparación se lee en la columna de porcentajes, no en la de plata.
 */
export default async function ReportesRubrosPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerReportes) redirect("/dashboard");

  const sp = await searchParams;
  const filtros = parseReporteFiltros(sp, scope);

  // Período anterior de la misma duración, pegado al actual: es la referencia
  // que hace que un número signifique algo. "$400.000 en nails" no dice nada
  // solo; "$400.000, y el mes pasado fueron $250.000" sí.
  const dias =
    Math.round(
      (new Date(`${filtros.hasta}T12:00:00Z`).getTime() -
        new Date(`${filtros.desde}T12:00:00Z`).getTime()) /
        86400000,
    ) + 1;
  const previoHasta = sumarDiasYmd(filtros.desde, -1);
  const previoDesde = sumarDiasYmd(previoHasta, -(dias - 1));

  const [sucursalesAll, actual, previo] = await Promise.all([
    listSucursales({ soloActivas: true }),
    listIngresos({
      sucursalId: filtros.sucursalId,
      desde: filtros.desdeIso,
      hasta: filtros.hastaIso,
    }),
    listIngresos({
      sucursalId: filtros.sucursalId,
      desde: `${previoDesde}T00:00:00.000`,
      hasta: `${previoHasta}T23:59:59.999`,
    }),
  ]);

  const sucursales = sucursalesAll.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );
  const visibles = filtros.sucursalId
    ? sucursales.filter((s) => s.id === filtros.sucursalId)
    : sucursales;

  /** { rubro -> { sucursalId -> {monto, cantidad} } } */
  function agrupar(rows: Awaited<ReturnType<typeof listIngresos>>) {
    const porRubro = new Map<string, Map<string, { monto: number; n: number }>>();
    const totalPorSucursal = new Map<string, number>();
    for (const row of rows) {
      if (row.ingreso.anulado) continue;
      const suc = row.ingreso.sucursal_id;
      for (const l of row.lineas) {
        const rubro = l.servicio?.rubro ?? (l.insumo ? RUBRO_REVENTA : null);
        if (!rubro) continue;
        const dentro = porRubro.get(rubro) ?? new Map();
        const cur = dentro.get(suc) ?? { monto: 0, n: 0 };
        cur.monto += l.subtotal;
        cur.n += l.cantidad;
        dentro.set(suc, cur);
        porRubro.set(rubro, dentro);
        totalPorSucursal.set(suc, (totalPorSucursal.get(suc) ?? 0) + l.subtotal);
      }
    }
    return { porRubro, totalPorSucursal };
  }

  const hoy = agrupar(actual);
  const antes = agrupar(previo);

  const totalGeneral = [...hoy.totalPorSucursal.values()].reduce((a, b) => a + b, 0);
  const totalGeneralAntes = [...antes.totalPorSucursal.values()].reduce(
    (a, b) => a + b,
    0,
  );

  const filas = [...hoy.porRubro.entries()]
    .map(([rubro, porSuc]) => {
      const total = [...porSuc.values()].reduce((a, v) => a + v.monto, 0);
      const totalAntes = [...(antes.porRubro.get(rubro)?.values() ?? [])].reduce(
        (a, v) => a + v.monto,
        0,
      );
      return { rubro, porSuc, total, totalAntes };
    })
    .sort((a, b) => b.total - a.total);

  const pctDe = (n: number, sobre: number) =>
    sobre > 0 ? `${((n / sobre) * 100).toFixed(1)}%` : "—";

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Qué vende cada sucursal
        </h1>
        <p className="text-sm text-muted-foreground">
          Facturación por rubro. La comparación entre sucursales se lee en los
          porcentajes, no en los pesos: cada una factura distinto en total.
        </p>
      </header>

      <ReporteFiltroForm
        action="/reportes/rubros"
        filtros={filtros}
        sucursales={sucursales}
        mostrarSucursal
      />

      {visibles.length === 1 && scope.sucursalIdsPermitidas.length === 1 && (
        <p className="rounded-md border border-border bg-cream/40 p-4 text-sm text-muted-foreground">
          Tu usuario ve sólo {visibles[0]?.nombre}. Para comparar las dos
          sucursales lado a lado hace falta un usuario con acceso a las dos.
        </p>
      )}

      {filas.length === 0 ? (
        <p className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No hay ventas en el período.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-cream/50 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Rubro</th>
                {visibles.map((s) => (
                  <th
                    key={s.id}
                    className="px-4 py-3 text-right font-medium"
                    colSpan={2}
                  >
                    {s.nombre.replace("Malala ", "")}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium w-32">Total</th>
                <th className="px-4 py-3 text-right font-medium w-28">
                  vs. anterior
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((f) => (
                <tr key={f.rubro} className="hover:bg-cream/30">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{f.rubro}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {[...f.porSuc.values()].reduce((a, v) => a + v.n, 0)}{" "}
                      prestaciones
                    </p>
                  </td>
                  {visibles.map((s) => {
                    const v = f.porSuc.get(s.id);
                    const totalSuc = hoy.totalPorSucursal.get(s.id) ?? 0;
                    return [
                      <td
                        key={`${s.id}-m`}
                        className="px-2 py-2.5 text-right tabular-nums"
                      >
                        {v ? formatARS(v.monto) : "—"}
                      </td>,
                      // El porcentaje es sobre el total de ESA sucursal: es lo
                      // único comparable entre una sede grande y una chica.
                      <td
                        key={`${s.id}-p`}
                        className="px-2 py-2.5 text-right tabular-nums text-xs text-muted-foreground"
                      >
                        {v ? pctDe(v.monto, totalSuc) : ""}
                      </td>,
                    ];
                  })}
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                    {formatARS(f.total)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                    <Variacion actual={f.total} previo={f.totalAntes} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-cream/40 text-sm">
              <tr>
                <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Total
                </td>
                {visibles.map((s) => [
                  <td
                    key={`${s.id}-tm`}
                    className="px-2 py-3 text-right tabular-nums font-medium"
                  >
                    {formatARS(hoy.totalPorSucursal.get(s.id) ?? 0)}
                  </td>,
                  <td
                    key={`${s.id}-tp`}
                    className="px-2 py-3 text-right tabular-nums text-xs text-muted-foreground"
                  >
                    {pctDe(hoy.totalPorSucursal.get(s.id) ?? 0, totalGeneral)}
                  </td>,
                ])}
                <td className="px-4 py-3 text-right tabular-nums font-display text-lg">
                  {formatARS(totalGeneral)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-xs">
                  <Variacion actual={totalGeneral} previo={totalGeneralAntes} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        &quot;vs. anterior&quot; compara contra los {dias} días previos ({previoDesde} al{" "}
        {previoHasta}), para que la referencia sea del mismo largo que el período
        elegido. Se mide sobre el precio de cada línea, sin el descuento del
        ticket: es lo que se vendió de cada rubro, no lo que entró en caja.
      </p>
    </div>
  );
}

function Variacion({ actual, previo }: { actual: number; previo: number }) {
  // Sin período anterior no hay variación que mostrar. Poner "+100%" cuando
  // antes no se vendía nada es ruido: todo rubro nuevo daría infinito.
  if (previo <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const pct = ((actual - previo) / previo) * 100;
  const signo = pct > 0 ? "+" : "";
  return (
    <span
      style={{
        color:
          Math.abs(pct) < 1
            ? "var(--muted-foreground)"
            : pct > 0
              ? "var(--sage-700)"
              : "var(--danger)",
      }}
    >
      {signo}
      {pct.toFixed(0)}%
    </span>
  );
}
