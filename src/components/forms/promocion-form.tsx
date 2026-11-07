"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionStateFeedback } from "@/components/feedback/action-feedback";
import { CurrencyField, LoadingButton } from "./field";
import type { Promocion, Servicio } from "@/lib/types";
import { formatARS } from "@/lib/utils";
import type { ActionResult } from "@/lib/data/promociones";

interface Props {
  promocion?: Promocion;
  servicios: Servicio[];
  action: (
    state: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  submitLabel: string;
}

export function PromocionForm({
  promocion,
  servicios,
  action,
  submitLabel,
}: Props) {
  const router = useRouter();
  const [seleccionados, setSeleccionados] = useState<string[]>(
    promocion?.componentes.map((c) => c.servicio_id) ?? [],
  );

  const [state, formAction, pending] = useActionStateFeedback(action, {
    redirectTo: "/catalogos/promociones",
    successMessage: promocion ? "Promocion actualizada" : "Promocion creada",
  });

  const errors = state && !state.ok ? state.errors : {};

  const { sumaLista, sumaEfectivo } = useMemo(() => {
    const byId = new Map(servicios.map((servicio) => [servicio.id, servicio]));
    return seleccionados.reduce(
      (acc, id) => {
        const s = byId.get(id);
        return {
          sumaLista: acc.sumaLista + (s?.precio_lista ?? 0),
          sumaEfectivo: acc.sumaEfectivo + (s?.precio_efectivo ?? 0),
        };
      },
      { sumaLista: 0, sumaEfectivo: 0 },
    );
  }, [seleccionados, servicios]);

  function toggle(id: string) {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  return (
    <form action={formAction} className="max-w-xl space-y-6">
      <Field
        label="Nombre"
        name="nombre"
        defaultValue={promocion?.nombre}
        error={errors.nombre}
        required
      />

      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Servicios combinados
        </label>
        <p className="text-xs text-muted-foreground">
          Elige al menos 2 servicios. Cada uno mantiene su trazabilidad al vender.
        </p>
        <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card">
          {servicios.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              No hay servicios cargados.
            </p>
          ) : (
            servicios.map((servicio) => (
              <label
                key={servicio.id}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-cream/30"
              >
                <input
                  type="checkbox"
                  name="componentes"
                  value={servicio.id}
                  checked={seleccionados.includes(servicio.id)}
                  onChange={() => toggle(servicio.id)}
                  className="h-4 w-4 rounded border-border accent-sage-500"
                />
                <span className="flex-1">{servicio.nombre}</span>
                {/* Los dos precios, como en la lista de servicios: con uno solo
                    no se sabía cuál era y parecía mal cargado. */}
                <span className="text-right tabular-nums text-muted-foreground">
                  {formatARS(servicio.precio_efectivo)} efectivo
                  <span className="block text-xs">
                    {formatARS(servicio.precio_lista)} lista
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
        {seleccionados.length > 0 && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {seleccionados.length} servicios · por separado suman{" "}
            {formatARS(sumaEfectivo)} en efectivo y {formatARS(sumaLista)} de lista
          </p>
        )}
        {errors.componentes && (
          <p className="text-xs text-destructive">{errors.componentes.join(", ")}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <CurrencyField
          label="Precio combo (lista)"
          name="precio_lista"
          defaultValue={promocion?.precio_lista}
          error={errors.precio_lista}
          required
        />
        <CurrencyField
          label="Precio combo (efectivo)"
          name="precio_efectivo"
          defaultValue={promocion?.precio_efectivo}
          error={errors.precio_efectivo}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Duracion (min, opcional)"
          name="duracion_min"
          type="number"
          step="1"
          defaultValue={promocion?.duracion_min}
          error={errors.duracion_min}
        />
      </div>

      <Field
        label="Vencimiento (opcional)"
        name="vence_el"
        type="date"
        defaultValue={promocion?.vence_el}
        error={errors.vence_el}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="activo"
          defaultChecked={promocion?.activo ?? true}
          className="h-4 w-4 rounded border-border accent-sage-500"
        />
        <span>Activa</span>
      </label>

      {errors._ && <p className="text-sm text-destructive">{errors._.join(", ")}</p>}

      <div className="flex items-center gap-3 pt-4">
        <LoadingButton
          type="submit"
          pending={pending}
          pendingLabel="Guardando..."
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
        >
          {submitLabel}
        </LoadingButton>
        <button
          type="button"
          onClick={() => router.push("/catalogos/promociones")}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-cream"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string[];
}

function Field({ label, error, name, ...rest }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={name}
        className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        {...rest}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {error && <p className="text-xs text-destructive">{error.join(", ")}</p>}
    </div>
  );
}
