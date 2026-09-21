"use client";

import { useState } from "react";
import { CrudForm } from "./crud-form";
import { CurrencyInput } from "./currency-input";
import { CheckboxField, CurrencyField, Field, SelectField } from "./field";
import type {
  BloqueCodigoInsumo,
  Insumo,
  MedioPago,
  Proveedor,
  Sucursal,
} from "@/lib/types";
import type { ActionResult } from "@/lib/data/_helpers";

interface Props {
  insumo?: Insumo;
  proveedores: Proveedor[];
  /**
   * Cuando se pasa junto a mediosPago, se muestra la sección opcional
   * "Cargar primera compra" para crear un egreso inicial al guardar.
   */
  sucursales?: Sucursal[];
  mediosPago?: MedioPago[];
  defaultSucursalId?: string;
  /** Numeración actual de la sucursal, para seguir la del salón. */
  bloquesCodigo?: BloqueCodigoInsumo[];
  action: (
    state: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  submitLabel: string;
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const UNIDADES = [
  { value: "ud", label: "Unidad" },
  { value: "ml", label: "Mililitros (ml)" },
  { value: "g", label: "Gramos (g)" },
  { value: "aplicacion", label: "Aplicación" },
];

export function InsumoForm({
  insumo,
  proveedores,
  sucursales,
  mediosPago,
  defaultSucursalId,
  bloquesCodigo = [],
  action,
  submitLabel,
}: Props) {
  const [tipo, setTipo] = useState<"bacha" | "venta">(insumo?.tipo ?? "bacha");
  // Controlado para poder completarlo con un clic desde la numeración.
  const [codigo, setCodigo] = useState(insumo?.codigo ?? "");
  // Los bloques del tipo elegido: al dar de alta una tintura no sirve ver la
  // numeración de la reventa. Si no hay ninguno de ese tipo, se muestran todos.
  const bloquesDelTipo = bloquesCodigo.filter((b) => b.tipo === tipo);
  const bloques = bloquesDelTipo.length > 0 ? bloquesDelTipo : bloquesCodigo;
  const mostrarCompraInicial =
    !insumo &&
    sucursales !== undefined &&
    sucursales.length > 0 &&
    mediosPago !== undefined;
  const [cargarCompra, setCargarCompra] = useState(false);
  const [compraSucursalId, setCompraSucursalId] = useState(
    defaultSucursalId ?? sucursales?.[0]?.id ?? "",
  );
  const [compraCantidad, setCompraCantidad] = useState<number>(1);
  const [compraValor, setCompraValor] = useState<number>(0);
  const [compraPagado, setCompraPagado] = useState(true);
  const mediosDeCompra =
    mediosPago?.filter(
      (m) => m.sucursal_id === compraSucursalId && m.activo,
    ) ?? [];

  return (
    <CrudForm
      action={action}
      redirectTo="/catalogos/insumos"
      submitLabel={submitLabel}
    >
      {(errors) => (
        <>
          <Field
            label="Nombre"
            name="nombre"
            defaultValue={insumo?.nombre}
            error={errors.nombre}
            required
          />
          <Field
            label="Código"
            name="codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            error={errors.codigo}
            maxLength={20}
            placeholder={bloques[0]?.siguiente ?? "INS001"}
            hint="Código de la planilla del salón. Opcional."
            className="uppercase"
          />

          {/* La numeración es del salón, no del sistema: acá solo se le muestra
              cómo viene numerando para que la pueda seguir. Va por bloque y no
              como un único "siguiente código" porque cada bloque es una familia
              — lo que sigue después de INS859 no sirve para una tintura. */}
          {bloques.length > 0 && !insumo && (
            <details className="-mt-2 rounded-md border border-border bg-cream/40 px-3 py-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                ¿Qué código le pongo? Ver cómo viene numerado
              </summary>
              <ul className="mt-2 space-y-1.5">
                {bloques.map((b) => (
                  <li key={b.bloque} className="text-xs">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <strong className="tabular-nums">{b.bloque}</strong>
                      <span className="text-muted-foreground">
                        último <span className="tabular-nums">{b.ultimo}</span>
                      </span>
                      {codigo.trim().toUpperCase() !== b.siguiente && (
                        <button
                          type="button"
                          onClick={() => setCodigo(b.siguiente)}
                          className="tabular-nums underline underline-offset-2 hover:text-foreground"
                        >
                          usar {b.siguiente}
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {b.cantidad} {b.cantidad === 1 ? "producto" : "productos"}
                      {b.ejemplos.length > 0
                        ? ` · ${b.ejemplos.join(", ")}…`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Proveedores
            </label>
            {proveedores.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay proveedores cargados.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border border-border bg-card p-3">
                {proveedores.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="proveedor_ids"
                      value={p.id}
                      defaultChecked={
                        insumo?.proveedor_ids?.includes(p.id) ?? false
                      }
                      className="h-4 w-4 rounded border-border accent-sage-500"
                    />
                    <span>{p.nombre}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              Marcá todos los proveedores a los que les comprás este producto.
            </p>
          </div>
          <SelectField
            label="Unidad de medida"
            name="unidad_medida"
            defaultValue={insumo?.unidad_medida ?? "ml"}
            error={errors.unidad_medida}
            options={UNIDADES}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Tamaño envase"
              name="tamano_envase"
              type="number"
              step="0.01"
              defaultValue={insumo?.tamano_envase}
              error={errors.tamano_envase}
              hint="En la unidad seleccionada"
              required
            />
            <CurrencyField
              label="Precio envase"
              name="precio_envase"
              defaultValue={insumo?.precio_envase}
              error={errors.precio_envase}
              hint="Mayor a 0"
              required
            />
          </div>
          <Field
            label="Umbral stock bajo"
            name="umbral_stock_bajo"
            type="number"
            step="0.01"
            defaultValue={insumo?.umbral_stock_bajo ?? 0}
            error={errors.umbral_stock_bajo}
            hint="Si el stock baja de este valor, se marca como bajo en la pantalla de stock"
            required
          />
          <CheckboxField
            label="Activo"
            name="activo"
            defaultChecked={insumo?.activo ?? true}
          />

          <div className="pt-2 border-t border-border space-y-3">
            <SelectField
              label="Tipo de producto"
              name="tipo"
              defaultValue={tipo}
              onChange={(e) =>
                setTipo(e.currentTarget.value === "venta" ? "venta" : "bacha")
              }
              options={[
                { value: "bacha", label: "Bacha — uso interno (recetas)" },
                { value: "venta", label: "Venta — venta directa al público" },
              ]}
            />
            <p className="text-[11px] text-muted-foreground">
              {tipo === "venta"
                ? "Producto de venta: envase chico que se vende directo. No se usa en recetas."
                : "Producto de bacha: envase grande de uso interno. Solo estos alimentan las recetas."}
            </p>
            {tipo === "venta" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CurrencyField
                  label="Precio de lista"
                  name="precio_venta"
                  defaultValue={insumo?.precio_venta}
                  error={errors.precio_venta}
                  hint="El que se cobra por defecto"
                />
                <CurrencyField
                  label="Precio efectivo"
                  name="precio_venta_efectivo"
                  defaultValue={insumo?.precio_venta_efectivo}
                  error={errors.precio_venta_efectivo}
                  hint="Opcional. Si lo cargás, la venta deja elegir entre los dos con un botón, igual que en los servicios."
                />
              </div>
            )}
          </div>

          {mostrarCompraInicial && (
            <div className="pt-2 border-t border-border space-y-3">
              <CheckboxField
                label="Cargar primera compra ahora"
                name="cargar_compra"
                defaultChecked={cargarCompra}
                onChange={(e) => setCargarCompra(e.currentTarget.checked)}
              />
              {cargarCompra && (
                <div className="bg-cream/40 border border-border rounded-md p-4 space-y-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Genera un gasto y suma stock a la sucursal seleccionada.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Fecha
                      </label>
                      <input
                        type="date"
                        name="compra_fecha"
                        defaultValue={todayYMD()}
                        className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Sucursal
                      </label>
                      <select
                        name="compra_sucursal_id"
                        value={compraSucursalId}
                        onChange={(e) => setCompraSucursalId(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
                      >
                        {sucursales!.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre}
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
                        name="compra_cantidad"
                        min="1"
                        step="1"
                        value={compraCantidad}
                        onChange={(e) =>
                          setCompraCantidad(Number(e.target.value))
                        }
                        className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums text-right"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Monto total pagado
                      </label>
                      <CurrencyInput
                        value={compraValor}
                        onChange={setCompraValor}
                        min={0}
                        className="w-full px-3 py-2 text-right tabular-nums border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        type="hidden"
                        name="compra_valor"
                        value={compraValor}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Medio de pago
                    </label>
                    <select
                      name="compra_mp_id"
                      className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
                    >
                      <option value="">
                        {mediosDeCompra.length === 0
                          ? "Cargá un medio en esta sucursal"
                          : "Seleccioná"}
                      </option>
                      {mediosDeCompra.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.codigo} — {m.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="compra_pagado"
                      checked={compraPagado}
                      onChange={(e) => setCompraPagado(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-sage-500"
                    />
                    <span>Pagado</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </CrudForm>
  );
}
