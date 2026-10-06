"use client";

import { useState } from "react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "@/components/forms/field";
import { CurrencyInput } from "@/components/forms/currency-input";
import { registrarPagoProveedor } from "@/lib/data/proveedores";
import { hoyAr } from "@/lib/fecha-ar";
import { formatARS } from "@/lib/utils";
import type { MedioPago, Sucursal } from "@/lib/types";

/**
 * Pago a cuenta de un proveedor.
 *
 * El salón nunca paga una factura entera: paga montos sueltos todas las
 * semanas. Antes la única forma de bajar la deuda era marcar una factura como
 * pagada, entera o nada, así que nunca servía.
 */
export function PagoProveedorForm({
  proveedorId,
  deuda,
  mediosPago,
  sucursales,
}: {
  proveedorId: string;
  deuda: number;
  mediosPago: MedioPago[];
  sucursales: Sucursal[];
}) {
  const { pending, run } = useTransitionFeedback();
  const [monto, setMonto] = useState(0);
  const [mpId, setMpId] = useState(mediosPago[0]?.id ?? "");
  const [sucursalId, setSucursalId] = useState(sucursales[0]?.id ?? "");
  const [fecha, setFecha] = useState("");
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState<string | null>(null);

  // El medio define de qué cuenta sale, y la cuenta es de una sucursal: por eso
  // hay que decir cuál cuando hay más de una.
  const mediosDeLaSucursal = mediosPago.filter(
    (m) => m.sucursal_id === sucursalId,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("proveedor_id", proveedorId);
    fd.set("sucursal_id", sucursalId);
    fd.set("mp_id", mpId);
    fd.set("monto", String(monto));
    fd.set("fecha", fecha);
    fd.set("observacion", observacion);
    run(
      async () => {
        const res = await registrarPagoProveedor(fd);
        if (!res.ok) {
          setError(Object.values(res.errors).flat().join(", ") || "Error");
        } else {
          setMonto(0);
          setObservacion("");
          setFecha("");
        }
        return res;
      },
      { refreshOnSuccess: true, successMessage: "Pago registrado" },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-border bg-card p-5 space-y-3"
    >
      <div>
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Registrar un pago
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Un monto a cuenta, no una factura entera. Baja la deuda y sale de la
          cuenta que corresponda al medio de pago.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
        {sucursales.length > 1 && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Sucursal
            </label>
            <select
              value={sucursalId}
              onChange={(e) => {
                setSucursalId(e.target.value);
                setMpId("");
              }}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre.replace("Malala ", "")}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Con qué
          </label>
          <select
            value={mpId}
            onChange={(e) => setMpId(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="">— Elegí —</option>
            {mediosDeLaSucursal.map((m) => (
              <option key={m.id} value={m.id}>
                {m.codigo} — {m.nombre}
              </option>
            ))}
          </select>
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
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Observación
        </label>
        <input
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          placeholder="Ej: a cuenta de las facturas de septiembre"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </div>

      {monto > 0 && (
        <p className="text-[11px] tabular-nums text-muted-foreground">
          Deuda actual {formatARS(deuda)} → queda{" "}
          <strong>{formatARS(deuda - monto)}</strong>
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <LoadingButton
        type="submit"
        pending={pending}
        pendingLabel="Guardando..."
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
      >
        Registrar pago
      </LoadingButton>
    </form>
  );
}
