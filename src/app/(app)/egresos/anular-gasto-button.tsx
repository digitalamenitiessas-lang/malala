"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { anularEgreso } from "@/lib/data/egresos";
import { formatARS } from "@/lib/utils";

interface Props {
  egresoId: string;
  detalle: string;
  monto: number;
  anulado: boolean;
}

/**
 * Anular un gasto en vez de borrarlo, mismo criterio que las ventas: el gasto
 * sale de todos los números pero queda el registro de que existió, así la caja
 * de ese día se puede seguir explicando.
 */
export function AnularGastoButton({ egresoId, detalle, monto, anulado }: Props) {
  const { pending, run } = useTransitionFeedback();
  const [error, setError] = useState<string | null>(null);

  if (anulado) return null;

  function anular() {
    const motivo = window.prompt(
      `Se va a anular "${detalle}" por ${formatARS(monto)}.\n\nVuelve el stock que sumó, se descuenta de la caja si estaba pagado y se saca de la deuda con el proveedor si quedaba pendiente.\n\n¿Por qué lo anulás? (opcional)`,
    );
    // null = apretó Cancelar. Un texto vacío sigue siendo un sí.
    if (motivo === null) return;

    setError(null);
    run(
      async () => {
        const res = await anularEgreso(egresoId, motivo);
        if (!res.ok) setError(Object.values(res.errors).flat().join(" "));
        return res;
      },
      { refreshOnSuccess: true, successMessage: "Gasto anulado" },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={anular}
        disabled={pending}
        title="Anular este gasto"
        className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
      >
        <Ban className="h-3.5 w-3.5 stroke-[1.5]" />
        Anular
      </button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </>
  );
}
