import { TableActionLink } from "@/components/table-action-link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import {
  getAuditTimeline,
  type AuditEventType,
} from "@/lib/data/auditoria";
import {
  aggregateAudit,
  TIPO_LABELS,
} from "@/lib/data/auditoria-helpers";
import { listSucursales } from "@/lib/data/sucursales";
import { listUsuariosApp } from "@/lib/data/usuarios";
import { formatARS, formatDateTime } from "@/lib/utils";
import { getAnalyticsSnapshot } from "@/lib/data/analytics";

interface SearchParams {
  rango?: "hoy" | "semana" | "mes" | "todo";
  desde?: string; // YYYY-MM-DD (tiene prioridad sobre rango)
  hasta?: string; // YYYY-MM-DD
  tipo?: string;
  usuario?: string;
  sucursal?: string;
  q?: string;
}

const RANGOS: Array<{ value: NonNullable<SearchParams["rango"]>; label: string }> = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Últimos 7 días" },
  { value: "mes", label: "Últimos 30 días" },
  { value: "todo", label: "Todo" },
];

function rangoToFechas(rango: NonNullable<SearchParams["rango"]>) {
  const now = new Date();
  const desde = new Date(now);
  if (rango === "hoy") desde.setHours(0, 0, 0, 0);
  else if (rango === "semana") desde.setDate(desde.getDate() - 7);
  else if (rango === "mes") desde.setDate(desde.getDate() - 30);
  else return { desde: undefined, hasta: undefined };
  return { desde: desde.toISOString(), hasta: now.toISOString() };
}

const ALL_TIPOS: AuditEventType[] = [
  "venta",
  "egreso",
  "liquidacion",
  "anticipo",
  "cc_cargo",
  "cc_pago",
  "cierre",
  "stock_compra",
  "stock_venta",
  "stock_ajuste",
  "stock_transferencia",
];

