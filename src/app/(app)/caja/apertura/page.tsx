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

function todayYMD(): string {
  return hoyAr();
}

export default async function AperturaCajaPage() {
  const user = await requireUser();
  if (user.rol !== "admin" && user.rol !== "encargada") redirect("/caja");

  const sucursal = await getActiveSucursal();
  if (!sucursal) redirect("/dev/login");

  const fecha = todayYMD();
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
