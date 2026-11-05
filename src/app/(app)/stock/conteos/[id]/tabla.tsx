"use client";

import { useState } from "react";
import { fmtEnvases } from "@/lib/stock-planillas";
import { formatARS } from "@/lib/utils";

export interface FilaDetalleConteo {
  id: string;
  nombre: string;
  detalle: string;
  /** En envases. */
  sistema: number;
  contado: number;
  diferencia: number;
  cambioDeposito: boolean;
  valor: number;
}

/** Los productos del conteo; por defecto sólo los que dieron distinto. */
export function ConteoDetalleTabla({ filas }: { filas: FilaDetalleConteo[] }) {
  const [todos, setTodos] = useState(false);
  const conDiferencia = filas.filter((f) => f.diferencia !== 0 || f.cambioDeposito);
  const visibles = (todos ? filas : conDiferencia)
    .slice()
    .sort((a, b) => a.valor - b.valor || a.nombre.localeCompare(b.nombre, "es"));
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
        Mostrar también los que coincidieron ({filas.length - conDiferencia.length})
      </label>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Producto</th>
              <th className="px-4 py-3 text-right font-medium">Sistema</th>
              <th className="px-4 py-3 text-right font-medium">Contado</th>
              <th className="px-4 py-3 text-right font-medium">Diferencia</th>
              <th className="px-4 py-3 text-right font-medium">$</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Todo coincidió con el sistema.
                </td>
              </tr>
            )}
            {visibles.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-2.5">
                  <div className="font-medium">{f.nombre}</div>
                  <div className="text-[11px] text-muted-foreground">{f.detalle}</div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtEnvases(f.sistema)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtEnvases(f.contado)}</td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums ${
                    f.diferencia < 0 ? "text-destructive" : f.diferencia > 0 ? "text-sage-700" : ""
                  }`}
                >
                  {f.diferencia > 0 ? "+" : ""}
                  {fmtEnvases(f.diferencia)} env.
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatARS(f.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
