"use client";

import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { setRubroGastoGrupo } from "@/lib/data/rubros-gasto";
import { GRUPOS_GASTO, esOperativo } from "@/lib/grupos-gasto";

/**
 * Elige en qué grupo cae un rubro de gasto.
 *
 * Al lado se muestra si eso lo hace operativo o no, porque es la consecuencia
 * que importa: lo no operativo (retiros, aportes, deuda, inversión) no resta
 * al resultado del salón. Quien elige el grupo tiene que ver el efecto en el
 * mismo renglón, no descubrirlo después en un reporte.
 */
export function GrupoSelector({
  rubroId,
  grupo,
}: {
  rubroId: string;
  grupo?: number;
}) {
  const { pending, run } = useTransitionFeedback();

  return (
    <div className="flex items-center justify-center gap-2">
      <select
        value={grupo ?? ""}
        disabled={pending}
        aria-label="Grupo del rubro"
        onChange={(e) => {
          const v = e.target.value;
          run(() => setRubroGastoGrupo(rubroId, v === "" ? null : Number(v)), {
            refreshOnSuccess: true,
            successMessage: "Grupo actualizado",
          });
        }}
        className="w-full max-w-[15rem] rounded-md border border-border bg-card px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        <option value="">— Sin clasificar —</option>
        {GRUPOS_GASTO.map((g) => (
          <option key={g.id} value={g.id}>
            {g.id} · {g.nombre}
          </option>
        ))}
      </select>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
          grupo == null
            ? "bg-destructive/10 text-destructive"
            : esOperativo(grupo)
              ? "bg-sage-100 text-sage-900"
              : "bg-warning/15 text-brown-700"
        }`}
      >
        {grupo == null ? "Falta" : esOperativo(grupo) ? "Operativo" : "Bajo la línea"}
      </span>
    </div>
  );
}
