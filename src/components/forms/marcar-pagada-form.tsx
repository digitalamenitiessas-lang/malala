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
  /** Dia en que se pago de verdad. Vacio = ahora. */
  const [fecha, setFecha] = useState("");
  /**
   * Cuánto se entrega por cada medio. SE SUMAN.
   *
   * Antes se pedía el total y, aparte, cuánto de ese total iba por el segundo
   * medio: el primero era el resto. Es la convención inversa a la de ventas,
   * donde los dos montos suman el ticket, y la gente aplicó la que ya conocía.
   * Jo cargó $700.000 en "Cuánto se paga" creyendo que era el efectivo y
   * $329.080 en transferencia, sobre un total de $1.029.080: el sistema
   * entendió que había pagado $700.000 repartidos, le dejó un arrastre
   * fantasma de $329.080 y la caja del sábado $329.080 de más. Le pasó lo
   * mismo a Valentina en Centro la misma semana. Dos pantallas que piden dos
   * montos tienen que sumarlos igual.
   *
   * Redondean para los dos lados, según lo que haya en el cajón: "si me dice
   * $153.760 yo pago $154.000. Así muchas veces. Y también a la inversa: si no
   * tengo los $3.000 pago $150.000". Por eso la suma puede no dar el total y
   * la diferencia, para cualquier lado, cae en la liquidación siguiente.
   */
  // Con total negativo (los descuentos superaron lo que cobró) no hay nada que
  // entregarle: arranca en cero y no en un número negativo en el campo.
  const [monto1Input, setMonto1Input] = useState(Math.max(totalPagar, 0));
  const [monto2Input, setMonto2Input] = useState(0);

  const monto1 = Math.max(monto1Input, 0);
  const monto2 = mp2Id ? Math.max(monto2Input, 0) : 0;
  const aPagar = monto1 + monto2;
  /** Positivo: el salón le queda debiendo. Negativo: ella queda debiendo. */
  const quedaAFavor = totalPagar - aPagar;
  /** Los descuentos superaron lo que cobró: ella debe, no se le entrega nada. */
  const totalNegativo = totalPagar < -0.01;
  // Para el aviso de "queda debiendo": con total negativo no es que se le dé
  // de más, es que ya debía.
  const mensajeDebe = totalNegativo
    ? `Queda debiendo ${formatARS(-quedaAFavor)}: se le descuenta sola de la próxima liquidación.`
    : `Le estás dando ${formatARS(-quedaAFavor)} de más: se le descuentan solos de la próxima liquidación.`;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mp2Id && !(monto2 > 0)) {
      setError("Poné cuánto se paga con el segundo medio");
      return;
    }
    // El 0 ahora se toma como un 0 (hace falta para el total negativo), así
    // que un campo borrado con sueldo a cobrar se frena acá y no pasa todo el
    // sueldo a la semana que viene.
    if (totalPagar > 0.01 && aPagar <= 0.01) {
      setError(
        "Poné cuánto le das. Si todavía no se le paga, dejá la liquidación pendiente.",
      );
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
      {totalNegativo && (
        <p className="rounded-md border border-border bg-muted/40 p-2.5 text-[11px] text-brown-700">
          Los descuentos superan lo que cobró: no hay nada que entregarle. Al
          marcarla pagada, los {formatARS(-totalPagar)} que debe pasan solos a
          la próxima liquidación.
        </p>
      )}
      {/* Redondean para los dos lados segun lo que haya en el cajon, asi que
          la suma puede dar más o menos que el total. La diferencia, para
          cualquier lado, entra sola en la liquidación siguiente. */}
      <div className="space-y-1.5">
        <label
          htmlFor="liq-total-pagado"
          className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          {mp2Id
            ? `Cuánto se paga con ${mediosPago.find((m) => m.id === mpId)?.codigo ?? "el 1°"}`
            : "Cuánto se paga"}
        </label>
        <input
          id="liq-total-pagado"
          type="number"
          min={0}
          step={1}
          value={monto1Input || ""}
          onChange={(e) => setMonto1Input(Number(e.target.value) || 0)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-right text-sm tabular-nums"
        />
        {!mp2Id &&
          (quedaAFavor > 0.01 ? (
            <p className="text-[11px] tabular-nums text-brown-700">
              Quedan {formatARS(quedaAFavor)} a favor de ella: se le suman solos
              a la próxima liquidación.
            </p>
          ) : quedaAFavor < -0.01 ? (
            <p className="text-[11px] tabular-nums text-brown-700">
              {mensajeDebe}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              El total es {formatARS(totalPagar)}. Si redondeás, para arriba o
              para abajo, poné acá lo que le das.
            </p>
          ))}
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
            if (!e.target.value) setMonto2Input(0);
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
              step={1}
              value={monto2Input || ""}
              onChange={(e) => setMonto2Input(Number(e.target.value) || 0)}
              placeholder={`Cuánto se paga con ${mediosPago.find((m) => m.id === mp2Id)?.codigo ?? "este medio"}`}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-right text-sm tabular-nums"
            />
            {/* La suma, grande y arriba de todo. Es el numero que antes no
                estaba y por el que dos liquidaciones salieron mal: hay que
                poder confirmar de un vistazo que los dos montos dan el sueldo. */}
            <div className="rounded-md border border-border bg-muted/40 p-2.5 space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Total que se le entrega
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatARS(aPagar)}
                </span>
              </div>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {mediosPago.find((m) => m.id === mpId)?.codigo}{" "}
                {formatARS(monto1)} +{" "}
                {mediosPago.find((m) => m.id === mp2Id)?.codigo}{" "}
                {formatARS(monto2)}
              </p>
              {quedaAFavor > 0.01 ? (
                <p className="text-[11px] tabular-nums text-brown-700">
                  El sueldo es {formatARS(totalPagar)}: quedan{" "}
                  {formatARS(quedaAFavor)} a favor de ella, que se le suman
                  solos a la próxima liquidación.
                </p>
              ) : quedaAFavor < -0.01 ? (
                <p className="text-[11px] tabular-nums text-brown-700">
                  El sueldo es {formatARS(totalPagar)}. {mensajeDebe}
                </p>
              ) : (
                <p className="text-[11px] text-sage-800">
                  Coincide con el sueldo. No queda nada pendiente.
                </p>
              )}
            </div>
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
