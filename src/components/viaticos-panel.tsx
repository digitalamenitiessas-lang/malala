"use client";

import { useState } from "react";
import { Sandwich, Plus, Trash2 } from "lucide-react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { CurrencyInput } from "@/components/forms/currency-input";
import { LoadingButton } from "@/components/forms/field";
import { formatARS } from "@/lib/utils";
import { borrarViatico, registrarViatico, type Viatico } from "@/lib/data/viaticos";
import { hoyAr } from "@/lib/fecha-ar";
import type { MedioPago } from "@/lib/types";

interface Props {
  empleadoId: string;
  empleadoNombre: string;
  viaticos: Viatico[];
  mediosPago: MedioPago[];
}

function fmtFecha(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export function ViaticosPanel({
  empleadoId,
  empleadoNombre,
  viaticos,
  mediosPago,
}: Props) {
  const { pending, run } = useTransitionFeedback();
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoyAr());
  const [monto, setMonto] = useState(0);
  const [pagado, setPagado] = useState(true);
  const [mpId, setMpId] = useState(mediosPago[0]?.id ?? "");
  const [observacion, setObservacion] = useState("");

  const pendientes = viaticos.filter((v) => !v.liquidacion_id);
  const totalPendiente = pendientes.reduce((s, v) => s + v.monto, 0);
  const aPagarEnLiquidacion = pendientes
    .filter((v) => !v.pagado)
    .reduce((s, v) => s + v.monto, 0);

  function reset() {
    setAbierto(false);
    setFecha(hoyAr());
    setMonto(0);
    setPagado(true);
    setObservacion("");
    setError(null);
  }

  function handleRegistrar() {
    setError(null);
    if (monto <= 0) {
      setError("El monto tiene que ser mayor a 0");
      return;
    }
    if (pagado && !mpId) {
      setError("Decí con qué se le dio la plata");
      return;
    }

    const fd = new FormData();
    fd.set("empleado_id", empleadoId);
    fd.set("fecha", fecha);
    fd.set("monto", String(monto));
    if (pagado) {
      fd.set("pagado", "on");
      fd.set("mp_id", mpId);
    }
    fd.set("observacion", observacion);

    run(
      async () => {
        const res = await registrarViatico(fd);
        if (!res.ok) setError(Object.values(res.errors).flat().join(", "));
        return res;
      },
      {
        refreshOnSuccess: true,
        successMessage: "Viático cargado",
        onSuccess: () => reset(),
      },
    );
  }

  function handleBorrar(v: Viatico) {
    setError(null);
    // Borrar uno ya entregado saca plata de la caja del día: se avisa antes.
    if (
      v.pagado &&
      !window.confirm(
        `Este viático ya se había entregado. Al borrarlo se elimina también el gasto de ${formatARS(v.monto)} y su movimiento de caja. ¿Seguimos?`,
      )
    ) {
      return;
    }
    const id = v.id;
    run(
      async () => {
        const res = await borrarViatico(id);
        if (!res.ok) setError(Object.values(res.errors).flat().join(", "));
        return res;
      },
      { refreshOnSuccess: true, successMessage: "Viático borrado" },
    );
  }

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sandwich
            className="h-5 w-5 stroke-[1.5]"
            style={{ color: "var(--sage-700)" }}
          />
          <h2 className="font-display text-xl tracking-[0.15em] uppercase">
            Viáticos
          </h2>
        </div>
        {!abierto && (
          <button
            type="button"
            onClick={() => {
              reset();
              setAbierto(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-sage-700 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-white transition-colors hover:bg-sage-900"
          >
            <Plus className="h-3.5 w-3.5 stroke-[1.5]" />
            Cargar viático
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Sin liquidar
          </p>
          <p className="mt-1 font-display text-2xl tabular-nums">
            {formatARS(totalPendiente)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {pendientes.length} día{pendientes.length !== 1 ? "s" : ""} · entra en
            la próxima liquidación
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            De eso, falta darle
          </p>
          <p className="mt-1 font-display text-2xl tabular-nums">
            {formatARS(aPagarEnLiquidacion)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lo demás ya se le entregó y no se vuelve a pagar
          </p>
        </div>
      </div>

      {abierto && (
        <div className="space-y-4 rounded-md border border-border bg-card p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="viatico-fecha"
                className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Día
              </label>
              {/* Sin tope superior a propósito: las encargadas arman la
                  liquidación desde el principio de la semana y necesitan dejar
                  cargados los días que todavía no pasaron. */}
              <input
                id="viatico-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                El día que le toca. Podés dejar cargada toda la semana por
                adelantado.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Monto
              </label>
              <CurrencyInput
                value={monto}
                onChange={setMonto}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pagado}
              onChange={(e) => setPagado(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-sage-500"
            />
            Ya se lo di
          </label>

          {pagado ? (
            <div className="space-y-1.5">
              <label
                htmlFor="viatico-mp"
                className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Con qué
              </label>
              {mediosPago.length === 0 ? (
                <p className="text-xs text-destructive">
                  Esta sucursal no tiene medios de pago cargados.
                </p>
              ) : (
                <select
                  id="viatico-mp"
                  value={mpId}
                  onChange={(e) => setMpId(e.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {mediosPago.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-muted-foreground">
                Sale de la caja ahora como gasto, y en la liquidación figura como
                ya entregado. Necesita la caja del día abierta.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No sale plata ahora: se le paga junto con la liquidación.
            </p>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="viatico-obs"
              className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Observación
            </label>
            <input
              id="viatico-obs"
              type="text"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <LoadingButton
              type="button"
              onClick={handleRegistrar}
              pending={pending}
              pendingLabel="Guardando..."
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
            >
              Cargar viático
            </LoadingButton>
            <button
              type="button"
              onClick={reset}
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {viaticos.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {empleadoNombre} no tiene viáticos cargados.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
          {viaticos.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <span className="tabular-nums">{fmtFecha(v.fecha)}</span>
                {v.observacion && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {v.observacion}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {v.pagado && (
                  <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-stone-500">
                    ya entregado
                  </span>
                )}
                {v.liquidacion_id && (
                  <span className="rounded bg-sage-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-sage-900">
                    liquidado
                  </span>
                )}
                <span className="tabular-nums">{formatARS(v.monto)}</span>
                {/* Se puede borrar todo lo que no esté liquidado. Si ya se
                    había pagado, el servidor deshace también el gasto y el
                    movimiento de caja. */}
                {!v.liquidacion_id && (
                  <button
                    type="button"
                    onClick={() => handleBorrar(v)}
                    disabled={pending}
                    aria-label={`Borrar viático del ${fmtFecha(v.fecha)}`}
                    className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4 stroke-[1.5]" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
