"use client";

import { useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "@/components/forms/field";
import { togglePagadoEgreso } from "@/lib/data/egresos-actions";
import type { MedioPago } from "@/lib/types";

/**
 * Marca un gasto como pagado, o lo vuelve a dejar a pagar.
 *
 * Si el gasto se cargó a cuenta corriente del proveedor no tiene medio de pago
 * —cuando se cargó todavía no se sabía con qué se le iba a pagar—, así que acá
 * se pregunta. Es el momento correcto para preguntarlo: la plata sale ahora, y
 * de esa respuesta depende de qué cuenta sale.
 */
export function TogglePagadoButton({
  egresoId,
  pagado,
  tieneMedio,
  mediosPago = [],
}: {
  egresoId: string;
  pagado: boolean;
  /** false = quedó a pagar sin medio elegido; hay que preguntarlo. */
  tieneMedio?: boolean;
  mediosPago?: MedioPago[];
}) {
  const { pending, run } = useTransitionFeedback();
  const [eligiendo, setEligiendo] = useState(false);
  const [mpId, setMpId] = useState("");

  const debePreguntar =
    !pagado && tieneMedio === false && mediosPago.length > 0;

  function confirmar(medio?: string) {
    run(() => togglePagadoEgreso(egresoId, medio), {
      refreshOnSuccess: true,
      successMessage: pagado
        ? "Egreso marcado como pendiente"
        : "Egreso marcado como pagado",
    });
  }

  if (eligiendo) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <select
          value={mpId}
          onChange={(e) => setMpId(e.target.value)}
          aria-label="Con qué se pagó"
          className="rounded-md border border-border bg-card px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">¿Con qué se pagó?</option>
          {mediosPago.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        <LoadingButton
          type="button"
          pending={pending}
          pendingLabel="Guardando..."
          disabled={!mpId}
          onClick={() => confirmar(mpId)}
          className="inline-flex items-center gap-1.5 rounded-md bg-sage-700 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-sage-900 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
          Pagado
        </LoadingButton>
        <button
          type="button"
          onClick={() => {
            setEligiendo(false);
            setMpId("");
          }}
          className="rounded-md border border-border px-2 py-1.5 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-cream"
        >
          Cancelar
        </button>
      </div>
    );
  }

  const className = pagado
    ? "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-cream disabled:opacity-50"
    : "inline-flex items-center gap-1.5 rounded-md bg-sage-700 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-sage-900 disabled:opacity-50";

  return (
    <LoadingButton
      type="button"
      pending={pending}
      pendingLabel={pagado ? "Actualizando..." : "Guardando..."}
      onClick={() => (debePreguntar ? setEligiendo(true) : confirmar())}
      className={className}
    >
      {pagado ? (
        <>
          <Undo2 className="h-3.5 w-3.5 stroke-[2]" />
          Marcar pendiente
        </>
      ) : (
        <>
          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
          Marcar pagado
        </>
      )}
    </LoadingButton>
  );
}
