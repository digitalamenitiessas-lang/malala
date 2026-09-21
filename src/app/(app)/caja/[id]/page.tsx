import { notFound } from "next/navigation";
import { getCierre, getCierreCuentas, getResumenDelDia } from "@/lib/data/caja";
import { requireUser } from "@/lib/auth/session";
import { formatARS, formatDateTimeLong } from "@/lib/utils";
import { ReabrirCierreButton } from "./reabrir-button";
import { DesgloseCaja } from "../desglose-caja";

function formatYMD(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export default async function CierreDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const data = await getCierre(id);
  if (!data) notFound();

  const { cierre, sucursal_nombre, cerrado_por_nombre, efectivoEsperado } = data;
  const isAdmin = user.rol === "admin";

  const resumen = await getResumenDelDia(cierre.sucursal_id, cierre.fecha);
  const arqueo = await getCierreCuentas(cierre.id);

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
              Cierre de caja
            </h1>
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatYMD(cierre.fecha)} · {sucursal_nombre} · cerrado por{" "}
              {cerrado_por_nombre} ·{" "}
              {formatDateTimeLong(cierre.fecha_cierre)}
            </p>
          </div>
          {isAdmin && <ReabrirCierreButton cierreId={cierre.id} />}
        </div>
      </header>

      {/* Conciliación del cierre: efectivo esperado (suma el saldo inicial). El
          resto del desglose por medio va en <DesgloseCaja />. */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryBox label="Efectivo esperado" value={formatARS(efectivoEsperado)} />
      </section>

      {/* Arqueo por cuenta: esperado vs contado al cerrar (fase 2). */}
      {arqueo.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Arqueo por cuenta
          </h2>
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Cuenta</th>
                  <th className="px-4 py-3 text-right font-medium">Esperado</th>
                  <th className="px-4 py-3 text-right font-medium">Contado</th>
                  <th className="px-4 py-3 text-right font-medium">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {arqueo.map((row) => {
                  const diff = row.linea.saldo_contado - row.linea.saldo_esperado;
                  return (
                    <tr key={row.linea.id}>
                      <td className="px-4 py-3 font-medium">
                        {row.cuenta?.nombre ?? row.linea.cuenta_id}
                        {row.cuenta && (
                          <span className="ml-1 text-xs uppercase text-muted-foreground">
                            ({row.cuenta.tipo})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatARS(row.linea.saldo_esperado)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatARS(row.linea.saldo_contado)}
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
          <p className="text-xs text-muted-foreground">
            La diferencia (faltante o sobrante) queda registrada como dato del
            cierre; no modifica el saldo de las cuentas.
          </p>
        </section>
      )}

      {/* Desglose de la jornada (mismo componente que la caja en curso).
          Rentabilidad y comisiones solo para admin. */}
      <DesgloseCaja resumen={resumen} isAdmin={isAdmin} />

      {cierre.observacion && (
        <section className="bg-cream/40 border border-border rounded-md p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Observación
          </p>
          <p className="text-sm whitespace-pre-wrap">{cierre.observacion}</p>
        </section>
      )}
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-md p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-display text-2xl mt-2 tabular-nums">{value}</p>
    </div>
  );
}
