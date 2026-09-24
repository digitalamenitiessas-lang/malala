"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useActionStateFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "./field";
import { CurrencyInput } from "./currency-input";
import type { Insumo, MedioPago, Proveedor, Sucursal } from "@/lib/types";
import { registrarCompraInsumo } from "@/lib/data/insumos";
import type { CreateEgresoResult } from "@/lib/data/egresos";
import { formatARS } from "@/lib/utils";

interface Props {
  insumo: Insumo;
  proveedores: Proveedor[];
  sucursales: Sucursal[];
  mediosPago: MedioPago[];
  defaultSucursalId: string;
  triggerLabel?: string;
}

const UNIDAD_LABEL: Record<string, string> = {
  ud: "ud",
  ml: "ml",
  g: "g",
  aplicacion: "apl.",
};

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RegistrarCompraInsumoModal({
  insumo,
  proveedores,
  sucursales,
  mediosPago,
  defaultSucursalId,
  triggerLabel = "Registrar compra",
}: Props) {
  const [open, setOpen] = useState(false);
  const [sucursalId, setSucursalId] = useState(defaultSucursalId);
  const [cantidad, setCantidad] = useState<number>(1);
  const [valor, setValor] = useState<number>(0);
  const [pagado, setPagado] = useState(true);

  const mediosVisibles = useMemo(
    () => mediosPago.filter((medio) => medio.sucursal_id === sucursalId && medio.activo),
    [mediosPago, sucursalId],
  );

  const [state, formAction, pending] = useActionStateFeedback<
    CreateEgresoResult
  >(registrarCompraInsumo, {
    refreshOnSuccess: true,
    successMessage: "Compra registrada",
    onSuccess: () => {
      setOpen(false);
      setCantidad(1);
      setValor(0);
    },
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, pending]);

  const errors = state && !state.ok ? state.errors : {};
  const precioUnitarioCalc = cantidad > 0 && valor > 0 ? valor / cantidad : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs uppercase tracking-wider text-sage-700 hover:text-sage-900"
      >
        {triggerLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-lg space-y-4 rounded-md border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg tracking-[0.15em] uppercase">
                  Registrar compra
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {insumo.nombre}
                  {proveedores.length === 1
                    ? ` · ${proveedores[0].nombre}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 stroke-[1.5]" />
              </button>
            </div>

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="insumo_id" value={insumo.id} />
              {proveedores.length === 1 && (
                <input
                  type="hidden"
                  name="proveedor_id"
                  value={proveedores[0].id}
                />
              )}
              {proveedores.length > 1 && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Proveedor
                  </label>
                  <select
                    name="proveedor_id"
                    defaultValue={proveedores[0].id}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Fecha
                  </label>
                  <input
                    type="date"
                    name="fecha"
                    defaultValue={todayYMD()}
                    required
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Sucursal
                  </label>
                  <select
                    name="sucursal_id"
                    value={sucursalId}
                    onChange={(e) => setSucursalId(e.target.value)}
                    required
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    {sucursales.map((sucursal) => (
                      <option key={sucursal.id} value={sucursal.id}>
                        {sucursal.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Cantidad de envases
                  </label>
                  <input
                    type="number"
                    name="cantidad"
                    min="1"
                    step="1"
                    value={cantidad}
                    onChange={(e) => setCantidad(Number(e.target.value))}
                    required
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Cada envase trae {insumo.tamano_envase}{" "}
                    {UNIDAD_LABEL[insumo.unidad_medida] ?? insumo.unidad_medida}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Monto total pagado
                  </label>
                  <CurrencyInput
                    value={valor}
                    onChange={setValor}
                    min={0}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input type="hidden" name="valor" value={valor} />
                  {precioUnitarioCalc != null && (
                    <p className="text-[10px] tabular-nums text-muted-foreground">
                      Precio por envase: {formatARS(precioUnitarioCalc)}
                    </p>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="pagado"
                  checked={pagado}
                  onChange={(e) => setPagado(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-sage-500"
                />
                <span>Ya está pagado</span>
                <span className="text-xs text-muted-foreground">
                  (sin tildar, queda en la cuenta del proveedor)
                </span>
              </label>

              {/* Con qué se pagó sólo se pregunta si la plata sale ahora. Si la
                  compra queda a pagar todavía no se sabe, y elegir uno de
                  relleno hacía que después, al marcarla pagada, la plata
                  saliera de esa cuenta. */}
              {pagado && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Medio de pago
                  </label>
                  <select
                    name="mp_id"
                    required
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    <option value="">
                      {mediosVisibles.length === 0
                        ? "Carga un medio en esta sucursal"
                        : "Selecciona"}
                    </option>
                    {mediosVisibles.map((medio) => (
                      <option key={medio.id} value={medio.id}>
                        {medio.codigo} - {medio.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Observacion
                </label>
                <textarea
                  name="observacion"
                  rows={2}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {Object.entries(errors).map(([key, value]) => (
                <p key={key} className="text-xs text-destructive">
                  {Array.isArray(value) ? value.join(", ") : String(value)}
                </p>
              ))}

              <div className="flex justify-end gap-2 border-t border-border pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-cream"
                >
                  Cancelar
                </button>
                <LoadingButton
                  type="submit"
                  disabled={cantidad <= 0 || valor <= 0}
                  pending={pending}
                  pendingLabel="Guardando..."
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
                >
                  Registrar compra
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
