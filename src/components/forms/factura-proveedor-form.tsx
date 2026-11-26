"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useActionStateFeedback } from "@/components/feedback/action-feedback";
import { CurrencyField, Field, FormButtons, GlobalError, SelectField } from "./field";
import { CurrencyInput } from "./currency-input";
import { formatARS } from "@/lib/utils";
import { planFactura } from "@/lib/factura-proveedor";
import { etiquetaInsumo } from "@/lib/insumo-etiqueta";
import type { Insumo, Proveedor } from "@/lib/types";
import type { FacturaProveedorResult } from "@/lib/data/facturas-proveedor";

interface Linea {
  key: number;
  insumoId: string;
  cantidad: number;
  valor: number;
}

interface Props {
  sucursalId: string;
  proveedores: Proveedor[];
  insumos: Insumo[];
  defaultFecha: string;
  defaultProveedorId?: string;
  action: (state: FacturaProveedorResult | null, formData: FormData) => Promise<FacturaProveedorResult>;
}

const UNIDAD_LABEL: Record<string, string> = { ud: "ud", ml: "ml", g: "g", aplicacion: "apl." };

let siguienteKey = 1;
const lineaVacia = (): Linea => ({ key: siguienteKey++, insumoId: "", cantidad: 1, valor: 0 });

