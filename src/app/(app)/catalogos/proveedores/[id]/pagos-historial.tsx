import { formatARS, formatDateTime } from "@/lib/utils";
import type { PagoProveedor } from "@/lib/data/proveedores";

/**
 * Historial de pagos al proveedor.
 *
 * No es un adorno: es la prueba. Elu: "nos pasa que ellos se olvidan de los
 * pagos que les hacemos... el sistema viejo nos muestra todos los pagos que se
 * le fueron haciendo con su fecha para poder llevar nuestro control ante las
 * objeciones de ellos".
 */
export function PagosHistorial({ pagos }: { pagos: PagoProveedor[] }) {
  const vigentes = pagos.filter((p) => !p.anulado);
  const total = vigentes.reduce((s, p) => s + p.monto, 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Pagos hechos
        </h2>
        {vigentes.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {vigentes.length} pago{vigentes.length !== 1 ? "s" : ""} ·{" "}
            {formatARS(total)}
          </span>
        )}
      </div>

      {pagos.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Todavía no hay pagos registrados a este proveedor.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Fecha</th>
                <th className="px-4 py-3 text-left font-medium">Con qué</th>
                <th className="px-4 py-3 text-left font-medium">Detalle</th>
                <th className="px-4 py-3 text-right font-medium">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagos.map((p) => (
                <tr
                  key={p.id}
                  className={p.anulado ? "opacity-50 line-through" : ""}
                >
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {formatDateTime(p.fecha)}
                  </td>
                  <td className="px-4 py-2.5 text-xs uppercase text-muted-foreground">
                    {p.mp_codigo ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {p.observacion ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                    {formatARS(p.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
