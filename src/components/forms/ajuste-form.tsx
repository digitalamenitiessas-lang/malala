"use client";

import { useMemo, useState } from "react";
import { CrudForm } from "./crud-form";
import { Field, SelectField } from "./field";
import type { Insumo, Sucursal } from "@/lib/types";
import type { ActionResult } from "@/lib/data/_helpers";

const UNIDAD_LABEL: Record<string, string> = {
  ud: "ud",
  ml: "ml",
  g: "g",
  aplicacion: "apl.",
};

interface Props {
  insumos: Insumo[];
  sucursales: Sucursal[];
  /** sucursalId -> insumoId -> cantidad actual en stock */
  stockMap: Record<string, Record<string, number>>;
  defaultSucursalId: string;
  action: (
    state: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
}

function fmt(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function AjusteForm({
  insumos,
  sucursales,
  stockMap,
  defaultSucursalId,
  action,
}: Props) {
  const [insumoId, setInsumoId] = useState("");
  const [sucursalId, setSucursalId] = useState(defaultSucursalId);
  const [modo, setModo] = useState<"delta" | "set">("delta");
  // Lo que escribe el usuario: en modo delta es +/- a aplicar; en modo set es
  // el stock real contado.
  const [valor, setValor] = useState<string>("");

  const insumo = useMemo(
    () => insumos.find((i) => i.id === insumoId) ?? null,
    [insumos, insumoId],
  );

  const stockActual = stockMap[sucursalId]?.[insumoId] ?? 0;
  const unidad = insumo
    ? UNIDAD_LABEL[insumo.unidad_medida] ?? insumo.unidad_medida
    : "";

  // El stock se lleva en la unidad base (ml/g/ud), pero nadie cuenta en
  // mililitros: se cuentan potes. Pedirlo en ml obligaba a multiplicar de
  // cabeza —4 oxidantes de 900 son 3.600— y ese es justo el error que se
  // cometió al cargar el stock inicial de una sucursal.
  const porEnvase = insumo && insumo.tamano_envase !== 1;
  const [enEnvases, setEnEnvases] = useState(true);
  const usaEnvases = !!porEnvase && enEnvases;
  const factor = usaEnvases ? (insumo?.tamano_envase ?? 1) : 1;
  const unidadEntrada = usaEnvases ? "env." : unidad;

  const valorNum = valor === "" || valor === "-" ? null : Number(valor);
  const valido = valorNum != null && Number.isFinite(valorNum);
  const valorBase = valido ? valorNum * factor : null;

  // delta = cantidad que se aplica al stock (lo que espera la action), siempre
  // en unidad base.
  const delta =
    valorBase == null
      ? null
      : modo === "delta"
        ? valorBase
        : valorBase - stockActual;
  const resultado = delta == null ? null : stockActual + delta;

  return (
    <CrudForm action={action} redirectTo="/stock" submitLabel="Aplicar ajuste">
      {(errors) => (
        <>
          <SelectField
            label="Insumo"
            name="insumo_id"
            value={insumoId}
            onChange={(e) => setInsumoId(e.currentTarget.value)}
            error={errors.insumo_id}
            options={insumos.map((i) => ({ value: i.id, label: i.nombre }))}
            placeholder="Seleccioná insumo"
            required
          />
          {sucursales.length > 1 ? (
            <SelectField
              label="Sucursal"
              name="sucursal_id"
              value={sucursalId}
              onChange={(e) => setSucursalId(e.currentTarget.value)}
              error={errors.sucursal_id}
              options={sucursales.map((s) => ({ value: s.id, label: s.nombre }))}
              required
            />
          ) : (
            <div className="space-y-1.5">
              <p className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Sucursal
              </p>
              <p className="text-sm">
                {sucursales.find((s) => s.id === sucursalId)?.nombre ?? "—"}
              </p>
              <input type="hidden" name="sucursal_id" value={sucursalId} />
            </div>
          )}

          {insumo && (
            <div className="bg-cream/40 border border-border rounded-md p-4 space-y-1.5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Stock actual
              </p>
              <p className="text-2xl font-display tabular-nums">
                {fmt(stockActual)} {unidad}
              </p>
              {insumo.tamano_envase !== 1 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  ≈ {fmt(stockActual / insumo.tamano_envase)} env. de{" "}
                  {insumo.tamano_envase} {unidad}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModo("delta")}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                modo === "delta"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-cream"
              }`}
            >
              Sumar / restar
            </button>
            <button
              type="button"
              onClick={() => setModo("set")}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                modo === "set"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-cream"
              }`}
            >
              Fijar stock en
            </button>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="ajuste_valor"
              className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              {modo === "delta"
                ? `Cantidad a sumar (o restar con -) ${unidadEntrada ? `en ${unidadEntrada}` : ""}`
                : `Stock real contado ${unidadEntrada ? `en ${unidadEntrada}` : ""}`}
            </label>
            <input
              id="ajuste_valor"
              type="number"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.currentTarget.value)}
              placeholder={
                usaEnvases
                  ? modo === "delta"
                    ? "Ej: 4 ó -1"
                    : "Ej: 6"
                  : modo === "delta"
                    ? "Ej: 100 ó -50"
                    : "Ej: 920"
              }
              required
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {porEnvase && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground tabular-nums">
                  {usaEnvases
                    ? `Cada envase trae ${insumo.tamano_envase} ${unidad}${
                        valorBase != null ? ` · son ${fmt(valorBase)} ${unidad}` : ""
                      }`
                    : `Se carga en ${unidad}`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEnEnvases((v) => !v);
                    setValor("");
                  }}
                  className="shrink-0 text-xs uppercase tracking-wider text-brown-700 underline underline-offset-2 transition-colors hover:text-primary"
                >
                  {usaEnvases ? `Cargar en ${unidad}` : "Cargar en envases"}
                </button>
              </div>
            )}
            {errors.cantidad && (
              <p className="text-xs text-destructive">
                {errors.cantidad.join(", ")}
              </p>
            )}
          </div>

          {/* Lo que realmente recibe la action: el delta a aplicar. */}
          <input type="hidden" name="cantidad" value={delta ?? ""} />

          {insumo && delta != null && (
            <div className="border border-border rounded-md p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Movimiento</span>
                <span
                  className={`tabular-nums font-medium ${
                    delta > 0
                      ? "text-sage-700"
                      : delta < 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {delta > 0 ? "+" : ""}
                  {fmt(delta)} {unidad}
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
              {resultado != null && resultado < 0 && (
                <p className="text-xs text-destructive pt-1">
                  Atención: el stock quedaría negativo.
                </p>
              )}
            </div>
          )}

          <Field
            label="Motivo"
            name="motivo"
            error={errors.motivo}
            hint="Conteo físico, error de carga, ruptura, etc."
            required
          />
        </>
      )}
    </CrudForm>
  );
}
