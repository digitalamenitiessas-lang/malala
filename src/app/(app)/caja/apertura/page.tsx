import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import {
  getAperturaDeFecha,
  getSugerenciasApertura,
} from "@/lib/data/apertura-caja";
import { AperturaCajaForm } from "@/components/forms/apertura-caja-form";
import { ReabrirAperturaButton } from "./reabrir-apertura-button";
import { formatARS } from "@/lib/utils";
import { hoyAr } from "@/lib/fecha-ar";
import { esAdmin } from "@/lib/auth/access";

function todayYMD(): string {
  return hoyAr();
}

export default async function AperturaCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const user = await requireUser();
  if (!esAdmin(user.rol) && user.rol !== "encargada") redirect("/caja");

  const sucursal = await getActiveSucursal();
  if (!sucursal) redirect("/dev/login");

  // Normalmente hoy, pero se puede abrir un día viejo que quedó sin abrir:
  // sin eso no hay forma de cargarle las ventas que faltaron, porque vender
  // exige la caja de ese día abierta. Nunca a futuro.
  const sp = await searchParams;
  const pedida = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? "") ? sp.fecha! : "";
  const fecha = pedida && pedida <= todayYMD() ? pedida : todayYMD();
  const esVieja = fecha !== todayYMD();
  const [existente, sugerencias] = await Promise.all([
    getAperturaDeFecha(sucursal.id, fecha),
    getSugerenciasApertura(sucursal.id),
  ]);
  const cuentaById = new Map(sugerencias.map((s) => [s.cuenta.id, s.cuenta]));

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Abrir caja
        </h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {sucursal.nombre} · {fecha}
        </p>
        {/* Abrir un día viejo: hace falta para poder cargarle las ventas que
            quedaron sin registrar, porque vender exige la caja de ese día
            abierta. Preguntado tal cual: "¿cómo abrimos una caja vieja?". */}
        <form method="get" className="flex flex-wrap items-end gap-2 pt-1">
          <div className="space-y-1">
            <label
              htmlFor="fecha"
              className="block text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              Abrir otro día
            </label>
            <input
              id="fecha"
              name="fecha"
              type="date"
              defaultValue={fecha}
              max={todayYMD()}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-cream"
          >
            Ir
          </button>
          {esVieja && (
            <Link
              href="/caja/apertura"
              className="text-xs text-muted-foreground underline underline-offset-2 pb-2"
            >
              volver a hoy
            </Link>
          )}
        </form>
        {esVieja && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-brown-700">
            Estás abriendo un día pasado. Lo que declares acá es la plata que
            había <strong>ese día</strong>, no la de hoy, y las ventas que
            cargues con esa fecha van a entrar en esa caja.
          </p>
        )}
      </header>

      {existente ? (
        <section className="space-y-4">
          <div className="rounded-md border border-sage-300 bg-sage-50 p-4 text-sm text-sage-900">
            La caja de hoy ya está abierta. Estos son los saldos con los que
            arrancó el día.
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Cuenta</th>
                  <th className="px-4 py-3 text-right font-medium">Esperado</th>
                  <th className="px-4 py-3 text-right font-medium">Declarado</th>
                  <th className="px-4 py-3 text-right font-medium">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {existente.cuentas.map((linea) => {
                  const cuenta = cuentaById.get(linea.cuenta_id);
                  const diff = linea.saldo_declarado - linea.saldo_esperado;
                  return (
                    <tr key={linea.id}>
                      <td className="px-4 py-3 font-medium">
                        {cuenta?.nombre ?? linea.cuenta_id}
                        {cuenta && (
                          <span className="ml-1 text-xs uppercase text-muted-foreground">
                            ({cuenta.tipo})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatARS(linea.saldo_esperado)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatARS(linea.saldo_declarado)}
                      </td>
                      <td
                        className="px-4 py-3 text-right tabular-nums"
                        style={{
                          color:
                            Math.abs(diff) < 0.005
                              ? "var(--muted-foreground)"
                              : diff > 0
                                ? "var(--sage-700)"
                                : "var(--danger)",
                        }}
                      >
                        {diff > 0 ? "+" : ""}
                        {formatARS(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {existente.apertura.observacion && (
            <p className="text-sm text-muted-foreground">
              {existente.apertura.observacion}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Link
              href="/caja"
              className="px-4 py-2 rounded-md text-sm font-medium border border-border hover:bg-cream transition-colors"
            >
              Volver a caja
            </Link>
            {/* La encargada también: es la que contó la plata y la que corrige
                el mismo día. Y el literal "admin" dejaba afuera al superadmin,
                que puede todo lo que puede un admin. */}
            {["admin", "superadmin", "encargada"].includes(user.rol) && (
              <ReabrirAperturaButton aperturaId={existente.apertura.id} />
            )}
          </div>
        </section>
      ) : sugerencias.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No hay cuentas cargadas en esta sucursal. Cargá las cuentas (efectivo y
          bancos) en Catálogos → Cuentas bancarias antes de abrir la caja.
        </div>
      ) : (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Revisá cuánta plata hay en cada cuenta y ajustá lo que haga falta para
            arrancar el día.
          </p>
          <AperturaCajaForm
            sucursalId={sucursal.id}
            fecha={fecha}
            cuentas={sugerencias}
          />
        </section>
      )}
    </div>
  );
}
