"use client";

import { formatYmdAr, hoyAr } from "@/lib/fecha-ar";
import { useState } from "react";
import { Receipt, Plus, AlertTriangle } from "lucide-react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { CurrencyInput } from "@/components/forms/currency-input";
import { LoadingButton } from "@/components/forms/field";
import { formatARS, formatDate } from "@/lib/utils";
import { registrarDescuento, revertirDescuento } from "@/lib/data/descuentos";
import type { Descuento } from "@/lib/types";

interface Props {
  empleadoId: string;
  descuentos: Descuento[];
}

/**
 * Lo que se le cobra a una empleada sin que salga plata de la caja.
 *
 * Es el hermano del panel de anticipos, con una diferencia que importa: acá no
 * hay medio de pago, porque no se le dio nada. "Para muchos items que no salen
 * de la caja hasta el día del pago del sábado".
 */
export function DescuentosPanel({ empleadoId, descuentos }: Props) {
  const { pending, run } = useTransitionFeedback();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState(0);
  const [concepto, setConcepto] = useState("");
  const [observacion, setObservacion] = useState("");
  const [fecha, setFecha] = useState("");
  const [fechaDescuento, setFechaDescuento] = useState("");

  const pendientes = descuentos.filter((d) => !d.liquidacion_id);
  const totalPendiente = pendientes.reduce((sum, d) => sum + d.monto, 0);

  function reset() {
    setAbierto(false);
    setMonto(0);
    setConcepto("");
    setObservacion("");
    setFecha("");
    setFechaDescuento("");
    setError(null);
  }

  function handleRegistrar() {
    setError(null);
    if (monto <= 0) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    if (!concepto.trim()) {
      setError("Poné por qué se le descuenta");
      return;
    }

    const fd = new FormData();
    fd.set("empleado_id", empleadoId);
    fd.set("monto", String(monto));
    fd.set("concepto", concepto);
    fd.set("observacion", observacion);
    if (fecha) fd.set("fecha", fecha);
    if (fechaDescuento) fd.set("fecha_descuento", fechaDescuento);

    run(
      async () => {
        const res = await registrarDescuento(fd);
        if (!res.ok) setError(Object.values(res.errors).flat().join(", "));
        return res;
      },
      {
        refreshOnSuccess: true,
        successMessage: "Descuento cargado",
        onSuccess: () => reset(),
      },
    );
  }

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Receipt
            className="h-5 w-5 stroke-[1.5]"
            style={{ color: "var(--sage-700)" }}
          />
          <h2 className="font-display text-xl tracking-[0.15em] uppercase">
            Descuentos
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
            Cargar descuento
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
          Se descuenta en la próxima liquidación. No sale plata de la caja: es
          lo que se le cobra el día del pago.
        </p>
      </div>

      {abierto && (
        <div className="space-y-3 rounded-md border border-border bg-cream/40 p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Nuevo descuento (no toca la caja)
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
            {/* Obligatorio: un descuento sin motivo es un número que nadie va a
                poder explicar tres semanas después. */}
            <div className="space-y-1.5">
              <label
                htmlFor="descuento-concepto"
                className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Por qué
              </label>
              <input
                id="descuento-concepto"
                type="text"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                maxLength={120}
                placeholder="Ej. Curso, producto que se llevó"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="descuento-fecha"
              className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Cuándo se generó (opcional)
            </label>
            <input
              id="descuento-fecha"
              type="date"
              value={fecha}
              max={hoyAr()}
              onChange={(e) => setFecha(e.currentTarget.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Dejalo vacío si es de hoy.
            </p>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="descuento-fecha-descuento"
              className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Cuándo se le descuenta (opcional)
            </label>
            <input
              id="descuento-fecha-descuento"
              type="date"
              value={fechaDescuento}
              onChange={(e) => setFechaDescuento(e.currentTarget.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Dejalo vacío para descontarlo en la liquidación de esta semana. Si
              acordaron cobrárselo más adelante, poné ese día.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Observación (opcional)
            </label>
            <input
              type="text"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
              Cargar descuento
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
        {descuentos.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Todavía no hay descuentos cargados.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {descuentos.map((d) => {
              const descontado = !!d.liquidacion_id;
              return (
                <li
                  key={d.id}
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
                        {formatDate(d.fecha)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm">{d.concepto}</p>
                    {d.observacion && (
                      <p className="truncate text-xs text-muted-foreground">
                        {d.observacion}
                      </p>
                    )}
                    {d.fecha_descuento && !descontado && (
                      <p className="mt-0.5 text-[11px] text-brown-700">
                        Se descuenta el {formatYmdAr(d.fecha_descuento)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-medium tabular-nums">
                      {formatARS(d.monto)}
                    </span>
                    {/* Uno ya descontado no se saca desde acá: se compensó
                        contra un sueldo y quitarlo dejaría esa liquidación sin
                        explicación. */}
                    {!descontado && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (confirmando !== d.id) {
                            setConfirmando(d.id);
                            return;
                          }
                          setConfirmando(null);
                          run(
                            async () => {
                              const res = await revertirDescuento(d.id);
                              if (!res.ok) {
                                setError(
                                  Object.values(res.errors).flat().join(", "),
                                );
                              }
                              return res;
                            },
                            {
                              refreshOnSuccess: true,
                              successMessage: "Descuento eliminado",
                            },
                          );
                        }}
                        onBlur={() => setConfirmando(null)}
                        className={`rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                          confirmando === d.id
                            ? "border-danger text-danger"
                            : "border-border text-muted-foreground hover:bg-cream"
                        }`}
                      >
                        {confirmando === d.id ? "¿Seguro?" : "Eliminar"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
