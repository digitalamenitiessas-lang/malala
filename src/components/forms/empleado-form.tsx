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
  const [pctDefault, setPctDefault] = useState(
    String(empleado?.porcentaje_default ?? 30),
  );
  const [horasPorSemana, setHorasPorSemana] = useState(
    String(empleado?.horas_por_semana ?? 0),
  );
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
          {/* Este campo no decide nada: la liquidación siempre suma las dos
              cosas, la comisión de los servicios que tenga asignados MÁS las
              horas por el valor hora. Los que mandan son los dos números de
              abajo. Se deja porque sirve para agrupar y leer la lista, pero
              hace falta decir qué hace de verdad: alguien que elige "sueldo
              fijo" espera que no cobre comisión, y no es así. */}
          <SelectField
            label="Tipo de comisión"
            name="tipo_comision"
            defaultValue={empleado?.tipo_comision ?? "porcentaje"}
            error={errors.tipo_comision}
            options={TIPOS}
            required
          />
          <p className="-mt-2 text-xs text-muted-foreground">
            Es una etiqueta para ordenar la lista. Lo que decide cuánto cobra
            son los dos campos de abajo.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Porcentaje default"
              name="porcentaje_default"
              type="number"
              step="0.01"
              value={pctDefault}
              onChange={(e) => setPctDefault(e.currentTarget.value)}
              error={errors.porcentaje_default}
              hint="Sobre los servicios que se le asignen. En 0 si no cobra comisión."
              required
            />
            <CurrencyField
              label="Valor por hora"
              name="valor_hora"
              defaultValue={empleado?.valor_hora ?? 0}
              error={errors.valor_hora}
              hint="Se multiplica por las horas del período al liquidar."
              required
            />
          </div>
          {Number(pctDefault) > 0 && (
            <p className="text-xs text-warning">
              Con {pctDefault}% de comisión, si se le asignan servicios va a
              cobrar eso <strong>además</strong> de las horas. Si solo cobra por
              hora, poné 0.
            </p>
          )}
          {/* El viático ya no vive acá: se carga día por día, con su monto, en
              la ficha de la empleada. Un fijo en el alta hacía creer que el
              sistema sabía quién almorzó cada día, y en realidad lo adivinaba
              contando ventas. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Este campo dejó de ser la fuente de las horas: manda el horario
                semanal de "Disponibilidad pública", que se carga una vez y
                queda. Se conserva como respaldo porque hoy casi nadie tiene el
                semanal cargado, y sin él la liquidación daría cero horas. */}
            {/* El campo pedía horas por DÍA y el salón cargaba la semana: 34,
                52, 48, 47, que coincidían exacto con el horario semanal de cada
                una. El dato estaba bien, la etiqueta estaba mal. Ahora pide lo
                que el salón tiene escrito y no hay que traducir de cabeza. */}
            <div className="space-y-1.5">
              <Field
                label="Horas por semana (respaldo)"
                name="horas_por_semana"
                type="number"
                step="0.5"
                min="0"
                value={horasPorSemana}
                onChange={(e) => setHorasPorSemana(e.currentTarget.value)}
                error={errors.horas_por_semana}
                hint="La jornada semanal completa. Sólo se usa mientras no tenga cargado el horario en Disponibilidad pública, que es lo que manda."
              />
              {Number(horasPorSemana) > 0 && Number(horasPorSemana) <= 12 && (
                <p className="text-xs text-warning">
                  {horasPorSemana} horas en toda la semana es muy poco. ¿No
                  estarás poniendo las de un día? Acá va la semana completa.
                </p>
              )}
            </div>
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
