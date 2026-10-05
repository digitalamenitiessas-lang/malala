"use client";

import { useState } from "react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "./field";
import { CurrencyInput } from "./currency-input";
import { registrarIngresoManual } from "@/lib/data/cuentas-bancarias";
import { hoyAr } from "@/lib/fecha-ar";
import type { CuentaBancaria, Sucursal } from "@/lib/types";

/**
 * Plata que entra y no es una venta.
 *
 * El salón cobra cosas que no pasan por la caja de ventas: una comisión por
 * maquillajes que le transfieren, plata que alguien devuelve, un aporte. Antes
 * la única forma de que la caja subiera era una venta o un ajuste de apertura,
 * así que esto se cargaba falseando el ajuste y el motivo se perdía.
 */
export function IngresoManualForm({
  cuentas,
  sucursales,
}: {
  cuentas: CuentaBancaria[];
  sucursales: Sucursal[];
}) {
  const { pending, run } = useTransitionFeedback();
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "");
  const [monto, setMonto] = useState(0);
  const [concepto, setConcepto] = useState("");
  const [fecha, setFecha] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nombreSucursal = (id: string) =>
    sucursales.find((s) => s.id === id)?.nombre.replace("Malala ", "") ?? "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("cuenta_id", cuentaId);
    fd.set("monto", String(monto));
    fd.set("concepto", concepto);
    fd.set("fecha", fecha);
    run(
      async () => {
        const res = await registrarIngresoManual(fd);
        if (!res.ok) {
          setError(Object.values(res.errors).flat().join(", ") || "Error");
        } else {
          setMonto(0);
          setConcepto("");
          setFecha("");
        }
        return res;
      },
      { refreshOnSuccess: true, successMessage: "Ingreso registrado" },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-border bg-card p-5 space-y-3"
    >
      <div>
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Registrar un ingreso
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Plata que entra y no es una venta: una comisión que les transfieren,
          algo que les devuelven, un aporte. Si entró en efectivo, elegí Caja
          Efectivo. No factura ni genera comisión.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            A qué cuenta
          </label>
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {nombreSucursal(c.sucursal_id)} · {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Monto
          </label>
          <CurrencyInput
            value={monto}
            min={0}
            onChange={setMonto}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-right text-sm tabular-nums"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            De qué es
          </label>
          <input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: comisión de maquillajes del sábado"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Día (opcional)
        </label>
        <input
          type="date"
          value={fecha}
          max={hoyAr()}
          onChange={(e) => setFecha(e.target.value)}
          className="w-full sm:w-56 rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Vacío es hoy. Si la plata entró otro día, poné ese día y va a la caja
          de esa fecha.
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <LoadingButton
        type="submit"
        pending={pending}
        pendingLabel="Guardando..."
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
      >
        Registrar ingreso
      </LoadingButton>
    </form>
  );
}
