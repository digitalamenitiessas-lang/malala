"use client";

import { useState } from "react";
import { Wallet, Plus, AlertTriangle } from "lucide-react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { CurrencyInput } from "@/components/forms/currency-input";
import { LoadingButton } from "@/components/forms/field";
import { formatARS, formatDate } from "@/lib/utils";
import { registrarAnticipo } from "@/lib/data/anticipos";
import type { Anticipo, MedioPago } from "@/lib/types";

interface Props {
  empleadoId: string;
  anticipos: Anticipo[];
  mediosPago: MedioPago[];
}

function fmtFecha(iso: string): string {
  return formatDate(iso);
}

export function AnticiposPanel({ empleadoId, anticipos, mediosPago }: Props) {
  const { pending, run } = useTransitionFeedback();
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState(0);
  const [mpId, setMpId] = useState(mediosPago[0]?.id ?? "");
  const [observacion, setObservacion] = useState("");

  const pendientes = anticipos.filter((anticipo) => !anticipo.liquidacion_id);
  const totalPendiente = pendientes.reduce(
    (sum, anticipo) => sum + anticipo.monto,
    0,
  );

  function reset() {
    setAbierto(false);
    setMonto(0);
    setObservacion("");
    setError(null);
  }

  function handleRegistrar() {
    setError(null);
    if (monto <= 0) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    if (!mpId) {
      setError("Elegi un medio de pago");
      return;
    }

    const fd = new FormData();
    fd.set("empleado_id", empleadoId);
    fd.set("monto", String(monto));
    fd.set("mp_id", mpId);
    fd.set("observacion", observacion);

    run(
      async () => {
        const res = await registrarAnticipo(fd);
        if (!res.ok) {
          setError(Object.values(res.errors).flat().join(", "));
        }
        return res;
      },
      {
        refreshOnSuccess: true,
        successMessage: "Anticipo registrado",
        onSuccess: () => reset(),
      },
    );
  }

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 stroke-[1.5]" style={{ color: "var(--sage-700)" }} />
          <h2 className="font-display text-xl tracking-[0.15em] uppercase">
            Anticipos
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
            Registrar anticipo
          </button>
        )}
      </div>

      <div className="rounded-md border border-border bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Pendiente de descontar
        </p>
        <p className="mt-1 font-display text-2xl tabular-nums">
          {formatARS(totalPendiente)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Se descuenta automaticamente en la proxima liquidacion del periodo.
        </p>
      </div>

      {abierto && (
        <div className="space-y-3 rounded-md border border-border bg-cream/40 p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Nuevo anticipo (sale de caja)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Monto
              </label>
              <CurrencyInput
                value={monto}
                onChange={setMonto}
                min={0}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
              />
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
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Observacion (opcional)
            </label>
            <input
              type="text"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ej. Adelanto quincena"
            />
          </div>
          {error && (
            <p className="inline-flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 stroke-[1.5]" />
              {error}
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <LoadingButton
              type="button"
              onClick={handleRegistrar}
              pending={pending}
              pendingLabel="Guardando..."
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
            >
              Registrar anticipo
            </LoadingButton>
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors hover:bg-cream"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && !abierto && (
        <p className="inline-flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 stroke-[1.5]" />
          {error}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Historial
        </p>
        {anticipos.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Todavia no hay anticipos registrados.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {anticipos.map((anticipo) => {
              const descontado = !!anticipo.liquidacion_id;
              return (
                <li
                  key={anticipo.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          descontado
                            ? "bg-sage-100 text-sage-800"
                            : "bg-warning/10 text-brown-700"
                        }`}
                      >
                        {descontado ? "Descontado" : "Pendiente"}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {fmtFecha(anticipo.fecha)}
                      </span>
                    </div>
                    {anticipo.observacion && (
                      <p className="mt-0.5 truncate text-sm">{anticipo.observacion}</p>
                    )}
                  </div>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatARS(anticipo.monto)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
