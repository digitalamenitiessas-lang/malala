import { redirect } from "next/navigation";
import {
  createTransferencia,
  listCuentas,
  listMovimientos,
  listSaldos,
} from "@/lib/data/cuentas-bancarias";
import { listSucursales } from "@/lib/data/sucursales";
import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { CurrencyField } from "@/components/forms/field";
import { IngresoManualForm } from "@/components/forms/ingreso-manual-form";
import { AnularIngresoManual } from "@/components/forms/anular-ingreso-manual";
import { finDeDiaArISO, hoyAr, inicioDeDiaArISO } from "@/lib/fecha-ar";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function fmtMoney(n: number) {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

function fmtFecha(iso: string) {
  const d = new Date(iso);
  return formatDateTime(d);
}

const tipoLabel: Record<string, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
  transferencia_entrada: "Transf. entrada",
  transferencia_salida: "Transf. salida",
  ajuste: "Ajuste",
  impuesto: "Impuesto",
};

interface PageProps {
  searchParams: Promise<{
    cuenta?: string;
    sucursal?: string;
    desde?: string;
    hasta?: string;
  }>;
}

const ES_YMD = /^\d{4}-\d{2}-\d{2}$/;

export default async function BancosPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja) redirect("/dashboard");

  const sp = await searchParams;
  const cuentaFiltro = sp.cuenta;
  const sucursalFiltro = sp.sucursal;
  /**
   * Rango de fechas, para poder cruzar contra el extracto del banco.
   *
   * Pedido por Belén: "no nos coinciden lo que dice en cuentas en el sistema
   * con lo que realmente hay. Para poder comparar - filtrar movimientos de cada
   * una". Sin esto la pantalla mostraba los últimos 150 movimientos y no había
   * forma de aislar un mes: con Galicia de Yerba Buena en casi 400 movimientos,
   * los primeros días no se alcanzaban a ver.
   *
   * El rango se interpreta en días argentinos, no UTC: con `new Date("2026-10-12")`
   * el corte cae a las 21 h del día anterior y se cuelan los cobros de la noche
   * en el día equivocado, que es justamente lo que se está tratando de conciliar.
   */
  const desde = ES_YMD.test(sp.desde ?? "") ? sp.desde! : "";
  const hasta = ES_YMD.test(sp.hasta ?? "") ? sp.hasta! : "";
  const hayRango = Boolean(desde || hasta);

  const [saldos, cuentas, movimientos, sucursalesAll] = await Promise.all([
    listSaldos({ sucursalId: sucursalFiltro }),
    listCuentas({ soloActivas: true, sucursalId: sucursalFiltro }),
    listMovimientos({
      cuentaId: cuentaFiltro,
      sucursalId: sucursalFiltro,
      desde: desde ? inicioDeDiaArISO(desde) : undefined,
      hasta: hasta ? finDeDiaArISO(hasta) : undefined,
      // Con un rango elegido se muestra TODO lo del rango: el techo de 150 era
      // para la vista "últimos movimientos", pero acá cortar la lista a la
      // mitad de un mes convierte la conciliación en un número equivocado.
      limit: hayRango ? 2000 : 150,
    }),
    listSucursales({ soloActivas: true }),
  ]);
  const sucursales = sucursalesAll.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );
  const sucursalNombreById = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const multipleSucursales = sucursales.length > 1;

  // Agrupar saldos por sucursal para vista consolidada
  const saldosBySucursal = new Map<
    string,
    { total: number; items: typeof saldos }
  >();
  for (const s of saldos) {
    const entry = saldosBySucursal.get(s.cuenta.sucursal_id) ?? {
      total: 0,
      items: [],
    };
    entry.total += s.saldo;
    entry.items.push(s);
    saldosBySucursal.set(s.cuenta.sucursal_id, entry);
  }

  const totalGeneral = saldos.reduce((acc, s) => acc + s.saldo, 0);
  // Trazabilidad: cuánto se llevaron los impuestos entre los movimientos listados.
  const totalImpuestos = movimientos.reduce(
    (acc, m) =>
      acc + (m.movimiento.tipo === "impuesto" ? Math.abs(m.movimiento.monto) : 0),
    0,
  );
  /**
   * Entró, salió y neto de lo que se está viendo. Es lo que se compara contra el
   * extracto: "cuenta macro (ingreso - egreso) para poder buscar por fecha".
   * Sumar cuarenta renglones a mano en el mostrador es donde aparecen las
   * diferencias que después no se sabe de dónde salieron.
   */
  // Un ingreso manual anulado y su anulación no son plata que se movió: en el
  // extracto no aparecen. Se sacan de Entró/Salió cuando están los dos en la
  // lista (si falta uno, el neto dejaría de cuadrar).
  const idsEnLista = new Set(movimientos.map((m) => m.movimiento.id));
  const parAnulado = new Set<string>();
  for (const m of movimientos) {
    const ref = m.movimiento.ref_id;
    if (m.movimiento.ref_tipo === "anulacion_manual" && ref && idsEnLista.has(ref)) {
      parAnulado.add(m.movimiento.id);
      parAnulado.add(ref);
    }
  }
  const contables = movimientos.filter((m) => !parAnulado.has(m.movimiento.id));
  const entraron = contables.reduce(
    (acc, m) => acc + (m.movimiento.monto > 0 ? m.movimiento.monto : 0),
    0,
  );
  const salieron = contables.reduce(
    (acc, m) => acc + (m.movimiento.monto < 0 ? m.movimiento.monto : 0),
    0,
  );
  const puedeAnular = ["admin", "superadmin", "encargada"].includes(user.rol);

  async function transferir(formData: FormData): Promise<void> {
    "use server";
    await createTransferencia(formData);
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Cuentas y saldos
        </h1>
        <p className="text-sm text-muted-foreground">
          Saldo de cada cuenta en tiempo real — cada cobro y egreso pago impacta automáticamente.{" "}
          <a href="/caja" className="underline hover:text-foreground">
            ¿Buscás el cierre del día? →
          </a>
        </p>
      </header>

      {multipleSucursales && (
        <nav className="flex flex-wrap gap-2 text-xs uppercase tracking-wider">
          <a
            href="/bancos"
            className={
              "px-3 py-1.5 rounded-md border " +
              (!sucursalFiltro
                ? "border-sage-700 bg-sage-50 text-sage-900"
                : "border-border text-muted-foreground hover:bg-cream/40")
            }
          >
            Todas
          </a>
          {sucursales.map((s) => (
            <a
              key={s.id}
              href={`/bancos?sucursal=${s.id}`}
              className={
                "px-3 py-1.5 rounded-md border " +
                (sucursalFiltro === s.id
                  ? "border-sage-700 bg-sage-50 text-sage-900"
                  : "border-border text-muted-foreground hover:bg-cream/40")
              }
            >
              {s.nombre}
            </a>
          ))}
        </nav>
      )}

      <section className="bg-card border border-border rounded-md p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Total {sucursalFiltro ? sucursalNombreById.get(sucursalFiltro) : "general"}
        </p>
        <p className="text-3xl font-display tabular-nums mt-2">
          {fmtMoney(totalGeneral)}
        </p>
      </section>

      <section className="space-y-5">
        {saldosBySucursal.size === 0 ? (
          <div className="bg-card border border-border rounded-md p-6 text-sm text-muted-foreground">
            Todavía no hay cuentas cargadas.{" "}
            <a className="underline" href="/catalogos/cuentas-bancarias">
              Crear una
            </a>
            .
          </div>
        ) : (
          Array.from(saldosBySucursal.entries()).map(([sucId, entry]) => (
            <div key={sucId}>
              {multipleSucursales && (
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
                    {sucursalNombreById.get(sucId) ?? sucId}
                  </h2>
                  <span className="text-sm tabular-nums font-medium">
                    {fmtMoney(entry.total)}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {entry.items.map((s) => (
                  <a
                    key={s.cuenta.id}
                    href={`/bancos?cuenta=${s.cuenta.id}${sucursalFiltro ? `&sucursal=${sucursalFiltro}` : ""}`}
                    className={
                      "bg-card border rounded-md p-4 hover:bg-cream/40 transition-colors " +
                      (cuentaFiltro === s.cuenta.id
                        ? "border-sage-700 ring-1 ring-sage-700"
                        : "border-border")
                    }
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium truncate">{s.cuenta.nombre}</p>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {s.cuenta.tipo}
                      </span>
                    </div>
                    <p className="text-xl font-display tabular-nums mt-2">
                      {fmtMoney(s.saldo)}
                    </p>
                    {!s.cuenta.activo && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Cuenta inactiva
                      </p>
                    )}
                  </a>
                ))}
              </div>
            </div>
          ))
        )}
        {cuentaFiltro && (
          <div>
            <a
              href={`/bancos${sucursalFiltro ? `?sucursal=${sucursalFiltro}` : ""}`}
              className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              ← Ver todas las cuentas
            </a>
          </div>
        )}
      </section>

      {cuentas.length > 0 && (
        <IngresoManualForm cuentas={cuentas} sucursales={sucursales} />
      )}

      {cuentas.length >= 2 && (
        <TransferenciaForm
          cuentas={cuentas}
          sucursales={sucursales}
          action={transferir}
        />
      )}

      <section>
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
            Movimientos {cuentaFiltro ? "de la cuenta" : "recientes"}
          </h2>
          <span className="text-xs text-muted-foreground">
            {totalImpuestos > 0 && (
              <span className="text-warning mr-3">
                Impuestos en la vista: {fmtMoney(totalImpuestos)}
              </span>
            )}
            {movimientos.length} mov.
          </span>
        </div>

        {/* Filtro por fecha. Es un form GET para que el rango quede en la URL:
            así se puede guardar el link del mes que se está conciliando y
            volver a abrirlo igual, en vez de recargar y perder el filtro. */}
        <form
          method="get"
          className="mb-3 flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3"
        >
          {cuentaFiltro && <input type="hidden" name="cuenta" value={cuentaFiltro} />}
          {sucursalFiltro && (
            <input type="hidden" name="sucursal" value={sucursalFiltro} />
          )}
          <div className="space-y-1">
            <label
              htmlFor="mov-desde"
              className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Desde
            </label>
            <input
              id="mov-desde"
              type="date"
              name="desde"
              defaultValue={desde}
              max={hoyAr()}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="mov-hasta"
              className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Hasta
            </label>
            <input
              id="mov-hasta"
              type="date"
              name="hasta"
              defaultValue={hasta}
              max={hoyAr()}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-ink px-4 py-1.5 text-sm text-cream hover:opacity-90"
          >
            Filtrar
          </button>
          {hayRango && (
            <a
              href={`/bancos${cuentaFiltro ? `?cuenta=${cuentaFiltro}` : sucursalFiltro ? `?sucursal=${sucursalFiltro}` : ""}`}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Quitar el filtro
            </a>
          )}
        </form>

        {/* Entró, salió y neto de lo que se ve. Es lo que se compara contra el
            extracto del banco. */}
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          {[
            { t: "Entró", v: entraron, c: "text-sage-800" },
            { t: "Salió", v: salieron, c: "text-danger" },
            { t: "Neto del período", v: entraron + salieron, c: "" },
          ].map((x) => (
            <div key={x.t} className="rounded-md border border-border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {x.t}
              </div>
              <div className={`text-base font-semibold tabular-nums ${x.c}`}>
                {fmtMoney(x.v)}
              </div>
            </div>
          ))}
        </div>

        {hayRango && !cuentaFiltro && (
          <p className="mb-3 text-[11px] text-muted-foreground">
            Estás viendo todas las cuentas juntas. Para cruzar contra el extracto
            de un banco, elegí primero la cuenta arriba.
          </p>
        )}
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3 w-36">Fecha</th>
                <th className="text-left font-medium px-4 py-3">Cuenta</th>
                <th className="text-left font-medium px-4 py-3 w-36">Tipo</th>
                <th className="text-left font-medium px-4 py-3">Detalle</th>
                <th className="text-right font-medium px-4 py-3 w-36">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movimientos.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-muted-foreground"
                  >
                    Sin movimientos.
                  </td>
                </tr>
              ) : (
                movimientos.map((m) => {
                  const esManual = m.movimiento.ref_tipo === "manual";
                  const esTransferencia = m.movimiento.ref_tipo === "transferencia";
                  const esAnulacion = m.movimiento.ref_tipo === "anulacion_manual";
                  const anulado = (esManual || esTransferencia) && Boolean(m.anulacion);
                  return (
                    <tr
                      key={m.movimiento.id}
                      className={
                        anulado || esAnulacion
                          ? "bg-destructive/5 hover:bg-destructive/10"
                          : "hover:bg-cream/30"
                      }
                    >
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {fmtFecha(m.movimiento.fecha)}
                      </td>
                      <td className="px-4 py-3">
                        <span>{m.cuenta?.nombre ?? "—"}</span>
                        {multipleSucursales && m.cuenta && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {sucursalNombreById.get(m.cuenta.sucursal_id) ?? ""}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">
                        {esAnulacion
                          ? "Anulación"
                          : (tipoLabel[m.movimiento.tipo] ?? m.movimiento.tipo)}
                        {anulado && (
                          <span className="ml-2 rounded-sm bg-destructive/15 px-1.5 py-0.5 text-[10px] text-destructive">
                            Anulado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className={anulado ? "line-through" : undefined}>
                          {m.movimiento.descripcion ?? "—"}
                        </span>
                        {anulado && m.anulacion && (
                          <p className="mt-1 text-xs text-destructive">
                            {m.anulacion.descripcion}
                            {m.anulacion.usuarioNombre
                              ? ` · ${m.anulacion.usuarioNombre}`
                              : ""}
                          </p>
                        )}
                        {esManual &&
                          !anulado &&
                          m.movimiento.tipo === "ingreso" &&
                          puedeAnular && (
                            <div className="mt-1">
                              <AnularIngresoManual
                                movimientoId={m.movimiento.id}
                                monto={m.movimiento.monto}
                                concepto={m.movimiento.descripcion}
                              />
                            </div>
                          )}
                        {esTransferencia && !anulado && puedeAnular && (
                          <div className="mt-1">
                            <AnularIngresoManual
                              tipo="transferencia"
                              movimientoId={m.movimiento.id}
                              monto={m.movimiento.monto}
                              concepto={m.movimiento.descripcion}
                            />
                          </div>
                        )}
                      </td>
                      <td
                        className={
                          "px-4 py-3 text-right tabular-nums font-medium " +
                          (anulado
                            ? "text-muted-foreground line-through"
                            : m.movimiento.monto >= 0
                              ? "text-sage-700"
                              : "text-warning")
                        }
                      >
                        {fmtMoney(m.movimiento.monto)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TransferenciaForm({
  cuentas,
  sucursales,
  action,
}: {
  cuentas: Array<{ id: string; nombre: string; sucursal_id: string }>;
  sucursales: Array<{ id: string; nombre: string }>;
  action: (formData: FormData) => Promise<void>;
}) {
  const cuentasBySucursal = new Map<
    string,
    typeof cuentas
  >();
  for (const c of cuentas) {
    const list = cuentasBySucursal.get(c.sucursal_id) ?? [];
    list.push(c);
    cuentasBySucursal.set(c.sucursal_id, list);
  }
  // Solo mostramos el form si al menos una sucursal tiene 2+ cuentas
  const sucursalesConTransferencia = sucursales.filter(
    (s) => (cuentasBySucursal.get(s.id)?.length ?? 0) >= 2,
  );
  if (sucursalesConTransferencia.length === 0) return null;

  return (
    <section className="bg-card border border-border rounded-md p-5 space-y-4">
      <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
        Transferir entre cuentas (misma sucursal)
      </h2>
      {sucursalesConTransferencia.map((s) => {
        const cs = cuentasBySucursal.get(s.id) ?? [];
        return (
          <form
            key={s.id}
            action={action}
            className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end border-t border-border pt-4 first:border-t-0 first:pt-0"
          >
            <div className="sm:col-span-6 text-xs uppercase tracking-wider text-muted-foreground">
              {s.nombre}
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Desde
              </label>
              <select
                name="cuenta_origen_id"
                required
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {cs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Hacia
              </label>
              <select
                name="cuenta_destino_id"
                required
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {cs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <CurrencyField label="Monto" name="monto" required />
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Detalle
              </label>
              <input
                name="descripcion"
                placeholder="Opcional"
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors"
            >
              Transferir
            </button>
          </form>
        );
      })}
    </section>
  );
}
