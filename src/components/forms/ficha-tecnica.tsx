"use client";

import { useRef } from "react";
import { Trash2, FileText, Plus } from "lucide-react";
import { useActionStateFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "./field";
import type { Cliente, FichaRegistro } from "@/lib/types";
import type { ActionResult } from "@/lib/data/_helpers";
import { hoyAr } from "@/lib/fecha-ar";
import { formatDate } from "@/lib/utils";

type Accion = (
  state: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

interface Props {
  perfil: Pick<
    Cliente,
    | "tipo_cabello"
    | "salud_cabello"
    | "alergias"
    | "color_actual"
    | "observaciones_tecnicas"
  >;
  registros: FichaRegistro[];
  servicios: { id: string; nombre: string }[];
  empleados: { id: string; nombre: string }[];
  puedeEliminar: boolean;
  updatePerfil: Accion;
  addRegistro: Accion;
  deleteRegistro: (formData: FormData) => void;
}

function fmtFecha(iso: string): string {
  return formatDate(iso);
}

export function FichaTecnica({
  perfil,
  registros,
  servicios,
  empleados,
  puedeEliminar,
  updatePerfil,
  addRegistro,
  deleteRegistro,
}: Props) {
  const [perfilState, perfilAction, perfilPending] = useActionStateFeedback(
    updatePerfil,
    {
      refreshOnSuccess: true,
      successMessage: "Perfil tecnico guardado",
    },
  );

  const addFormRef = useRef<HTMLFormElement>(null);
  const [regState, regAction, regPending] = useActionStateFeedback(addRegistro, {
    refreshOnSuccess: true,
    successMessage: "Registro tecnico agregado",
    onSuccess: () => addFormRef.current?.reset(),
  });

  const perfilErr = perfilState && !perfilState.ok ? perfilState.errors : {};
  const regErr = regState && !regState.ok ? regState.errors : {};
  const hoy = hoyAr();

  return (
    <section className="space-y-6 border-t border-border pt-6">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 stroke-[1.5] text-sage-700" />
        <h2 className="font-display text-xl tracking-[0.15em] uppercase">
          Ficha tecnica
        </h2>
      </div>

      <form action={perfilAction} className="space-y-4 rounded-md border border-border bg-card p-5">
        <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
          Perfil del cliente
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Tipo de cabello" name="tipo_cabello" defaultValue={perfil.tipo_cabello} placeholder="Liso, fino, teñido..." />
          <Campo label="Salud del cabello" name="salud_cabello" defaultValue={perfil.salud_cabello} placeholder="Sano, dañado, decolorado..." />
          <Campo label="Color actual / base" name="color_actual" defaultValue={perfil.color_actual} placeholder="Ej. 6.0 base natural" />
          <Campo label="Alergias / sensibilidades" name="alergias" defaultValue={perfil.alergias} placeholder="Amoniaco, PPD..." />
        </div>
        <Textarea
          label="Observaciones tecnicas"
          name="observaciones_tecnicas"
          defaultValue={perfil.observaciones_tecnicas}
          placeholder="Notas generales del cabello o piel del cliente"
        />
        {perfilErr._ && <p className="text-xs text-destructive">{perfilErr._.join(", ")}</p>}
        <div className="flex items-center gap-3">
          <LoadingButton
            type="submit"
            pending={perfilPending}
            pendingLabel="Guardando..."
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
          >
            Guardar perfil
          </LoadingButton>
        </div>
      </form>

      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
          Registros tecnicos
        </h3>

        <form
          ref={addFormRef}
          action={regAction}
          className="space-y-3 rounded-md border border-border bg-card p-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo label="Fecha" name="fecha" type="date" defaultValue={hoy} />
            <Select label="Servicio" name="servicio_id" placeholder="— Opcional —" options={servicios} />
            <Select label="Empleado" name="empleado_id" placeholder="— Opcional —" options={empleados} />
          </div>
          <Campo label="Formula de color" name="formula" placeholder="Ej. 7.1 + 6.0 + 20 vol · 35 min" />
          <Textarea label="Tecnica / notas" name="notas" placeholder="Mechas, tecnica, tiempos, resultado..." />
          {regErr.formula && <p className="text-xs text-destructive">{regErr.formula.join(", ")}</p>}
          {regErr._ && <p className="text-xs text-destructive">{regErr._.join(", ")}</p>}
          <LoadingButton
            type="submit"
            pending={regPending}
            pendingLabel="Agregando..."
            className="inline-flex items-center gap-1.5 rounded-md bg-sage-700 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-white transition-colors hover:bg-sage-900"
          >
            <Plus className="h-3.5 w-3.5 stroke-[1.5]" />
            Agregar registro
          </LoadingButton>
        </form>

        {registros.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Todavia no hay registros tecnicos para este cliente.
          </div>
        ) : (
          <ol className="space-y-2">
            {registros.map((registro) => (
              <li key={registro.id} className="rounded-md border border-border bg-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium tabular-nums">
                    {fmtFecha(registro.fecha)}
                    {registro.servicio_nombre && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        · {registro.servicio_nombre}
                      </span>
                    )}
                    {registro.empleado_nombre && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        · {registro.empleado_nombre}
                      </span>
                    )}
                  </p>
                  {puedeEliminar && (
                    <form action={deleteRegistro}>
                      <input type="hidden" name="id" value={registro.id} />
                      <button
                        type="submit"
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        aria-label="Eliminar registro"
                      >
                        <Trash2 className="h-4 w-4 stroke-[1.5]" />
                      </button>
                    </form>
                  )}
                </div>
                {registro.formula && (
                  <p className="mt-1.5 text-sm">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      Formula:{" "}
                    </span>
                    {registro.formula}
                  </p>
                )}
                {registro.notas && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {registro.notas}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function Campo({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function Textarea({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <textarea
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function Select({
  label,
  name,
  placeholder,
  options,
}: {
  label: string;
  name: string;
  placeholder: string;
  options: { id: string; nombre: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <select
        name={name}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
