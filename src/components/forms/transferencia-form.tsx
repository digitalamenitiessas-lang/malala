"use client";

import { useState } from "react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "./field";
import { CurrencyInput } from "./currency-input";
import { createTransferencia } from "@/lib/data/cuentas-bancarias";
import type { CuentaBancaria, Sucursal } from "@/lib/types";

/**
 * Pasar plata de una cuenta a otra de la misma sucursal: sacar efectivo del
 * banco, depositar la caja.
 *
 * Antes era un form de servidor sin respuesta: guardaba, pero no avisaba ni se
 * vaciaba, y en YB apretaron "Transferir" 19 veces creyendo que no andaba.
 * Ahora avisa, se bloquea mientras guarda y cada envío lleva su id, así que un
 * reintento de la misma carga no la repite.
 */
export function TransferenciaForm({
  cuentas,
  sucursales,
}: {
  cuentas: CuentaBancaria[];
  sucursales: Sucursal[];
}) {
  const cuentasBySucursal = new Map<string, CuentaBancaria[]>();
  for (const c of cuentas) {
    const list = cuentasBySucursal.get(c.sucursal_id) ?? [];
    list.push(c);
    cuentasBySucursal.set(c.sucursal_id, list);
  }
  const conTransferencia = sucursales.filter(
    (s) => (cuentasBySucursal.get(s.id)?.length ?? 0) >= 2,
  );
  if (conTransferencia.length === 0) return null;

  return (
    <section className="bg-card border border-border rounded-md p-5 space-y-4">
      <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
        Transferir entre cuentas (misma sucursal)
      </h2>
      {conTransferencia.map((s) => (
        <TransferenciaSucursal
          key={s.id}
          nombre={s.nombre}
          cuentas={cuentasBySucursal.get(s.id) ?? []}
        />
      ))}
    </section>
  );
}

function TransferenciaSucursal({
  nombre,
  cuentas,
}: {
  nombre: string;
  cuentas: CuentaBancaria[];
}) {
  const { pending, run } = useTransitionFeedback();
  const [origenId, setOrigenId] = useState(cuentas[0]?.id ?? "");
  const [destinoId, setDestinoId] = useState(cuentas[1]?.id ?? "");
  const [monto, setMonto] = useState(0);
  const [descripcion, setDescripcion] = useState("");
  const [envioId, setEnvioId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("cuenta_origen_id", origenId);
    fd.set("cuenta_destino_id", destinoId);
    fd.set("monto", String(monto));
    fd.set("descripcion", descripcion);
    fd.set("envio_id", envioId);
    run(
      async () => {
        const res = await createTransferencia(fd);
        if (!res.ok) {
          setError(Object.values(res.errors).flat().join(", ") || "Error");
        } else {
          setMonto(0);
          setDescripcion("");
          // La próxima es otra transferencia.
          setEnvioId(crypto.randomUUID());
        }
        return res;
      },
      { refreshOnSuccess: true, successMessage: "Transferencia registrada" },
    );
  }

  const selectClass =
    "w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const labelClass =
    "block text-xs font-medium uppercase tracking-wider text-muted-foreground";

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end border-t border-border pt-4 first-of-type:border-t-0 first-of-type:pt-0"
    >
      <div className="sm:col-span-6 text-xs uppercase tracking-wider text-muted-foreground">
        {nombre}
      </div>
      <div className="space-y-1.5">
        <label className={labelClass}>Desde</label>
        <select value={origenId} onChange={(e) => setOrigenId(e.target.value)} className={selectClass}>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className={labelClass}>Hacia</label>
        <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} className={selectClass}>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className={labelClass}>Monto</label>
        <CurrencyInput
          value={monto}
          min={0}
          onChange={setMonto}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-right text-sm tabular-nums"
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <label className={labelClass}>Detalle</label>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Opcional"
          className={selectClass}
        />
      </div>
      <LoadingButton
        type="submit"
        pending={pending}
        pendingLabel="Transfiriendo..."
        className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors"
      >
        Transferir
      </LoadingButton>
      {error && <p className="sm:col-span-6 text-xs text-destructive">{error}</p>}
    </form>
  );
}
