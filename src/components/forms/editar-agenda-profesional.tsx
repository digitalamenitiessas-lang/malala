"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "./field";
import { updateProfesionalAgenda } from "@/lib/data/profesionales-agenda";

interface Props {
  agendaId: string;
  especialidad: string;
  color: string;
  prioridad: number;
}

/**
 * Corregir la agenda ya creada. Antes esto no existía: una especialidad mal
 * escrita o dos profesionales con el mismo color quedaban así para siempre.
 */
export function EditarAgendaProfesional({
  agendaId,
  especialidad,
  color,
  prioridad,
}: Props) {
  const { pending, run } = useTransitionFeedback();
  const [abierto, setAbierto] = useState(false);
  const [esp, setEsp] = useState(especialidad);
  const [col, setCol] = useState(color);
  const [pri, setPri] = useState(prioridad);
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    const fd = new FormData();
    fd.set("especialidad", esp);
    fd.set("color", col);
    fd.set("prioridad", String(pri));
    run(
      async () => {
        const res = await updateProfesionalAgenda(agendaId, fd);
        if (!res.ok) setError(Object.values(res.errors).flat().join(" "));
        else setAbierto(false);
        return res;
      },
      { refreshOnSuccess: true, successMessage: "Agenda actualizada" },
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5 stroke-[1.5]" />
        Editar
      </button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-md border border-border bg-cream/30 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="space-y-1">
          <label
            htmlFor={`esp-${agendaId}`}
            className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Especialidad
          </label>
          <input
            id={`esp-${agendaId}`}
            type="text"
            value={esp}
            onChange={(e) => setEsp(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor={`col-${agendaId}`}
            className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Color
          </label>
          <input
            id={`col-${agendaId}`}
            type="color"
            value={col}
            onChange={(e) => setCol(e.target.value)}
            className="h-[34px] w-16 cursor-pointer rounded-md border border-border bg-card"
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor={`pri-${agendaId}`}
            className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Orden
          </label>
          <input
            id={`pri-${agendaId}`}
            type="number"
            min="0"
            step="1"
            value={pri}
            onChange={(e) => setPri(Number(e.target.value))}
            className="w-20 rounded-md border border-border bg-card px-2 py-1.5 text-right tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        El color es con el que se la ve en la agenda. El orden decide en qué
        posición aparece al reservar: primero los más chicos.
      </p>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <LoadingButton
          type="button"
          onClick={guardar}
          pending={pending}
          pendingLabel="Guardando..."
          className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-white transition-colors hover:opacity-90"
        >
          Guardar
        </LoadingButton>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setEsp(especialidad);
            setCol(color);
            setPri(prioridad);
            setError(null);
          }}
          className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
