import Link from "next/link";
import { listMovimientos } from "@/lib/data/stock";
import { formatARS, formatDateTime } from "@/lib/utils";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { finDeDiaArISO, inicioDeDiaArISO } from "@/lib/fecha-ar";
import type { TipoMovimientoStock } from "@/lib/types";
import { UBICACION_LABEL } from "@/lib/stock-ubicacion";

const TIPO_LABEL: Record<string, string> = {
  compra: "Compra",
  venta: "Venta",
  ajuste_manual: "Ajuste manual",
  transferencia_entrada: "Transferencia ↘",
  transferencia_salida: "Transferencia ↗",
  uso_interno: "Uso interno",
  reposicion: "Reposición",
};

const TIPO_COLOR: Record<string, string> = {
  compra: "bg-sage-100 text-sage-900",
  venta: "bg-stone-100 text-stone-700",
  ajuste_manual: "bg-cream text-stone-700",
  transferencia_entrada: "bg-sage-50 text-sage-900",
  transferencia_salida: "bg-cream text-stone-700",
  // Distinto del ajuste a propósito: un retiro para el salón no es un faltante.
  uso_interno: "bg-warning/15 text-brown-700",
  reposicion: "bg-sage-50 text-sage-900",
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

interface SearchParams {
  tipo?: string;
  desde?: string;
  hasta?: string;
}

/**
 * Bitácora de stock, filtrable por tipo y fechas.
 *
 * El filtro nació para el control rápido ante una pérdida: "Uso interno" de
 * este mes dice qué se sacó de la góndola, cuándo y quién, sin buscarlo entre
 * las ventas y las compras.
 */
export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireUser();
  const sucursal = await getActiveSucursal();
  if (!sucursal) return null;

  const sp = await searchParams;
  const tipo =
    sp.tipo && Object.hasOwn(TIPO_LABEL, sp.tipo)
      ? (sp.tipo as TipoMovimientoStock)
      : undefined;
  const desde = sp.desde && YMD.test(sp.desde) ? sp.desde : undefined;
  const hasta = sp.hasta && YMD.test(sp.hasta) ? sp.hasta : undefined;
  const filtrado = Boolean(tipo || desde || hasta);

  // Con un rango de fechas se quiere ver el período entero, no los últimos 200.
  const movs = await listMovimientos({
    sucursalId: sucursal.id,
    tipo,
    desde: desde ? inicioDeDiaArISO(desde) : undefined,
    hasta: hasta ? finDeDiaArISO(hasta) : undefined,
    limit: desde || hasta ? 2000 : 200,
  });

  const costoUsoInterno =
    tipo === "uso_interno"
      ? movs.reduce((acc, m) => acc + -m.cantidad * (m.costo_unitario ?? 0), 0)
      : 0;

  return (
    <div className="space-y-8 max-w-6xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Movimientos
        </h1>
        <p className="text-sm text-muted-foreground">
          {sucursal.nombre} ·{" "}
          {filtrado
            ? `${movs.length} movimientos`
            : `últimos ${movs.length} movimientos`}
          {tipo === "uso_interno" &&
            movs.length > 0 &&
            ` · ${formatARS(costoUsoInterno)} a costo`}
        </p>
      </header>

      <form
        action="/stock/movimientos"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-[1.5rem] border border-border bg-card p-4"
      >
        <label className="space-y-1.5 text-sm">
          <span className="block text-xs uppercase tracking-wider text-muted-foreground">
            Tipo
          </span>
          <select
            name="tipo"
            defaultValue={tipo ?? ""}
            className="rounded-xl border border-border bg-card px-3 py-2"
          >
            <option value="">Todos</option>
            {Object.entries(TIPO_LABEL).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="block text-xs uppercase tracking-wider text-muted-foreground">
            Desde
          </span>
          <input
            type="date"
            name="desde"
            defaultValue={desde}
            className="rounded-xl border border-border bg-card px-3 py-2"
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="block text-xs uppercase tracking-wider text-muted-foreground">
            Hasta
          </span>
          <input
            type="date"
            name="hasta"
            defaultValue={hasta}
            className="rounded-xl border border-border bg-card px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground"
        >
          Ver
        </button>
        {filtrado && (
          <Link
            href="/stock/movimientos"
            className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            Limpiar
          </Link>
        )}
      </form>

      {movs.length === 0 ? (
        <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
          {filtrado
            ? "No hay movimientos con esos filtros."
            : "No hay movimientos registrados todavía."}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Fecha</th>
                <th className="text-left font-medium px-4 py-3">Tipo</th>
                <th className="text-left font-medium px-4 py-3">Insumo</th>
                <th className="text-right font-medium px-4 py-3">Cantidad</th>
                <th className="text-left font-medium px-4 py-3">Motivo</th>
                <th className="text-left font-medium px-4 py-3">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movs.map((m) => (
                <tr key={m.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {formatDateTime(m.fecha)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${TIPO_COLOR[m.tipo] ?? ""}`}
                    >
                      {TIPO_LABEL[m.tipo] ?? m.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{m.insumo_nombre}</td>
                  {m.tipo === "reposicion" ? (
                    // No entra ni sale: pasa del depósito a la góndola.
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-muted-foreground">
                      {m.cantidad.toLocaleString("es-AR")}
                      <span className="block text-[11px] font-normal">
                        depósito → exhibición
                      </span>
                    </td>
                  ) : (
                    <td
                      className="px-4 py-3 text-right tabular-nums font-medium"
                      style={{
                        color:
                          m.cantidad < 0 ? "var(--danger)" : "var(--sage-700)",
                      }}
                    >
                      {m.cantidad > 0 ? "+" : ""}
                      {m.cantidad.toLocaleString("es-AR")}
                      {m.ubicacion && (
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {UBICACION_LABEL[m.ubicacion].toLowerCase()}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.motivo ?? "—"}
                    {m.tipo === "uso_interno" && (
                      <span className="block text-xs">
                        {m.empleado_nombre ? `Retiró ${m.empleado_nombre}` : null}
                        {m.empleado_nombre && m.costo_unitario != null ? " · " : null}
                        {m.costo_unitario != null
                          ? `${formatARS(-m.cantidad * m.costo_unitario)} a costo`
                          : null}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.usuario_nombre}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
