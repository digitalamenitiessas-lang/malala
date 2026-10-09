"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatARS } from "@/lib/utils";

/**
 * El renglón por renglón del efectivo, con saldo corriente.
 *
 * El salón lleva esto a mano en una planilla —fecha, concepto, entra, sale,
 * saldo— y lo usa para encontrar dónde se despega del cajón. Pedido dos veces
 * el mismo día: Elu, "¿no se puede abrir detalle de esa caja para ver el
 * detalle de entrada y salida solo de ef?", y Lucía, "podrán poner el detalle
 * en esperado así abrimos y vemos la suma y resta de los mov solo ef".
 *
 * La pantalla mostraba el esperado como un número solo. Cuando no coincidía
 * con el cajón no había forma de buscar la diferencia desde adentro del
 * sistema, y por eso la planilla paralela sigue existiendo.
 */

export interface MovEfectivo {
  hora: string;
  concepto: string;
  monto: number;
}

export function DetalleEfectivo({
  cuenta,
  saldoInicial,
  movimientos,
  esperado,
}: {
  cuenta: string;
  saldoInicial: number;
  movimientos: MovEfectivo[];
  esperado: number;
}) {
  const [abierto, setAbierto] = useState(false);

  // El saldo corriente se arma acá y no en el servidor: es lo mismo que la
  // planilla hace en la columna de la derecha, y verlo crecer renglón a
  // renglón es justamente lo que permite ubicar dónde se despegó.
  let corriente = saldoInicial;
  const filas = movimientos.map((m) => {
    corriente += m.monto;
    return { ...m, saldo: corriente };
  });

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-cream/40"
      >
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Detalle de {cuenta} · {movimientos.length} movimiento
          {movimientos.length !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium tabular-nums">
            {formatARS(esperado)}
          </span>
          <ChevronDown
            className={`h-4 w-4 stroke-[1.5] text-muted-foreground transition-transform ${
              abierto ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {abierto && (
        <div className="border-t border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium w-16">Hora</th>
                <th className="px-4 py-2 text-left font-medium">Concepto</th>
                <th className="px-4 py-2 text-right font-medium w-28">Entra</th>
                <th className="px-4 py-2 text-right font-medium w-28">Sale</th>
                <th className="px-4 py-2 text-right font-medium w-32">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr className="bg-cream/20">
                <td className="px-4 py-2 text-muted-foreground">—</td>
                <td className="px-4 py-2 font-medium">Saldo al abrir</td>
                <td className="px-4 py-2" />
                <td className="px-4 py-2" />
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {formatARS(saldoInicial)}
                </td>
              </tr>
              {filas.map((f, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">
                    {f.hora}
                  </td>
                  <td className="px-4 py-2">{f.concepto}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {f.monto > 0 ? formatARS(f.monto) : ""}
                  </td>
                  <td
                    className="px-4 py-2 text-right tabular-nums"
                    style={{ color: "var(--danger)" }}
                  >
                    {f.monto < 0 ? formatARS(-f.monto) : ""}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatARS(f.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-cream/40">
              <tr>
                <td colSpan={4} className="px-4 py-2.5 text-xs uppercase tracking-wider">
                  Esperado en {cuenta}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                  {formatARS(esperado)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
