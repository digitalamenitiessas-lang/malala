"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "./field";
import {
  anularIngresoManual,
  anularTransferencia,
} from "@/lib/data/cuentas-bancarias";
import { formatARS } from "@/lib/utils";

interface Props {
  movimientoId: string;
  monto: number;
  concepto?: string;
  /** Una transferencia se anula con sus dos patas (ver anularTransferencia). */
  tipo?: "ingreso" | "transferencia";
}

/**
 * Anular un ingreso manual o una transferencia desde la lista de movimientos.
 * No se borra: queda un ajuste que lo cancela, con el motivo, y el saldo
 * vuelve a lo que era.
 */
export function AnularIngresoManual({
  movimientoId,
  monto,
  concepto,
  tipo = "ingreso",
}: Props) {
  const esTransferencia = tipo === "transferencia";
  const { pending, run } = useTransitionFeedback();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function anular() {
    setError(null);
    if (!motivo.trim()) {
      setError("Contá por qué se anula.");
      return;
    }
    run(
      async () => {
        const res = esTransferencia
          ? await anularTransferencia(movimientoId, motivo)
          : await anularIngresoManual(movimientoId, motivo);
        if (!res.ok) setError(Object.values(res.errors).flat().join(" "));
        return res;
      },
      {
        refreshOnSuccess: true,
        successMessage: esTransferencia ? "Transferencia anulada" : "Ingreso anulado",
      },
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-destructive hover:underline"
      >
        <Ban className="h-3 w-3 stroke-[1.5]" />
        Anular
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-left">
      <p className="text-xs text-foreground">
        {esTransferencia ? (
          <>
            Anular la transferencia de {formatARS(Math.abs(monto))}
            {concepto ? ` (${concepto})` : ""}. Las dos cuentas vuelven a como
            estaban y queda registrada como anulada.
          </>
        ) : (
          <>
            Anular el ingreso de {formatARS(monto)}
            {concepto ? ` (${concepto})` : ""}. Se descuenta de la cuenta y queda
            registrado como anulado.
          </>
        )}
      </p>
      <label
        htmlFor={`motivo-${movimientoId}`}
        className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
      >
        Motivo
      </label>
      <input
        id={`motivo-${movimientoId}`}
        type="text"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ej. se cargó dos veces"
        className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <LoadingButton
          type="button"
          onClick={anular}
          pending={pending}
          pendingLabel="Anulando..."
          className="rounded-md bg-destructive px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-white transition-colors hover:opacity-90"
        >
          Confirmar anulación
        </LoadingButton>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setMotivo("");
            setError(null);
          }}
          className="rounded-md border border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors hover:bg-cream"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
