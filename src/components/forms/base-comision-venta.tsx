"use client";

import { useState } from "react";
import { Scale } from "lucide-react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "./field";
import { cambiarBaseComisionVenta } from "@/lib/data/ingresos-actions";
import { formatARS } from "@/lib/utils";

interface Props {
  ingresoId: string;
  /** Comisión total del equipo si sale de lo que realmente se cobró. */
  totalSobreCobrado: number;
  /** Comisión total del equipo si el descuento del ticket no le pega. */
  totalSinDescuento: number;
  /** Cómo está calculada hoy esta venta. */
  sobreLoCobrado: boolean;
  anulado: boolean;
}

/**
 * Excepción al criterio de comisiones de una venta puntual.
 *
 * La regla del salón es una sola —la comisión sale de lo que se cobró— y por eso
 * el mostrador ya no pregunta: alcanzaba con olvidarse de tocar un botón para
 * que una comisión saliera distinta a todas las demás, y eso recién se notaba al
 * liquidar. Pero una o dos veces al año deciden lo contrario para una venta, y
 * eso tiene que poder hacerse sin anular y recargar.
 *
 * Va acá, en el ticket ya guardado, y no en el formulario de venta: se elige
 * mirando el ticket entero, con los dos montos a la vista, sin la clienta
 * esperando. Los montos se muestran en pesos a propósito — "absorbe el
 * descuento" se entiende al revés la mitad de las veces, pero $13.800 y $16.860
 * no se prestan a confusión.
 */
export function BaseComisionVenta({
  ingresoId,
  totalSobreCobrado,
  totalSinDescuento,
  sobreLoCobrado,
  anulado,
}: Props) {
  const { pending, run } = useTransitionFeedback();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (anulado) return null;

  const diferencia = totalSinDescuento - totalSobreCobrado;

  function cambiar(aSobreLoCobrado: boolean) {
    setError(null);
    run(
      async () => {
        const res = await cambiarBaseComisionVenta(ingresoId, aSobreLoCobrado);
        if (!res.ok) setError(Object.values(res.errors).flat().join(" "));
        return res;
      },
      { refreshOnSuccess: true, successMessage: "Comisiones recalculadas" },
    );
  }

  return (
    <section className="space-y-3">
      {!abierto ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-xs text-muted-foreground">
            {sobreLoCobrado
              ? "Las comisiones de esta venta salen de lo que se cobró, como siempre."
              : "Ojo: en esta venta el descuento no les baja la comisión a las chicas."}
          </p>
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-brown-700 underline underline-offset-2 transition-colors hover:text-primary"
          >
            <Scale className="h-3.5 w-3.5 stroke-[1.5]" />
            Cambiar
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-md border border-border bg-cream/40 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Sobre qué precio se calculan las comisiones de esta venta
            </p>
            <p className="text-xs text-muted-foreground">
              Esta venta tiene descuento, así que los dos criterios dan
              distinto. Cambiarlo afecta sólo a esta venta.
            </p>
          </div>

          <div className="space-y-2">
            <OpcionBase
              titulo="Sobre lo que se cobró"
              detalle="El descuento lo absorbe la empleada. Es lo que hace el salón siempre."
              monto={totalSobreCobrado}
              activa={sobreLoCobrado}
              pending={pending}
              onSelect={() => cambiar(true)}
            />
            <OpcionBase
              titulo="Sin descontarles el descuento"
              detalle="El descuento lo pone el local: la empleada cobra sobre el precio del servicio, como si no hubiera habido descuento."
              monto={totalSinDescuento}
              activa={!sobreLoCobrado}
              pending={pending}
              onSelect={() => cambiar(false)}
            />
          </div>

          <p className="text-xs text-muted-foreground tabular-nums">
            Son {formatARS(Math.abs(diferencia))} de diferencia para el equipo.
          </p>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              setError(null);
            }}
            className="rounded-md border border-border px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors hover:bg-cream"
          >
            Cerrar
          </button>
        </div>
      )}
    </section>
  );
}

function OpcionBase({
  titulo,
  detalle,
  monto,
  activa,
  pending,
  onSelect,
}: {
  titulo: string;
  detalle: string;
  monto: number;
  activa: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-md border p-3 ${
        activa ? "border-primary bg-card" : "border-border bg-card/60"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {titulo}
          {activa && (
            <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-primary">
              Así está
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{detalle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <p className="font-display text-lg tabular-nums">{formatARS(monto)}</p>
        {!activa && (
          <LoadingButton
            type="button"
            onClick={onSelect}
            pending={pending}
            pendingLabel="..."
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
          >
            Usar
          </LoadingButton>
        )}
      </div>
    </div>
  );
}
