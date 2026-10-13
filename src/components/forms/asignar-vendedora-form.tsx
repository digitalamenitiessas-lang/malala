"use client";

import { useState } from "react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { asignarVendedoraLinea } from "@/lib/data/ingresos-actions";

/**
 * Poner quién vendió una línea a la que se le olvidó la vendedora.
 *
 * Pasa con los productos: se cobra rápido, se olvida, y la comisión queda en
 * cero hasta que alguien lo nota al liquidar. Antes el único camino era anular
 * la venta y volver a cargarla, que exige reabrir la caja del día.
 *
 * No toca la caja, así que se puede hacer después de cerrada.
 */
export function AsignarVendedoraForm({
  lineaId,
  empleados,
  empleadoActualId,
  comisionPctActual,
}: {
  lineaId: string;
  empleados: { id: string; nombre: string; porcentaje_default: number }[];
  empleadoActualId?: string;
  comisionPctActual: number;
}) {
  const { pending, run } = useTransitionFeedback();
  const [abierto, setAbierto] = useState(false);
  const [empleadoId, setEmpleadoId] = useState(empleadoActualId ?? "");
  const [pct, setPct] = useState(comisionPctActual);
  const [error, setError] = useState<string | null>(null);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md border border-border px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:bg-cream"
      >
        {empleadoActualId ? "Cambiar" : "Asignar"}
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <select
        value={empleadoId}
        onChange={(e) => {
          setEmpleadoId(e.target.value);
          // Arranca con el porcentaje de ella: es el caso normal, y si va otro
          // se cambia al lado.
          const emp = empleados.find((x) => x.id === e.target.value);
          if (emp && pct === 0) setPct(emp.porcentaje_default);
        }}
        className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
      >
        <option value="">— Quién vendió —</option>
        {empleados.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nombre}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={pct || ""}
          onChange={(e) => setPct(Number(e.target.value) || 0)}
          placeholder="%"
          className="w-14 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums"
        />
        <span className="text-[10px] text-muted-foreground">% com.</span>
      </div>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            if (!empleadoId) {
              setError("Elegí quién vendió");
              return;
            }
            run(
              async () => {
                const res = await asignarVendedoraLinea(lineaId, empleadoId, pct);
                if (!res.ok) {
                  setError(Object.values(res.errors).flat().join(", "));
                }
                return res;
              },
              {
                refreshOnSuccess: true,
                successMessage: "Vendedora asignada",
                onSuccess: () => setAbierto(false),
              },
            );
          }}
          className="rounded-md bg-sage-700 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-white transition-colors hover:bg-sage-900 disabled:opacity-60"
        >
          {pending ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setError(null);
          }}
          className="rounded-md border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-cream"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
