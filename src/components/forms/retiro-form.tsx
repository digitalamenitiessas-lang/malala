"use client";

import { useMemo, useState } from "react";
import { CrudForm } from "./crud-form";
import { Field, SelectField } from "./field";
import { formatARS } from "@/lib/utils";
import { costoRetiroUsoInterno } from "@/lib/stock-uso-interno";
import { UBICACION_LABEL, type UbicacionStock } from "@/lib/stock-ubicacion";
import type { Empleado, Insumo, Sucursal } from "@/lib/types";
import type { ActionResult } from "@/lib/data/_helpers";

const UNIDAD_LABEL: Record<string, string> = {
  ud: "ud",
  ml: "ml",
  g: "g",
  aplicacion: "apl.",
};

interface Props {
  /** Sólo productos de venta de la sucursal. */
  insumos: Insumo[];
  empleados: Empleado[];
  sucursal: Sucursal;
  /** insumoId -> cantidad actual en stock (unidad base, total) */
  stockMap: Record<string, number>;
  /** insumoId -> parte en depósito (unidad base) */
  depositoMap: Record<string, number>;
  defaultInsumoId?: string;
  action: (
    state: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
}

function fmt(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function RetiroForm({
  insumos,
  empleados,
  sucursal,
  stockMap,
  depositoMap,
  defaultInsumoId,
  action,
}: Props) {
  const [insumoId, setInsumoId] = useState(defaultInsumoId ?? "");
  const [valor, setValor] = useState("");
  // Lo normal es sacarlo de la góndola: "los productos que estaban en
  // exhibición y se destinaron a bacha".
  const [ubicacion, setUbicacion] = useState<UbicacionStock>("exhibicion");

  const insumo = useMemo(
    () => insumos.find((i) => i.id === insumoId) ?? null,
    [insumos, insumoId],
  );
  const enDeposito = depositoMap[insumoId] ?? 0;
  const stockActual =
    ubicacion === "deposito"
      ? enDeposito
      : (stockMap[insumoId] ?? 0) - enDeposito;
  const unidad = insumo
    ? UNIDAD_LABEL[insumo.unidad_medida] ?? insumo.unidad_medida
    : "";

  const envases = valor === "" ? null : Number(valor);
  const calculo =
    insumo && envases != null && Number.isFinite(envases) && envases > 0
      ? costoRetiroUsoInterno(
          {
            tamanoEnvase: insumo.tamano_envase,
            precioEnvase: insumo.precio_envase,
            precioUnitario: insumo.precio_unitario ?? null,
          },
          envases,
        )
      : null;
  const resultado = calculo ? stockActual + calculo.delta : null;

  return (
    <CrudForm
      action={action}
      redirectTo="/stock/movimientos"
      cancelHref="/stock"
      submitLabel="Retirar para uso interno"
    >
      {(errors) => (
        <>
          <input type="hidden" name="sucursal_id" value={sucursal.id} />
          <SelectField
            label="Producto de venta"
            name="insumo_id"
            value={insumoId}
            onChange={(e) => setInsumoId(e.currentTarget.value)}
            error={errors.insumo_id}
            options={insumos.map((i) => ({ value: i.id, label: i.nombre }))}
            placeholder="Seleccioná el producto"
            required
          />

          <input type="hidden" name="ubicacion" value={ubicacion} />
          <div className="space-y-1.5">
            <p className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              De dónde sale
            </p>
            <div className="flex gap-2">
              {(["exhibicion", "deposito"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUbicacion(u)}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                    ubicacion === u
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-cream"
                  }`}
                >
                  {UBICACION_LABEL[u]}
                </button>
              ))}
            </div>
          </div>

          {insumo && (
            <div className="bg-cream/40 border border-border rounded-md p-4 space-y-1.5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                En {UBICACION_LABEL[ubicacion].toLowerCase()} · {sucursal.nombre}
              </p>
              <p className="text-2xl font-display tabular-nums">
                {insumo.tamano_envase !== 1
                  ? `${fmt(stockActual / insumo.tamano_envase)} env.`
                  : `${fmt(stockActual)} ${unidad}`}
              </p>
              {insumo.tamano_envase !== 1 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {fmt(stockActual)} {unidad} · envases de {insumo.tamano_envase}{" "}
                  {unidad}
                </p>
              )}
            </div>
          )}

          <Field
            label={
              insumo && insumo.tamano_envase === 1
                ? "Cantidad retirada"
                : "Envases retirados"
            }
            name="cantidad"
            type="number"
            step="0.01"
            min="0.01"
            value={valor}
            onChange={(e) => setValor(e.currentTarget.value)}
            error={errors.cantidad}
            hint="Se cuenta como en las compras: un envase es un pote/frasco entero."
            required
          />

          {insumo && calculo && (
            <div className="border border-border rounded-md p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sale del stock</span>
                <span className="tabular-nums font-medium text-destructive">
                  {fmt(calculo.delta)} {unidad}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Queda en</span>
                <span
                  className={`tabular-nums font-medium ${
                    resultado != null && resultado < 0 ? "text-destructive" : ""
                  }`}
                >
                  {fmt(resultado ?? 0)} {unidad}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Costo</span>
                <span className="tabular-nums font-medium">
                  {formatARS(-calculo.delta * calculo.costoUnitario)}
                </span>
              </div>
              {resultado != null &&
                resultado < 0 &&
                (ubicacion === "exhibicion" && enDeposito >= -resultado ? (
                  <p className="text-xs text-muted-foreground pt-1">
                    No alcanza lo exhibido: se repone solo {fmt(-resultado)}{" "}
                    {unidad} desde el depósito.
                  </p>
                ) : (
                  <p className="text-xs text-destructive pt-1">
                    {ubicacion === "deposito"
                      ? "No hay tanto en depósito."
                      : "Atención: el stock quedaría negativo."}
                  </p>
                ))}
            </div>
          )}

          <SelectField
            label="Quién lo retiró"
            name="empleado_id"
            defaultValue=""
            error={errors.empleado_id}
            options={empleados.map((e) => ({ value: e.id, label: e.nombre }))}
            placeholder="Seleccioná la empleada"
            required
          />

          <Field
            label="Motivo"
            name="motivo"
            error={errors.motivo}
            hint="Para qué se usa: lavado, tratamiento en cabina, etc."
            required
          />
        </>
      )}
    </CrudForm>
  );
}
