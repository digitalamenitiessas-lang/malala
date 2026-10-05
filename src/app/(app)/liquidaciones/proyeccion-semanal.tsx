import { formatARS } from "@/lib/utils";
import type { ProyeccionSemanal } from "@/lib/data/liquidaciones";

function fmtYMD(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

/**
 * Cuánto va a haber que pagar esta semana y cuánto efectivo hay.
 *
 * El salón paga los sueldos en efectivo y durante la semana necesita ir viendo
 * si le va a alcanzar: antes lo hacían abriendo el sistema viejo empleada por
 * empleada y sumando a mano. Pedido así: "hay una manera que sepamos de un
 * vistazo cuánto tenemos que tener para pagar semanales".
 *
 * Es una estimación y lo dice: las horas reales se cargan recién al liquidar,
 * así que acá se usan las de la ficha. Decirlo importa — un número que parece
 * exacto y no lo es se usa para decidir y después no cierra.
 */
export function ProyeccionSemanal({ data }: { data: ProyeccionSemanal }) {
  if (data.empleados.length === 0) return null;

  const falta = data.total - data.efectivoDisponible;

  return (
    <section className="rounded-md border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-cream/40 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Lo que hay que pagar esta semana
        </h2>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {fmtYMD(data.desde)} al {fmtYMD(data.hasta)} · estimado
        </span>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-cream/30 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Empleada</th>
            <th className="px-4 py-2 text-right font-medium">Comisiones</th>
            <th className="px-4 py-2 text-right font-medium">Horas</th>
            <th className="px-4 py-2 text-right font-medium">Anticipos</th>
            <th className="px-4 py-2 text-right font-medium">A pagar</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.empleados.map((e) => (
            <tr key={e.empleadoId}>
              <td className="px-4 py-2.5">
                {e.nombre}
                {/* Para una profesional cobra la mayor de las dos, así que
                    decir cuál evita que el total parezca mal sumado. */}
                {e.gana && (
                  <span className="block text-[10px] text-muted-foreground">
                    cobra {e.gana === "comision" ? "comisión" : "el asegurado"}
                  </span>
                )}
              </td>
              <td
                className={`px-4 py-2.5 text-right tabular-nums ${
                  e.gana === "asegurado" ? "line-through opacity-50" : ""
                }`}
              >
                {formatARS(e.comision)}
              </td>
              <td
                className={`px-4 py-2.5 text-right tabular-nums ${
                  e.gana === "comision" ? "line-through opacity-50" : ""
                }`}
              >
                {formatARS(e.sueldoHoras)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-warning">
                {e.anticipos > 0 ? `− ${formatARS(e.anticipos)}` : "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                {formatARS(e.total)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-cream/40">
          <tr>
            <td colSpan={4} className="px-4 py-3 text-xs uppercase tracking-wider">
              Total a pagar
            </td>
            <td className="px-4 py-3 text-right tabular-nums font-display text-lg">
              {formatARS(data.total)}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="px-5 py-3 border-t border-border space-y-1.5">
        <div className="flex justify-between text-sm tabular-nums">
          <span className="text-muted-foreground">Efectivo en caja ahora</span>
          <span>{formatARS(data.efectivoDisponible)}</span>
        </div>
        <div className="flex justify-between text-sm tabular-nums font-medium">
          <span>{falta > 0 ? "Falta juntar" : "Sobra después de pagar"}</span>
          <span
            style={{ color: falta > 0 ? "var(--danger)" : "var(--sage-700)" }}
          >
            {formatARS(Math.abs(falta))}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground pt-1">
          Estimado: las comisiones, los viáticos y los anticipos son los que ya
          están cargados; las horas salen de la ficha de cada una y se ajustan al
          liquidar.
        </p>
      </div>
    </section>
  );
}
