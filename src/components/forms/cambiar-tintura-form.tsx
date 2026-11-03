"use client";

import { useState } from "react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { cambiarTinturaLinea } from "@/lib/data/ingresos-actions";

/**
 * Qué tintura se usó en una línea ya cobrada, y corregirla si se eligió mal.
 *
 * No toca la caja, así que se puede hacer con el día cerrado: mueve el stock
 * de una tintura a la otra y el costo de insumos de la línea.
 */
export function CambiarTinturaForm({
  lineaId,
  insumoRecetaId,
  usadaId,
  opciones,
  puedeCambiar,
}: {
  lineaId: string;
  insumoRecetaId: string;
  usadaId: string;
  /** La de la receta primero. */
  opciones: { id: string; nombre: string }[];
  puedeCambiar: boolean;
}) {
  const { pending, run } = useTransitionFeedback();
  const [abierto, setAbierto] = useState(false);
  const [elegida, setElegida] = useState(usadaId);
  const [error, setError] = useState<string | null>(null);
  const usada = opciones.find((o) => o.id === usadaId);

  if (!abierto) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          Tintura: {usada?.nombre ?? "—"}
          {usadaId === insumoRecetaId ? " (receta)" : ""}
        </span>
        {puedeCambiar && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors hover:bg-cream"
          >
            Cambiar
          </button>
        )}
      </p>
    );
  }

  return (
    <div className="mt-1 space-y-1.5">
      <select
        value={elegida}
        onChange={(e) => setElegida(e.target.value)}
        aria-label="Tintura usada"
        className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
      >
        {opciones.map((o, i) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
            {i === 0 ? " (receta)" : ""}
          </option>
        ))}
      </select>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            run(
              async () => {
                const res = await cambiarTinturaLinea(lineaId, insumoRecetaId, elegida);
                if (!res.ok) setError(Object.values(res.errors).flat().join(", "));
                return res;
              },
              {
                refreshOnSuccess: true,
                successMessage: "Tintura corregida",
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
            setElegida(usadaId);
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