const TIPO_COLORS: Record<AuditEventType, string> = {
  venta: "var(--sage-700)",
  egreso: "var(--ink)",
  liquidacion: "var(--ink)",
  anticipo: "var(--ink)",
  cc_cargo: "var(--danger)",
  cc_pago: "var(--sage-700)",
  cierre: "var(--sage-700)",
  stock_compra: "var(--ink)",
  stock_venta: "var(--ink)",
  stock_ajuste: "var(--danger)",
  stock_transferencia: "var(--ink)",
};

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  // Verify the user has reportes scope; otherwise bounce to dashboard.
  const analytics = await getAnalyticsSnapshot({});
  if (!analytics.scope.puedeVerReportes) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const usaFechasCustom = !!(sp.desde || sp.hasta);
  const rango = sp.rango ?? "hoy";
  const { desde, hasta } = usaFechasCustom
    ? { desde: sp.desde || undefined, hasta: sp.hasta || undefined }
    : rangoToFechas(rango);
  const tipos = sp.tipo
    ? [sp.tipo as AuditEventType].filter((t) => ALL_TIPOS.includes(t))
    : undefined;

  const events = await getAuditTimeline({
    desde,
    hasta,
    tipos,
    usuarioId: sp.usuario || undefined,
    sucursalId: sp.sucursal || undefined,
    search: sp.q || undefined,
    limit: 500,
  });

  const agg = aggregateAudit(events);
  const [sucursales, usuarios] = await Promise.all([
    listSucursales(),
    listUsuariosApp({
      sucursalIds: analytics.scope.puedeVerGlobal
        ? undefined
        : analytics.scope.sucursalIdsPermitidas,
    }),
  ]);

  // Totales monetarios para trazabilidad rápida
  const totalIngresos = events
    .filter((e) => e.tipo === "venta")
    .reduce((acc, e) => acc + (e.monto ?? 0), 0);
  const totalEgresos = events
    .filter((e) => e.tipo === "egreso")
    .reduce((acc, e) => acc + (e.monto ?? 0), 0);

  return (
    <div className="space-y-8 max-w-6xl">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
          Trazabilidad
        </p>
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Reportes · Auditoría
        </h1>
        <p className="text-sm text-muted-foreground">
          Línea de tiempo de cada movimiento operativo: quién lo hizo, cuándo, en
          qué sucursal y por qué monto. {agg.total} evento
          {agg.total !== 1 ? "s" : ""} ·{" "}
          {usaFechasCustom
            ? `${sp.desde ?? "inicio"} → ${sp.hasta ?? "hoy"}`
            : RANGOS.find((r) => r.value === rango)?.label.toLowerCase()}
          {user.rol !== "admin" ? " · vista limitada" : ""}
        </p>
      </header>

      {/* KPIs monetarios */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-md p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Ingresos del período
          </p>
          <p className="font-display text-2xl mt-1 tabular-nums text-sage-700">
            {formatARS(totalIngresos)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-md p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Egresos del período
          </p>
          <p className="font-display text-2xl mt-1 tabular-nums text-ink">
            {formatARS(totalEgresos)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-md p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Neto
          </p>
          <p className="font-display text-2xl mt-1 tabular-nums">
            {formatARS(totalIngresos - totalEgresos)}
          </p>
        </div>
      </div>

      {/* KPIs por tipo */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {ALL_TIPOS.map((t) => (
          <div
            key={t}
            className="bg-card border border-border rounded-md p-3"
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">
              {TIPO_LABELS[t]}
            </p>
            <p
              className="font-display text-xl mt-1 tabular-nums"
              style={{ color: TIPO_COLORS[t] }}
            >
              {agg.porTipo[t]}
            </p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <form
        action="/reportes/auditoria"
        method="get"
        className="bg-card border border-border rounded-md p-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end"
      >
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Rango rápido
          </label>
          <select
            name="rango"
            defaultValue={usaFechasCustom ? "" : rango}
            className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
          >
            {usaFechasCustom && <option value="">— Por fechas —</option>}
            {RANGOS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Desde
          </label>
          <input
            type="date"
            name="desde"
            defaultValue={sp.desde ?? ""}
            max={sp.hasta || undefined}
            className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Hasta
          </label>
          <input
            type="date"
            name="hasta"
            defaultValue={sp.hasta ?? ""}
            min={sp.desde || undefined}
            className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Tipo
          </label>
          <select
            name="tipo"
            defaultValue={sp.tipo ?? ""}
            className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
          >
            <option value="">Todos</option>
            {ALL_TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Usuario
          </label>
          <select
            name="usuario"
            defaultValue={sp.usuario ?? ""}
            className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
          >
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} ({u.rol})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Sucursal
          </label>
          <select
            name="sucursal"
            defaultValue={sp.sucursal ?? ""}
            className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
          >
            <option value="">Todas</option>
            {sucursales
              .filter((s) =>
                analytics.scope.sucursalIdsPermitidas.includes(s.id),
              )
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Búsqueda
          </label>
          <div className="flex gap-2">
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Cliente, insumo, motivo…"
              className="flex-1 px-3 py-2 border border-border rounded-md bg-card text-sm"
            />
            <button
              type="submit"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors"
            >
              Filtrar
            </button>
          </div>
        </div>
      </form>

      {/* Resumen por usuario */}
      {agg.porUsuario.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Actividad por usuario
          </h2>
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Usuario</th>
                  <th className="text-left font-medium px-4 py-3">Rol</th>
                  <th className="text-right font-medium px-4 py-3">
                    Eventos
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agg.porUsuario.map((u) => (
                  <tr key={u.usuario}>
                    <td className="px-4 py-3 font-medium">{u.usuario}</td>
                    <td className="px-4 py-3 text-xs uppercase text-muted-foreground tracking-wider">
                      {u.rol}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {u.cantidad}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Timeline cronológico */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Línea de tiempo
        </h2>
        {events.length === 0 ? (
          <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
            Sin eventos para los filtros aplicados.
          </div>
        ) : (
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Fecha</th>
                  <th className="text-left font-medium px-4 py-3">Evento</th>
                  <th className="text-left font-medium px-4 py-3">Detalle</th>
                  <th className="text-left font-medium px-4 py-3">Usuario</th>
                  <th className="text-left font-medium px-4 py-3">Sucursal</th>
                  <th className="text-right font-medium px-4 py-3">Monto</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-cream/30">
                    <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatDateTime(e.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider"
                        style={{ color: TIPO_COLORS[e.tipo] }}
                      >
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: TIPO_COLORS[e.tipo] }}
                        />
                        {e.titulo}
                      </span>
                    </td>
                    <td className="px-4 py-3">{e.detalle}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{e.usuario_nombre}</span>
                      <span className="text-xs text-muted-foreground ml-1">
                        ({e.usuario_rol})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.sucursal_nombre}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {e.monto != null ? formatARS(e.monto) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.href && <TableActionLink href={e.href} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {events.length === 500 && (
          <p className="text-xs text-muted-foreground italic">
            Mostrando los primeros 500 eventos. Acotá el rango para ver más.
          </p>
        )}
      </section>
    </div>
  );
}
