"use client";

import { useState } from "react";
import { CrudForm } from "./crud-form";
import { CheckboxField, CurrencyField, Field, SelectField } from "./field";
import type { Empleado, Sucursal } from "@/lib/types";
import type { ActionResult } from "@/lib/data/_helpers";

interface Props {
  empleado?: Empleado;
  sucursales: Sucursal[];
  /** Roles que el usuario actual puede asignar. Si está vacío, no se ofrece crear acceso. */
  rolesDisponibles?: { value: string; label: string }[];
  action: (
    state: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  submitLabel: string;
}

const TIPOS = [
  { value: "porcentaje", label: "Porcentaje" },
  { value: "mixto", label: "Mixto (%+ asegurado)" },
  { value: "sueldo_fijo", label: "Sueldo fijo" },
];

export function EmpleadoForm({
  empleado,
  sucursales,
  rolesDisponibles,
  action,
  submitLabel,
}: Props) {
  const [crearAcceso, setCrearAcceso] = useState(false);
  const ofreceAcceso = !empleado && (rolesDisponibles?.length ?? 0) > 0;

  return (
    <CrudForm
      action={action}
      redirectTo="/catalogos/empleados"
      submitLabel={submitLabel}
    >
      {(errors) => (
        <>
          <Field
            label="Nombre"
            name="nombre"
            defaultValue={empleado?.nombre}
            error={errors.nombre}
            required
          />
          <SelectField
            label="Sucursal principal"
            name="sucursal_principal_id"
            defaultValue={empleado?.sucursal_principal_id}
            error={errors.sucursal_principal_id}
            options={sucursales.map((s) => ({ value: s.id, label: s.nombre }))}
            required
          />
          <SelectField
            label="Tipo de comisión"
            name="tipo_comision"
            defaultValue={empleado?.tipo_comision ?? "porcentaje"}
            error={errors.tipo_comision}
            options={TIPOS}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Porcentaje default"
              name="porcentaje_default"
              type="number"
              step="0.01"
              defaultValue={empleado?.porcentaje_default ?? 30}
              error={errors.porcentaje_default}
              required
            />
            <CurrencyField
              label="Valor por hora"
              name="valor_hora"
              defaultValue={empleado?.valor_hora ?? 0}
              error={errors.valor_hora}
              required
            />
          </div>
          {/* El viático ya no vive acá: se carga día por día, con su monto, en
              la ficha de la empleada. Un fijo en el alta hacía creer que el
              sistema sabía quién almorzó cada día, y en realidad lo adivinaba
              contando ventas. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Este campo dejó de ser la fuente de las horas: manda el horario
                semanal de "Disponibilidad pública", que se carga una vez y
                queda. Se conserva como respaldo porque hoy casi nadie tiene el
                semanal cargado, y sin él la liquidación daría cero horas. */}
            <Field
              label="Horas por día (respaldo)"
              name="horas_por_dia"
              type="number"
              step="0.5"
              min="0"
              defaultValue={empleado?.horas_por_dia ?? 0}
              error={errors.horas_por_dia}
              hint="Sólo se usa mientras no tenga cargado el horario semanal en Disponibilidad pública, que es lo que manda."
            />
          </div>
          <DiasTrabajoField dias={empleado?.dias_trabajo ?? []} />
          <Field
            label="Observación"
            name="observacion"
            defaultValue={empleado?.observacion}
            error={errors.observacion}
          />

          {ofreceAcceso && (
            <div className="space-y-3 rounded-md border border-border bg-cream/30 p-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="crear_acceso"
                  checked={crearAcceso}
                  onChange={(e) => setCrearAcceso(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-sage-500"
                />
                <span className="font-medium">Crear acceso al sistema</span>
                <span className="text-xs text-muted-foreground">
                  (login con email y rol)
                </span>
              </label>

              {crearAcceso && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label="Email de acceso"
                      name="email"
                      type="email"
                      error={errors.email}
                      required
                    />
                    <SelectField
                      label="Rol"
                      name="rol"
                      error={errors.rol}
                      options={rolesDisponibles ?? []}
                      placeholder="Seleccioná rol"
                      required
                    />
                  </div>
                  <Field
                    label="Contraseña"
                    name="password"
                    type="password"
                    error={errors.password}
                    hint="Mínimo 8 caracteres. Compartísela al empleado; la puede cambiar después."
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    El empleado va a entrar con este email y contraseña, con el
                    rol y la sucursal elegidos.
                  </p>
                </>
              )}
            </div>
          )}

          <CheckboxField
            label="Activo"
            name="activo"
            defaultChecked={empleado?.activo ?? true}
          />
        </>
      )}
    </CrudForm>
  );
}

const DIAS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

function DiasTrabajoField({ dias }: { dias: number[] }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Días que trabaja
      </label>
      <div className="flex flex-wrap gap-2">
        {DIAS.map((d) => (
          <label
            key={d.value}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm cursor-pointer hover:bg-cream has-[:checked]:border-sage-700 has-[:checked]:bg-sage-50"
          >
            <input
              type="checkbox"
              name="dias_trabajo"
              value={d.value}
              defaultChecked={dias.includes(d.value)}
              className="h-3.5 w-3.5 rounded border-border accent-sage-500"
            />
            <span>{d.label}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Se usan para calcular las horas del período al liquidar.
      </p>
    </div>
  );
}
