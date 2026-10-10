"use client";

import { useState } from "react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "./field";
import { marcarLiquidacionPagada } from "@/lib/data/liquidaciones";
import type { MedioPago } from "@/lib/types";
import { formatARS } from "@/lib/utils";
import { hoyAr } from "@/lib/fecha-ar";

interface Props {
  liquidacionId: string;
  mediosPago: MedioPago[];
  /** Lo que hay que pagar. Se usa para repartirlo entre los dos medios. */
  totalPagar: number;
}

export function MarcarPagadaForm({
  liquidacionId,
  mediosPago,
  totalPagar,
}: Props) {
  const { pending, run } = useTransitionFeedback();
  const efectivo = mediosPago.find((m) => m.codigo === "EF");
  const [mpId, setMpId] = useState(efectivo?.id ?? mediosPago[0]?.id ?? "");
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Segundo medio: parte en efectivo y parte por transferencia. Arranca
  // cerrado porque el caso normal es uno solo.
  const [mp2Id, setMp2Id] = useState("");
  const [valor2, setValor2] = useState(0);
  /** Dia en que se pago de verdad. Vacio = ahora. */
  const [fecha, setFecha] = useState("");
  /**
   * Cuánto se le entrega de verdad. Arranca en el total, que es lo normal.
   *
   * Pagan redondeado: "cuando me dice $237.340 una liquidación yo pago
   * $237.000 (esa sobrante no lo pago)". Lo que no se paga queda a favor de la
   * empleada y se suma solo a la liquidación siguiente.
   */
  const [totalPagado, setTotalPagado] = useState(totalPagar);

  const aPagar = Math.min(Math.max(totalPagado, 0), totalPagar);
  const quedaAFavor = totalPagar - aPagar;

  // Sólo se pide cuánto va por el SEGUNDO medio: el total ya está fijado por la
  // liquidación, así que el primero es el resto. Pedir los dos montos dejaría
  // que sumen otra cosa que el sueldo.
  const monto2 = mp2Id ? Math.min(Math.max(valor2, 0), aPagar) : 0;
  const monto1 = aPagar - monto2;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mp2Id && !(monto2 > 0)) {
      setError("Poné cuánto se paga con el segundo medio");
      return;
    }
    const fd = new FormData();
    fd.set("mp_id", mpId);
    fd.set("mp2_id", mp2Id);
    fd.set("valor2", String(monto2));
    fd.set("total_pagado", String(aPagar));
    fd.set("fecha", fecha);
    fd.set("observacion", observacion);
    run(
      async () => {
        const res = await marcarLiquidacionPagada(liquidacionId, fd);
        if (!res.ok) {
          setError(Object.values(res.errors).flat().join(", ") || "Error");
        }
        return res;
      },
      {
        refreshOnSuccess: true,
        successMessage: "Liquidacion marcada como pagada",
      },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border border-border bg-card p-5"
    >
      <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
        Registrar pago
      </h2>
      {/* Pagan redondeado y lo sobrante no se regala: queda a favor para la
          semana siguiente. Antes había que pagar el total exacto. */}
      <div className="space-y-1.5">
        <label
          htmlFor="liq-total-pagado"
          className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Cuánto se paga
        </label>
        <input
          id="liq-total-pagado"
          type="number"
          min={0}
          max={totalPagar}
          step={1}
          value={totalPagado || ""}
          onChange={(e) => setTotalPagado(Number(e.target.value) || 0)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-right text-sm tabular-nums"
        />
        {quedaAFavor > 0.01 ? (
          <p className="text-[11px] tabular-nums text-brown-700">
            Quedan {formatARS(quedaAFavor)} a favor: se le suman solos a la
            próxima liquidación.
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            El total es {formatARS(totalPagar)}. Si le pagás redondeado, poné
            acá lo que le das.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Medio de pago
        </label>
        <select
          value={mpId}
          onChange={(e) => setMpId(e.target.value)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          {mediosPago.map((medio) => (
            <option key={medio.id} value={medio.id}>
              {medio.codigo} - {medio.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Segundo medio (opcional)
        </label>
        <select
          value={mp2Id}
          onChange={(e) => {
            setMp2Id(e.target.value);
            if (!e.target.value) setValor2(0);
          }}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="">— Ninguno —</option>
          {mediosPago
            .filter((m) => m.id !== mpId)
            .map((medio) => (
              <option key={medio.id} value={medio.id}>
                {medio.codigo} - {medio.nombre}
              </option>
            ))}
        </select>
        {mp2Id && (
          <>
            <input
              type="number"
              min={0}
              max={aPagar}
              value={valor2 || ""}
              onChange={(e) => setValor2(Number(e.target.value) || 0)}
              placeholder="Cuánto por este medio"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-right text-sm tabular-nums"
            />
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {mediosPago.find((m) => m.id === mpId)?.codigo}{" "}
              {formatARS(monto1)} · {mediosPago.find((m) => m.id === mp2Id)?.codigo}{" "}
              {formatARS(monto2)}
            </p>
          </>
        )}
      </div>
      {/* El pago se registra después: pagan el sábado y lo cargan el lunes.
          Con la fecha de hoy, la plata sale de la caja de hoy y deja corta la
          del día en que salió de verdad. */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Cuándo se pagó
        </label>
        <input
          type="date"
          value={fecha}
          max={hoyAr()}
          onChange={(e) => setFecha(e.target.value)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          Vacío es hoy. Si la plata salió otro día, poné ese día: tiene que
          tener la caja abierta y sin cerrar.
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Observacion
        </label>
        <textarea
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <LoadingButton
        type="submit"
        pending={pending}
        pendingLabel="Guardando..."
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
      >
        Marcar pagada
      </LoadingButton>
    </form>
  );
}
