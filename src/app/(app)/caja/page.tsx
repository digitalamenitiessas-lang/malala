import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { CierresAnteriores } from "./cierres-anteriores";
import { DesgloseCaja } from "./desglose-caja";
import { redirect } from "next/navigation";
import { clampSucursalId, getAccessScopeForUser } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { hoyAr } from "@/lib/fecha-ar";
import {
  getCajasPendientesDeCierre,
  getCierreDeFecha,
  getEstadoCajaDelDia,
  getResumenDelDia,
  listCierres,
} from "@/lib/data/caja";
import { getAperturaDeFecha } from "@/lib/data/apertura-caja";
import { listSucursales } from "@/lib/data/sucursales";
import {
  getDeudoresCc,
  getSaldosAFavorCc,
} from "@/lib/data/cuenta-corriente";
import { formatARS, formatLongDate } from "@/lib/utils";

function formatYMD(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface SearchParams {
  sucursal?: string;
}

function todayYMD(): string {
  return hoyAr();
}

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const scope = getAccessScopeForUser(user);
  const sp = await searchParams;

  if (!scope?.puedeVerCaja) {
    redirect("/dashboard");
  }

  const sucursales = await listSucursales({ soloActivas: true });

  const sucursalId = clampSucursalId(scope, sp.sucursal);
  const sucursal =
    sucursales.find((item) => item.id === sucursalId) ??
    sucursales.find((item) => scope.sucursalIdsPermitidas.includes(item.id)) ??
    null;

  if (!sucursal) {
    redirect("/dashboard");
  }

  const hoy = todayYMD();
  const puedeCerrar = user.rol === "admin" || user.rol === "encargada";

  // Aperturas y cierres son 100% manuales: no se autocierra ningún día. Los días
  // abiertos sin cerrar quedan como pendientes hasta que se cierren a mano.

  // Todas estas consultas son independientes entre sí: sólo dependen de la
  // sucursal y la fecha, que ya están resueltas. En fila, cada una pagaba su
  // propia ida y vuelta a la base y la pantalla sumaba las ocho esperas. En
  // paralelo se paga una sola.
  const [
    resumen,
    estado,
    cierres,
    cierreHoy,
    aperturaHoy,
    pendientesDeCierre,
    deudores,
    aFavor,
  ] = await Promise.all([
    getResumenDelDia(sucursal.id, hoy),
    getEstadoCajaDelDia(sucursal.id, hoy),
    listCierres({ sucursalId: sucursal.id, limit: 30 }),
    getCierreDeFecha(sucursal.id, hoy),
    getAperturaDeFecha(sucursal.id, hoy),
    puedeCerrar ? getCajasPendientesDeCierre(sucursal.id) : Promise.resolve([]),
    getDeudoresCc(),
    getSaldosAFavorCc(),
  ]);

  const totalInicial = estado.reduce((s, r) => s + r.saldoInicial, 0);
  const totalIngresos = estado.reduce((s, r) => s + r.ingresos, 0);
  const totalEgresos = estado.reduce((s, r) => s + r.egresos, 0);
  const totalEsperado = estado.reduce((s, r) => s + r.saldoEsperado, 0);
  const totalDeuda = deudores.reduce((sum, d) => sum + d.saldo, 0);
  const totalAFavor = aFavor.reduce((sum, c) => sum + c.a_favor, 0);

  return (
    <div className="space-y-8 max-w-6xl">
      {pendientesDeCierre.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-brown-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 stroke-[1.5] text-warning" />
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {pendientesDeCierre.length === 1
                  ? "Quedó una caja sin cerrar"
                  : `Quedaron ${pendientesDeCierre.length} cajas sin cerrar`}
              </p>
              <p className="text-xs text-brown-700">
                Cerrá la caja de cada día antes de seguir operando, así el
                control de efectivo no se mezcla entre jornadas.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {pendientesDeCierre.map((fecha) => (
                  <Link
                    key={fecha}
                    href={`/caja/nuevo?fecha=${fecha}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-warning px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-brown-900 transition-colors hover:bg-warning/90"
                  >
                    Cerrar caja del {formatYMD(fecha)}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {puedeCerrar && !aperturaHoy && !cierreHoy && (
        <div className="rounded-md border border-sage-300 bg-sage-50 p-4 text-sage-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-medium">Todavía no abriste la caja de hoy.</span>{" "}
              Cargá con cuánta plata arrancás en cada cuenta para empezar a
              manejarte con ese saldo.
            </p>
            <Link
              href="/caja/apertura"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-sage-700 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-white transition-colors hover:bg-sage-800"
            >
              Abrir caja
            </Link>
          </div>
        </div>
      )}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {capitalize(formatLongDate(hoy))} · {formatYMD(hoy)}
          </p>
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Caja diaria
          </h1>
          <p className="text-sm text-muted-foreground">
            {sucursal.nombre} · Movimientos y cierre del día.{" "}
            <Link href="/bancos" className="underline hover:text-foreground">
              ¿Buscás los saldos de las cuentas? →
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {scope.puedeVerGlobal ? (
            <form action="/caja" method="get" className="flex items-center gap-2">
              <select
                name="sucursal"
                defaultValue={sucursal.id}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                {sucursales
                  .filter((item) => scope.sucursalIdsPermitidas.includes(item.id))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-2 text-xs uppercase tracking-wider transition-colors hover:bg-cream"
              >
                Ver
              </button>
            </form>
          ) : null}

          {puedeCerrar && !cierreHoy ? (
            <Link
              href="/caja/apertura"
              className={
                aperturaHoy
                  ? "rounded-md border border-border px-4 py-2 text-sm font-medium uppercase tracking-wider transition-colors hover:bg-cream"
                  : "flex items-center gap-2 rounded-md bg-sage-700 px-4 py-2 text-sm font-medium uppercase tracking-wider text-white transition-colors hover:bg-sage-800"
              }
            >
              {aperturaHoy ? "Ver apertura" : "Abrir caja"}
            </Link>
          ) : null}

          {puedeCerrar && aperturaHoy && !cierreHoy ? (
            <Link
              href="/caja/nuevo"
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
            >
              <Plus className="h-4 w-4 stroke-[1.5]" />
              Cerrar caja de hoy
            </Link>
          ) : null}

          {cierreHoy ? (
            <Link
              href={`/caja/${cierreHoy.id}`}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium uppercase tracking-wider transition-colors hover:bg-cream"
            >
              Ver cierre de hoy
            </Link>
          ) : null}
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Estado de caja de hoy · por cuenta
          </h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatYMD(hoy)}
          </span>
        </div>
        {estado.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No hay cuentas cargadas en esta sucursal.
          </div>
        ) : (
          <>
            {/* Saldo esperado por cuenta = saldo inicial (apertura) + ingresos −
                egresos del día. Es la plata que debería haber ahora en cada cuenta. */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {estado.map((row) => (
                <Kpi
                  key={row.cuenta.id}
                  label={`${row.cuenta.nombre} · esperado`}
                  value={formatARS(row.saldoEsperado)}
                />
              ))}
            </div>
            <div className="overflow-hidden rounded-md border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Cuenta</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Saldo inicial
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Ingresos</th>
                    <th className="px-4 py-3 text-right font-medium">Egresos</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Saldo esperado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {estado.map((row) => (
                    <tr key={row.cuenta.id}>
                      <td className="px-4 py-3 font-medium">
                        {row.cuenta.nombre}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({row.cuenta.tipo})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatARS(row.saldoInicial)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatARS(row.ingresos)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatARS(row.egresos)}
                      </td>
                      <td
                        className="px-4 py-3 text-right font-medium tabular-nums"
                        style={{
                          color:
                            row.saldoEsperado >= 0
                              ? "var(--ink)"
                              : "var(--danger)",
                        }}
                      >
                        {formatARS(row.saldoEsperado)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-cream/40 font-medium">
                    <td className="px-4 py-3">Totales</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatARS(totalInicial)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatARS(totalIngresos)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatARS(totalEgresos)}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums"
                      style={{
                        color:
                          totalEsperado >= 0
                            ? "var(--sage-700)"
                            : "var(--danger)",
                      }}
                    >
                      {formatARS(totalEsperado)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          {resumen.cantIngresos} ticket{resumen.cantIngresos !== 1 ? "s" : ""} ·{" "}
          {resumen.cantEgresos} egreso{resumen.cantEgresos !== 1 ? "s" : ""} hoy.
        </p>
      </section>

      {/* Desglose de la jornada en curso (mismo componente que las cajas
          cerradas). Rentabilidad y comisiones solo para admin. */}
      {(resumen.cantIngresos > 0 || resumen.cantEgresos > 0) && (
        <DesgloseCaja resumen={resumen} isAdmin={user.rol === "admin"} />
      )}

      {resumen.fiado.total > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Fiado del día · cuenta corriente
          </h2>
          <div className="rounded-md border border-warning/40 bg-warning/10 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-2xl tabular-nums text-warning">
                {formatARS(resumen.fiado.total)}
              </p>
              <p className="text-xs uppercase tracking-wider text-brown-700">
                No entró a caja · {resumen.fiado.cantidad} venta
                {resumen.fiado.cantidad !== 1 ? "s" : ""} fiada
                {resumen.fiado.cantidad !== 1 ? "s" : ""}
              </p>
            </div>
            <ul className="mt-3 divide-y divide-warning/30 border-t border-warning/30">
              {resumen.fiado.porCliente.map((row, i) => (
                <li
                  key={row.cliente?.id ?? `sin-cliente-${i}`}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="text-brown-900">
                    {row.cliente?.nombre ?? "Sin cliente"}
                  </span>
                  <span className="tabular-nums text-brown-900">
                    {formatARS(row.monto)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-warning">
              Queda como deuda del cliente. Se cobra desde su cuenta corriente.
            </p>
          </div>
        </section>
      )}

      {deudores.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              Deudas pendientes · cuenta corriente
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {deudores.length} cliente{deudores.length !== 1 ? "s" : ""} · total{" "}
              <strong className="text-warning">{formatARS(totalDeuda)}</strong>
            </span>
          </div>
          <div className="overflow-hidden rounded-md border border-warning/40 bg-card">
            <table className="w-full text-sm">
              <thead className="bg-warning/10 text-xs uppercase tracking-wider text-brown-700">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Cliente</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Último concepto
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Debe</th>
                  <th className="w-24 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {deudores.map((d) => (
                  <tr key={d.cliente_id} className="hover:bg-warning/5">
                    <td className="px-4 py-3 font-medium">{d.nombre}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.ultimo_concepto ?? "—"}
                      {d.ultima_fecha && (
                        <span className="ml-1 text-xs tabular-nums">
                          ({formatYMD(d.ultima_fecha.slice(0, 10))})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-warning">
                      {formatARS(d.saldo)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/catalogos/clientes/${d.cliente_id}`}
                        className="inline-flex items-center rounded-md bg-warning px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-brown-900 transition-colors hover:bg-warning/90"
                      >
                        Saldar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {aFavor.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              Saldo a favor · clientas con plata a cuenta
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {aFavor.length} cliente{aFavor.length !== 1 ? "s" : ""} · total{" "}
              <strong className="text-sage-700">{formatARS(totalAFavor)}</strong>
            </span>
          </div>
          <div className="overflow-hidden rounded-md border border-sage-300 bg-card">
            <table className="w-full text-sm">
              <thead className="bg-sage-50 text-xs uppercase tracking-wider text-sage-900">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Cliente</th>
                  <th className="px-4 py-3 text-right font-medium">A favor</th>
                  <th className="w-24 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {aFavor.map((c) => (
                  <tr key={c.cliente_id} className="hover:bg-sage-50/50">
                    <td className="px-4 py-3 font-medium">{c.nombre}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-sage-700">
                      {formatARS(c.a_favor)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/catalogos/clientes/${c.cliente_id}`}
                        className="inline-flex items-center rounded-md border border-sage-700 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-sage-700 transition-colors hover:bg-sage-50"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Esa plata ya está en la caja: se les descuenta cobrando la próxima
            venta con el medio “CC”.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Cierres anteriores
        </h2>
        {cierres.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Todavia no hay cierres registrados.
          </div>
        ) : (
          <CierresAnteriores
            cierres={cierres.map((item) => ({
              id: item.cierre.id,
              fecha: item.cierre.fecha,
              cerradoPor: item.cerrado_por_nombre,
              totalDelDia:
                item.cierre.ingresos_ef +
                item.cierre.ingresos_banc +
                item.cierre.cobros_tc +
                item.cierre.cobros_td,
            }))}
          />
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl tabular-nums">{value}</p>
    </div>
  );
}