export function FacturaProveedorForm({
  sucursalId,
  proveedores,
  insumos,
  defaultFecha,
  defaultProveedorId,
  action,
}: Props) {
  const [proveedorId, setProveedorId] = useState(defaultProveedorId ?? "");
  const [total, setTotal] = useState(0);
  // Controlados: si la carga vuelve con un error, no se pierde lo tipeado.
  const [fecha, setFecha] = useState(defaultFecha);
  const [comprobante, setComprobante] = useState("");
  const [lineas, setLineas] = useState<Linea[]>(() => [lineaVacia()]);
  const [actualizarCosto, setActualizarCosto] = useState(true);

  const activos = useMemo(() => insumos.filter((i) => i.activo), [insumos]);
  const delProveedor = useMemo(
    () => activos.filter((i) => proveedorId && i.proveedor_ids?.includes(proveedorId)),
    [activos, proveedorId],
  );
  const otros = useMemo(
    () => activos.filter((i) => !delProveedor.includes(i)),
    [activos, delProveedor],
  );

  const sumaLineas = lineas.reduce((s, l) => s + (l.valor || 0), 0);
  const diferencia = Math.round((total - sumaLineas) * 100) / 100;
  const plan = planFactura(
    total,
    lineas.map((l) => ({ insumoId: l.insumoId, cantidad: l.cantidad, valor: l.valor })),
  );

  const [state, formAction, pending] = useActionStateFeedback<FacturaProveedorResult>(action, {
    redirectTo: (r) => (r.ok ? `/catalogos/proveedores/${r.proveedorId}` : "/egresos"),
    recargar: true,
    successMessage: "Factura cargada",
  });
  const errors = state && !state.ok ? state.errors : {};

  const cambiar = (key: number, cambio: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...cambio } : l)));

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="sucursal_id" value={sucursalId} />
      <input
        type="hidden"
        name="lineas"
        value={JSON.stringify(lineas.map(({ insumoId, cantidad, valor }) => ({ insumoId, cantidad, valor })))}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Proveedor"
          name="proveedor_id"
          value={proveedorId}
          onChange={(e) => setProveedorId(e.currentTarget.value)}
          error={errors.proveedor_id}
          options={proveedores.map((p) => ({ value: p.id, label: p.nombre }))}
          placeholder="Elegí el proveedor"
          required
        />
        <Field
          label="Fecha"
          name="fecha"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.currentTarget.value)}
          required
        />
        <Field
          label="Número de factura"
          name="comprobante"
          value={comprobante}
          onChange={(e) => setComprobante(e.currentTarget.value)}
          placeholder="0070-00436916"
          error={errors.comprobante}
          required
        />
        <CurrencyField
          label="Total de la factura (con IVA)"
          name="total"
          value={total}
          onChange={setTotal}
          error={errors.total}
          hint="El total final de la factura. Si es compartida con la otra sucursal, sólo su parte con impuestos."
          required
        />
      </div>

      <section className="space-y-3 rounded-md border border-border bg-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Productos de la factura
          </h2>
          <p className="text-xs text-muted-foreground">Importe de cada línea sin IVA, como en la factura</p>
        </div>

        <div className="space-y-3">
          {lineas.map((l, i) => {
            const insumo = activos.find((x) => x.id === l.insumoId);
            return (
              <div
                key={l.key}
                className="grid grid-cols-[1fr_5rem_8rem_2rem] items-end gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0"
              >
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    Producto {i + 1}
                  </label>
                  <select
                    value={l.insumoId}
                    onChange={(e) => cambiar(l.key, { insumoId: e.target.value })}
                    required
                    className="w-full rounded-md border border-border bg-card px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Elegí el producto</option>
                    {delProveedor.length > 0 && (
                      <optgroup label="De este proveedor">
                        {delProveedor.map((x) => (
                          <option key={x.id} value={x.id}>
                            {etiquetaInsumo(x)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label={delProveedor.length > 0 ? "Otros productos" : "Productos"}>
                      {otros.map((x) => (
                        <option key={x.id} value={x.id}>
                          {etiquetaInsumo(x)}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  {insumo && (
                    <p className="text-[10px] text-muted-foreground">
                      Envase de {insumo.tamano_envase} {UNIDAD_LABEL[insumo.unidad_medida] ?? insumo.unidad_medida}
                      {plan.ok && plan.plan.precioEnvase[i] > 0 && (
                        <> · queda a {formatARS(plan.plan.precioEnvase[i])} el envase con IVA</>
                      )}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    Envases
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={l.cantidad || ""}
                    onChange={(e) => cambiar(l.key, { cantidad: Number(e.target.value) })}
                    required
                    className="w-full rounded-md border border-border bg-card px-2 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    Importe
                  </label>
                  <CurrencyInput
                    value={l.valor}
                    onChange={(v) => cambiar(l.key, { valor: v })}
                    min={0}
                    required
                    className="w-full rounded-md border border-border bg-card px-2 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
                  disabled={lineas.length === 1}
                  aria-label={`Quitar producto ${i + 1}`}
                  className="mb-1 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-cream hover:text-foreground disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4 stroke-[1.5]" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setLineas((ls) => [...ls, lineaVacia()])}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wider hover:bg-cream"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar producto
        </button>
        {errors.lineas && <p className="text-xs text-destructive">{errors.lineas.join(" · ")}</p>}
      </section>

      {/* El resumen es lo que después se le puede mostrar al proveedor: la
          deuda queda igual a la factura, y la diferencia se ve con nombre. */}
      <section className="space-y-1.5 rounded-md border border-border bg-cream/30 p-4 text-sm tabular-nums">
        <div className="flex justify-between">
          <span>Productos</span>
          <span>{formatARS(sumaLineas)}</span>
        </div>
        <div className="flex justify-between">
          <span>IVA, percepciones y otros</span>
          <span className={diferencia < 0 ? "text-destructive" : undefined}>{formatARS(diferencia)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5 font-medium">
          <span>Queda a pagarle al proveedor</span>
          <span>{formatARS(total)}</span>
        </div>
        {diferencia < 0 && (
          <p className="text-xs text-destructive">
            Los productos suman más que el total de la factura. Revisá los importes.
          </p>
        )}
      </section>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="actualizar_costo"
          checked={actualizarCosto}
          onChange={(e) => setActualizarCosto(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-sage-500"
        />
        <span>
          Actualizar el costo de estos productos
          <span className="block text-xs text-muted-foreground">
            Con el precio de esta factura, IVA incluido. Es el costo que usan las recetas.
          </span>
        </span>
      </label>

      {errors.factura_repetida && (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="text-destructive">{errors.factura_repetida.join(" ")}</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="cargar_igual" className="h-4 w-4 rounded border-border" />
            Es otra factura, cargarla igual
          </label>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        La factura queda a pagar en la cuenta del proveedor. Cuando la paguen (cheque, transferencia,
        efectivo), cárguenlo desde el proveedor con <strong>Registrar pago</strong>.
      </p>

      <GlobalError error={errors._} />

      <FormButtons cancelHref="/egresos" submitLabel="Cargar factura" pending={pending} />
    </form>
  );
}
