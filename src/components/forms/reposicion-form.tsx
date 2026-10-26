"use client";

import { useMemo, useState } from "react";
import { CrudForm } from "./crud-form";
import { Field, SelectField } from "./field";
import type { Insumo, Sucursal } from "@/lib/types";
import type { ActionResult } from "@/lib/data/_helpers";

interface Props {
  /** Sólo productos de venta de la sucursal. */
  insumos: Insumo[];
  sucursal: Sucursal;
  /** insumoId -> { total, depósito } en unidad base */
  stockMap: Record<string, { cantidad: number; deposito: number }>;
  defaultInsumoId?: string;
  action: (
    state: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
}

function fmt(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

/**
 * Pasar mercadería del depósito a la góndola. Muestra cuánto hay en cada lugar
 * antes y después, para que quien repone vea que el número coincide con lo
 * que tiene en la mano.
 */
export function ReposicionForm({
  insumos,
  sucursal,
  stockMap,
  defaultInsumoId,
  action,
}: Props) {
  const [insumoId, setInsumoId] = useState(defaultInsumoId ?? "");
  const [valor, setValor] = useState("");

  const insumo = useMemo(
    () => insumos.find((i) => i.id === insumoId) ?? null,
    [insumos, insumoId],
  );
  const tamano = insumo && insumo.tamano_envase > 0 ? insumo.tamano_envase : 1;
  const stock = stockMap[insumoId] ?? { cantidad: 0, deposito: 0 };
  // Todo en envases: es como se cuenta en la góndola.
  const deposito = stock.deposito / tamano;
  const exhibido = (stock.cantidad - stock.deposito) / tamano;

  const envases = valor === "" ? null : Number(valor);
  const valido = envases != null && Number.isFinite(envases) && envases > 0;
  const excede = valido && envases > deposito;

  // Los que tienen algo en depósito primero: son los únicos que se pueden reponer.
  const opciones = [...insumos].sort((a, b) => {
    const da = (stockMap[a.id]?.deposito ?? 0) > 0 ? 0 : 1;
    const db = (stockMap[b.id]?.deposito ?? 0) > 0 ? 0 : 1;
    return da - db || a.nombre.localeCompare(b.nombre);
  });

  return (
    <CrudForm
      action={action}
      redirectTo="/stock"
      cancelHref="/stock"
      submitLabel="Reponer"
    >
      {(errors) => (
        <>
          <input type="hidden" name="sucursal_id" value={sucursal.id} />
          <SelectField
            label="Producto"
            name="insumo_id"
            value={insumoId}
            onChange={(e) => setInsumoId(e.currentTarget.value)}
            error={errors.insumo_id}
            options={opciones.map((i) => {
              const dep = (stockMap[i.id]?.deposito ?? 0) / (i.tamano_envase || 1);
              return {
                value: i.id,
                label: dep > 0 ? `${i.nombre} · ${fmt(dep)} en depósito` : i.nombre,
              };
            })}
            placeholder="Seleccioná el producto"
            required
          />

          {insumo && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-cream/40 border border-border rounded-md p-4 space-y-1">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  En depósito
                </p>
                <p className="text-2xl font-display tabular-nums">{fmt(deposito)}</p>
              </div>
              <div className="bg-cream/40 border border-border rounded-md p-4 space-y-1">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  En exhibición
                </p>
                <p className="text-2xl font-display tabular-nums">{fmt(exhibido)}</p>
              </div>
            </div>
          )}

          <Field
            label="Cantidad que pasa a la góndola"
            name="cantidad"
            type="number"
            step="1"
            min="1"
            value={valor}
            onChange={(e) => setValor(e.currentTarget.value)}
            error={errors.cantidad}
            required
          />

          {insumo && valido && (
            <p
              className={`text-sm tabular-nums ${excede ? "text-destructive" : "text-muted-foreground"}`}
            >
              {excede
                ? `En depósito hay ${fmt(deposito)}: no se puede reponer más que eso.`
                : `Queda: depósito ${fmt(deposito - envases)} · exhibición ${fmt(exhibido + envases)}`}
            </p>
          )}

          <Field
            label="Observación (opcional)"
            name="motivo"
            error={errors.motivo}
          />
        </>
      )}
    </CrudForm>
  );
}
