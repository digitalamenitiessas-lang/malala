import Link from "next/link";
import { Plus } from "lucide-react";
import { TableActionLink } from "@/components/table-action-link";
import { redirect } from "next/navigation";
import { buildAccessScope, clampSucursalId } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { getProyeccionSemanal, listLiquidaciones } from "@/lib/data/liquidaciones";
import { hoyAr, sumarDiasYmd } from "@/lib/fecha-ar";
import { ProyeccionSemanal } from "./proyeccion-semanal";
import { CargarViaticosButton } from "./cargar-viaticos-button";
import { listSucursales } from "@/lib/data/sucursales";
import { formatARS } from "@/lib/utils";
import type { LiquidacionEstado } from "@/lib/types";

interface SearchParams {
  sucursal?: string;
  estado?: string;
}

function formatYMD(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

const ESTADO_LABEL: Record<LiquidacionEstado, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  anulada: "Anulada",
};

export default async function LiquidacionesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja) redirect("/dashboard");

  const sp = await searchParams;
  const sucursales = await listSucursales({ soloActivas: true });
  const sucursalesPermitidas = sucursales.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );
  const sucursalId = clampSucursalId(scope, sp.sucursal);
  const sucursal = sucursalesPermitidas.find((s) => s.id === sucursalId) ?? null;
  if (!sucursal) redirect("/dashboard");

  const estadoFiltro =
    sp.estado === "pendiente" || sp.estado === "pagada" || sp.estado === "anulada"
      ? (sp.estado as LiquidacionEstado)
      : undefined;

  const items = await listLiquidaciones({
    sucursalId: sucursal.id,
    estado: estadoFiltro,
    limit: 100,
  });

  // La semana que termina hoy: si se liquida el día de pago, eso es su semana
  // (Centro los viernes, YB los sábados). Mismo criterio que el período que
  // propone la nueva liquidación.
  const hoy = hoyAr();
  const proyeccion = await getProyeccionSemanal({
    sucursalId: sucursal.id,
    desde: sumarDiasYmd(hoy, -6),
    hasta: hoy,
  });

  return (
    <div className="space-y-8 max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Liquidaciones
          </h1>
          <p className="text-sm text-muted-foreground">
            {sucursal.nombre} · Comisiones por período y pago a empleados
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {scope.puedeVerGlobal ? (
            <form action="/liquidaciones" method="get" className="flex items-center gap-2">
              <select
                name="sucursal"
                defaultValue={sucursal.id}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                {sucursalesPermitidas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              <select
                name="estado"
                defaultValue={estadoFiltro ?? ""}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="pendiente">Pendientes</option>
                <option value="pagada">Pagadas</option>
                <option value="anulada">Anuladas</option>
              </select>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-2 text-xs uppercase tracking-wider transition-colors hover:bg-cream"
              >
                Ver
              </button>
            </form>
          ) : null}

          <Link
            href={`/liquidaciones/nueva?sucursal=${sucursal.id}`}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
          >
            <Plus className="h-4 w-4 stroke-[1.5]" />
            Nueva liquidación
          </Link>
        </div>
      </header>
n      <div className="flex flex-wrap items-center justify-between gap-3">
        <CargarViaticosButton
          sucursalId={sucursal.id}
          desde={sumarDiasYmd(hoy, -6)}
          hasta={hoy}
        />
      </div>

      <ProyeccionSemanal data={proyeccion} />

      {items.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Todavía no hay liquidaciones registradas
          {estadoFiltro ? ` con estado "${ESTADO_LABEL[estadoFiltro]}"` : ""}.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Empleado</th>
                <th className="px-4 py-3 text-left font-medium">Período</th>
                <th className="px-4 py-3 text-right font-medium">Servicios</th>
                <th className="px-4 py-3 text-right font-medium">Días</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="w-24 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => {
                const est = item.liquidacion.estado;
                return (
                  <tr key={item.liquidacion.id} className="hover:bg-cream/30">
                    <td className="px-4 py-3 font-medium">{item.empleado_nombre}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {formatYMD(item.liquidacion.periodo_desde)} –{" "}
                      {formatYMD(item.liquidacion.periodo_hasta)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.liquidacion.total_servicios}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.liquidacion.dias_trabajados}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatARS(item.liquidacion.total_pagar)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs uppercase tracking-wider"
                        style={{
                          backgroundColor:
                            est === "pagada"
                              ? "rgb(82 116 79 / 0.12)"
                              : est === "pendiente"
                                ? "rgb(201 169 97 / 0.15)"
                                : "rgb(180 0 0 / 0.08)",
                          color:
                            est === "pagada"
                              ? "var(--sage-700)"
                              : est === "pendiente"
                                ? "var(--warning)"
                                : "var(--danger)",
                        }}
                      >
                        {ESTADO_LABEL[est]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TableActionLink
                        href={`/liquidaciones/${item.liquidacion.id}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
