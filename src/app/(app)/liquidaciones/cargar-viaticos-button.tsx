"use client";

import { useState } from "react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "@/components/forms/field";
import { generarViaticosDeLaSemana } from "@/lib/data/viaticos";

/**
 * Carga los viáticos de toda la semana, para toda la sucursal, de un botón.
 *
 * Antes había que entrar a la ficha de cada chica y cargarlos uno por uno, cada
 * semana, siempre los mismos. Reportado así: "no nos suma en tiempo".
 *
 * Lo que sale de acá es un punto de partida, no la última palabra: si alguna
 * faltó, se le borra ese día desde su ficha antes de liquidar.
 */
export function CargarViaticosButton({
  sucursalId,
  desde,
  hasta,
}: {
  sucursalId: string;
  desde: string;
  hasta: string;
}) {
  const { pending, run } = useTransitionFeedback();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <LoadingButton
        type="button"
        pending={pending}
        pendingLabel="Cargando..."
        onClick={() => {
          setMsg(null);
          run(
            async () => {
              const res = await generarViaticosDeLaSemana({
                sucursalId,
                desde,
                hasta,
              });
              if (!res.ok) {
                setMsg(Object.values(res.errors).flat().join(", "));
                return res;
              }
              setMsg(
                res.creados === 0
                  ? "Ya estaban todos cargados."
                  : `${res.creados} viáticos cargados` +
                      (res.salteados ? ` · ${res.salteados} ya estaban` : ""),
              );
              return res;
            },
            { refreshOnSuccess: true },
          );
        }}
        className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-cream"
      >
        Cargar viáticos de la semana
      </LoadingButton>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
