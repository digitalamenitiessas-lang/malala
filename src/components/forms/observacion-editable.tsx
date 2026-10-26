"use client";

import { useState } from "react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { actualizarObservacionAnticipo } from "@/lib/data/anticipos";
import { actualizarObservacionDescuento } from "@/lib/data/descuentos";

interface Props {
  tipo: "anticipo" | "descuento";
  id: string;
  observacion?: string;
  /** Para que quien la muestra se entere sin volver a pedir todo. */
  onGuardada?: (observacion: string | undefined) => void;
  /** Volver a pedir la página al guardar (el detalle; la vista previa no). */
  refrescar?: boolean;
}

/**
 * La observación de un anticipo o un descuento, editable en el lugar.
 *
 * Antes sólo se escribía al cargarlo, y lo que hay que aclarar aparece recién
 * al liquidar, mirando la lista. Sólo cambia el texto: el monto, la fecha y
 * en qué liquidación entra no se tocan desde acá.
 */
export function ObservacionEditable({
  tipo,
  id,
  observacion,
  onGuardada,
  refrescar,
}: Props) {
  const { pending, run } = useTransitionFeedback();
  const [valor, setValor] = useState(observacion ?? "");
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(valor);
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    run(
      async () => {
        const res =
          tipo === "anticipo"
            ? await actualizarObservacionAnticipo(id, borrador)
            : await actualizarObservacionDescuento(id, borrador);
        if (res.ok) {
          const limpia = borrador.trim();
          setValor(limpia);
          setEditando(false);
          onGuardada?.(limpia || undefined);
        } else {
          setError(Object.values(res.errors).flat().join(", ") || "Error");
        }
        return res;
      },
      {
        refreshOnSuccess: refrescar,
        successMessage: "Observación guardada",
      },
    );
  }

  if (!editando) {
    return (
      <span className="inline-flex min-w-0 items-baseline gap-1.5">
        {valor ? <span className="truncate">{valor}</span> : null}
        <button
          type="button"
          onClick={() => {
            setBorrador(valor);
            setEditando(true);
          }}
          className="shrink-0 text-[11px] underline hover:text-foreground"
        >
          {valor ? "editar" : "agregar observación"}
        </button>
      </span>
    );
  }

  return (
    <span className="flex w-full flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <input
          type="text"
          value={borrador}
          autoFocus
          maxLength={500}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              guardar();
            }
            if (e.key === "Escape") setEditando(false);
          }}
          className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
        />
        <button
          type="button"
          disabled={pending}
          onClick={guardar}
          className="rounded-md border border-border px-2 py-1 text-[10px] font-medium uppercase tracking-wider hover:bg-cream disabled:opacity-60"
        >
          {pending ? "..." : "Guardar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditando(false)}
          className="text-[11px] underline hover:text-foreground"
        >
          Cancelar
        </button>
      </span>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
