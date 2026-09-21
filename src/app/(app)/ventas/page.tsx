import { buildAccessScope } from "@/lib/auth/access";
import Link from "next/link";
import { TableActionLink } from "@/components/table-action-link";
import { Plus } from "lucide-react";
import { inicioDeDiaArISO } from "@/lib/fecha-ar";
import { listIngresos } from "@/lib/data/ingresos";
import {
  aggregate,
  comisionesPorEmpleado,
} from "@/lib/data/ingresos-helpers";
import { listEmpleados } from "@/lib/data/empleados";
import { listClientes } from "@/lib/data/clientes";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { formatARS, formatDayTime } from "@/lib/utils";

interface SearchParams {
  rango?: "hoy" | "semana" | "mes" | "todo";
  empleado?: string;
  cliente?: string;
  revision?: "ok" | "error" | "sin";
  anuladas?: string;
}

const RANGOS: Array<{ value: NonNullable<SearchParams["rango"]>; label: string }> = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Últimos 7 días" },
  { value: "mes", label: "Últimos 30 días" },
  { value: "todo", label: "Todo" },
];

function rangoToFechas(rango: NonNullable<SearchParams["rango"]>) {
  const now = new Date();
  if (rango === "hoy") {
    // Día calendario en horario de Argentina, no medianoche UTC del server.
    return { desde: inicioDeDiaArISO(), hasta: now.toISOString() };
  }
  const desde = new Date(now);
  if (rango === "semana") {
    desde.setDate(desde.getDate() - 7);
  } else if (rango === "mes") {
    desde.setDate(desde.getDate() - 30);
  } else {
    return { desde: undefined, hasta: undefined };
  }
  return { desde: desde.toISOString(), hasta: now.toISOString() };
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const sucursal = await getActiveSucursal();
  if (!sucursal) return null;

  const sp = await searchParams;
  const rango = sp.rango ?? "hoy";
  const { desde, hasta } = rangoToFechas(rango);

  // Si es empleado, fuerzo el filtro a sus propias ventas y oculto métricas del
  // local. Si no tiene ficha vinculada (empleado_id), no ve nada (fail-closed),
  // nunca las ventas de toda la sucursal.
  const esEmpleado = user.rol === "empleado";
  const empleadoIdForzado = esEmpleado ? user.empleado_id : sp.empleado;

  // Empleados y clientes no dependen uno del otro: van juntos. Las ventas sí
  // esperan, porque el filtro por empleada se valida contra la lista.
  const [empleados, clientes] = await Promise.all([
    listEmpleados({ sucursalId: sucursal.id }),
    listClientes({ sucursalId: sucursal.id }),
  ]);
  const empleadoIdFiltrado =
    esEmpleado || !empleadoIdForzado
      ? empleadoIdForzado
      : empleados.some((empleado) => empleado.id === empleadoIdForzado)
        ? empleadoIdForzado
        : undefined;
  const ingresos = await listIngresos({
    sucursalId: sucursal.id,
    empleadoId: empleadoIdFiltrado,
    clienteId: sp.cliente,
    desde,
    hasta,
    revision: !esEmpleado ? sp.revision : undefined,
    incluirAnulados: !esEmpleado && sp.anuladas === "1",
  });

  // Vista personal del empleado: sólo sus líneas y su comisión
  if (esEmpleado) {
    const misLineas = ingresos.flatMap((row) =>
      row.lineas
        .filter((l) => l.empleado_id === user.empleado_id)
        .map((l) => ({
          linea: l,
          ingreso: row.ingreso,
          cliente: row.cliente,
        })),
    );
    misLineas.sort((a, b) =>
      b.ingreso.fecha.localeCompare(a.ingreso.fecha),
    );
    const miTotalComision = misLineas.reduce(
      (s, x) => s + x.linea.comision_monto,
      0,
    );
    const miTotalCobrado = misLineas.reduce(
      (s, x) => s + x.linea.subtotal,
      0,
    );

    return (
      <div className="space-y-8 max-w-5xl">
        <header className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Mis ventas
          </h1>
          <p className="text-sm text-muted-foreground">
            {sucursal.nombre} ·{" "}
            {RANGOS.find((r) => r.value === rango)?.label.toLowerCase()} ·{" "}
            {misLineas.length} servicio{misLineas.length !== 1 ? "s" : ""}
          </p>
        </header>

        {/* KPIs personales */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="Servicios trabajados"
            value={String(misLineas.length)}
            hint={`En ${ingresos.length} ticket${ingresos.length !== 1 ? "s" : ""}`}
          />
          <KpiCard
            label="Facturado en tus servicios"
            value={formatARS(miTotalCobrado)}
            hint="Suma de los precios de tus líneas"
          />
          <KpiCard
            label="Tu comisión"
            value={formatARS(miTotalComision)}
            color="sage-700"
            highlight
            hint={
              miTotalCobrado > 0
                ? `${((miTotalComision / miTotalCobrado) * 100).toFixed(0)}% promedio`
                : undefined
            }
          />
        </div>

        {/* Filtro de rango (sólo) */}
        <form
          action="/ventas"
          method="get"
          className="bg-card border border-border rounded-md p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
        >
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Rango
            </label>
            <select
              name="rango"
              defaultValue={rango}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
            >
              {RANGOS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors sm:col-span-1"
          >
            Filtrar
          </button>
        </form>

        {/* Detalle de líneas trabajadas */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Detalle de tus servicios
          </h2>
          {misLineas.length === 0 ? (
            <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
              No tenés servicios cargados en el rango seleccionado.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">Fecha</th>
                    <th className="text-left font-medium px-4 py-3">Servicio</th>
                    <th className="text-left font-medium px-4 py-3">Cliente</th>
                    <th className="text-right font-medium px-4 py-3">Precio</th>
                    <th className="text-right font-medium px-4 py-3">%</th>
                    <th className="text-right font-medium px-4 py-3">
                      Tu comisión
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {misLineas.map((row) => (
                    <tr key={row.linea.id} className="hover:bg-cream/30">
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {formatDayTime(row.ingreso.fecha)}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {row.linea.servicio?.nombre ??
                          row.linea.insumo?.nombre ??
                          "—"}
                      </td>
                      <td className="px-4 py-3">
                        {row.cliente?.nombre ?? "Consumidor Final"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatARS(row.linea.subtotal)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {row.linea.comision_pct}%
                      </td>
                      <td
                        className="px-4 py-3 text-right tabular-nums font-medium"
                        style={{ color: "var(--sage-700)" }}
                      >
                        {formatARS(row.linea.comision_monto)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-cream/40 font-medium">
                    <td className="px-4 py-3" colSpan={3}>
                      Totales
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatARS(miTotalCobrado)}
                    </td>
                    <td></td>
                    <td
                      className="px-4 py-3 text-right tabular-nums"
                      style={{ color: "var(--sage-700)" }}
                    >
                      {formatARS(miTotalComision)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Estas comisiones se acumulan y se liquidan a fin de período por la
            encargada/admin.
          </p>
        </section>
      </div>
    );
  }

  // Vista admin / encargada (la original)
  const totales = aggregate(ingresos);
  const porEmpleado = comisionesPorEmpleado(ingresos);

  return (
    <div className="space-y-8 max-w-6xl">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Ingresos
          </h1>
          <p className="text-sm text-muted-foreground">
            {sucursal.nombre} ·{" "}
            {RANGOS.find((r) => r.value === rango)?.label.toLowerCase()} ·{" "}
            {totales.cantidad} ticket{totales.cantidad !== 1 ? "s" : ""}
          </p>
        </div>

        {scope.puedeCargarVentas && (
          <Link
            href="/ventas/nueva"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4 stroke-[1.5]" />
            Nueva venta
          </Link>
        )}
      </header>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total cobrado"
          value={formatARS(totales.total)}
          hint={`${totales.cantidad} ticket${totales.cantidad !== 1 ? "s" : ""}`}
        />
        <KpiCard
          label="Para el equipo"
          value={formatARS(totales.comisiones)}
          hint={
            totales.total > 0
              ? `${((totales.comisiones / totales.total) * 100).toFixed(0)}% del total`
              : "—"
          }
          color="sage-700"
        />
        <KpiCard
          label="Costo de insumos"
          value={formatARS(totales.costoInsumos)}
          hint={
            totales.total > 0
              ? `${((totales.costoInsumos / totales.total) * 100).toFixed(0)}% del total`
              : "—"
          }
        />
        <KpiCard
          label="Neto del negocio"
          value={formatARS(totales.neto)}
          hint={
            totales.total > 0
              ? `${((totales.neto / totales.total) * 100).toFixed(0)}% del total`
              : "—"
          }
          color={totales.neto >= 0 ? "sage-700" : "danger"}
          highlight
        />
      </div>

      {/* Filtros */}
      <form
        action="/ventas"
        method="get"
        className="bg-card border border-border rounded-md p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
      >
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Rango
          </label>
          <select
            name="rango"
            defaultValue={rango}
            className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
          >
            {RANGOS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Empleado
          </label>
          <select
            name="empleado"
            defaultValue={sp.empleado ?? ""}
            className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
          >
            <option value="">Todos</option>
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cliente
          </label>
          <select
            name="cliente"
            defaultValue={sp.cliente ?? ""}
            className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
          >
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Satisfacción
          </label>
          <select
            name="revision"
            defaultValue={sp.revision ?? ""}
            className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
          >
            <option value="">Todas</option>
            <option value="error">No satisfecho</option>
            <option value="ok">Satisfecho</option>
            <option value="sin">Sin dato</option>
          </select>
        </div>
        {/* Una venta anulada sale de todos los números pero tiene que poder
            encontrarse: si no, el rastro que justifica anular en vez de editar
            queda inalcanzable. */}
        {!esEmpleado && (
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              name="anuladas"
              value="1"
              defaultChecked={sp.anuladas === "1"}
              className="h-4 w-4 rounded border-border accent-sage-500"
            />
            <span>Ver anuladas</span>
          </label>
        )}
        <button
          type="submit"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors"
        >
          Filtrar
        </button>
      </form>

      {/* Comisiones por empleado (solo si hay datos) */}
      {porEmpleado.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Comisiones por empleado en el rango
          </h2>
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Empleado</th>
                  <th className="text-right font-medium px-4 py-3">Líneas</th>
                  <th className="text-right font-medium px-4 py-3">
                    Comisión acumulada
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {porEmpleado.map(({ empleado, lineas, total }) => (
                  <tr key={empleado.id} className="hover:bg-cream/30">
                    <td className="px-4 py-3 font-medium">{empleado.nombre}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {lineas}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatARS(total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Listado de tickets */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Tickets
        </h2>
        {ingresos.length === 0 ? (
          <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
            No hay ventas en el rango seleccionado.
          </div>
        ) : (
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Fecha</th>
                  <th className="text-left font-medium px-4 py-3">Cliente</th>
                  <th className="text-right font-medium px-4 py-3">Líneas</th>
                  <th className="text-right font-medium px-4 py-3">Cobrado</th>
                  <th className="text-right font-medium px-4 py-3">Equipo</th>
                  <th className="text-right font-medium px-4 py-3">Insumos</th>
                  <th className="text-right font-medium px-4 py-3">Neto</th>
                  <th className="text-center font-medium px-4 py-3">Satisfacción</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ingresos.map((row) => (
                  <tr key={row.ingreso.id} className="hover:bg-cream/30">
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {formatDayTime(row.ingreso.fecha)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {row.cliente?.nombre ?? "Consumidor Final"}
                      {row.ingreso.anulado && (
                        <span className="ml-2 rounded bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                          Anulada
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {row.lineas.length}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatARS(row.breakdown.total)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {formatARS(row.breakdown.comisiones)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {formatARS(row.breakdown.costoInsumos)}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums font-medium"
                      style={{
                        color:
                          row.breakdown.neto >= 0
                            ? "var(--sage-700)"
                            : "var(--danger)",
                      }}
                    >
                      {formatARS(row.breakdown.neto)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <SatisfaccionTag satisfecho={row.ingreso.cliente_satisfecho} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TableActionLink href={`/ventas/${row.ingreso.id}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SatisfaccionTag({ satisfecho }: { satisfecho?: boolean }) {
  if (satisfecho === true) {
    return (
      <span className="text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-sage-100 text-sage-800">
        Satisfecho
      </span>
    );
  }
  if (satisfecho === false) {
    return (
      <span
        className="text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded"
        style={{ backgroundColor: "rgb(201 169 97 / 0.18)", color: "var(--danger)" }}
      >
        No satisfecho
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function KpiCard({
  label,
  value,
  hint,
  color,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: "sage-700" | "danger";
  highlight?: boolean;
}) {
  const valueStyle =
    color === "sage-700"
      ? { color: "var(--sage-700)" }
      : color === "danger"
        ? { color: "var(--danger)" }
        : undefined;
  return (
    <div
      className={`bg-card border rounded-md p-5 ${highlight ? "border-sage-300" : "border-border"}`}
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className="font-display text-2xl mt-2 tabular-nums"
        style={valueStyle}
      >
        {value}
      </p>
      {hint && (
        <p className="text-xs text-muted-foreground mt-1 tabular-nums">{hint}</p>
      )}
    </div>
  );
}
