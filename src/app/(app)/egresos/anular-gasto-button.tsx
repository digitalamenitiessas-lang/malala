"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "@/components/forms/field";
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
 *
 * El motivo se pide en un panel propio y no con window.prompt. El diálogo
 * nativo del navegador no se ve como el resto del sistema, en el celular queda
 * incómodo, y hay navegadores que directamente lo suprimen: ahí el botón no
 * hacía nada y no había forma de saber por qué.
 */
export function AnularGastoButton({ egresoId, detalle, monto, anulado }: Props) {
  const { pending, run } = useTransitionFeedback();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (anulado) return null;

  function anular() {
    setError(null);
    run(
      async () => {
        const res = await anularEgreso(egresoId, motivo);
        if (!res.ok) setError(Object.values(res.errors).flat().join(" "));
        else setAbierto(false);
        return res;
      },
      { refreshOnSuccess: true, successMessage: "Gasto anulado" },
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Anular este gasto"
        className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-destructive"
      >
        <Ban className="h-3.5 w-3.5 stroke-[1.5]" />
        Anular
      </button>
    );
  }

  return (
    <div className="w-64 space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-left">
      <p className="text-xs font-medium">
        Anular {detalle} por {formatARS(monto)}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Vuelve el stock que sumó, se descuenta de la caja si estaba pagado y se
        saca de la deuda con el proveedor si quedaba pendiente.
      </p>
      <input
        type="text"
        autoFocus
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (opcional)"
        className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <LoadingButton
          type="button"
          onClick={anular}
          pending={pending}
          pendingLabel="Anulando..."
          className="rounded-md bg-destructive px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-white transition-colors hover:opacity-90"
        >
          Confirmar
        </LoadingButton>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setMotivo("");
            setError(null);
          }}
          className="text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
