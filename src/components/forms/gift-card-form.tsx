"use client";

import { useState } from "react";
import { CrudForm } from "./crud-form";
import { CurrencyField, Field } from "./field";
import type { CuentaBancaria, MedioPago } from "@/lib/types";
import type { ActionResult } from "@/lib/data/_helpers";

interface Props {
  sucursalId: string;
  /** Sugerido por el sistema; la encargada lo puede pisar. */
  codigoSugerido: string;
  /** vence_el propuesto (hoy + 30 días). */
  vencePorDefecto: string;
  mediosPago: MedioPago[];
  cuentasBanco: CuentaBancaria[];
  action: (
    state: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  submitLabel: string;
}

// ¿El medio de pago impacta en una cuenta de banco? (habilita elegir a cuál).
// Mismo criterio que nueva-venta-form.tsx: efectivo y cuenta corriente no van a
// bancos, el resto sí.
function usaCuentaBanco(mp: MedioPago | undefined): boolean {
  if (!mp) return false;
  const cod = mp.codigo.toUpperCase();
  return cod !== "EF" && cod !== "CC";
}

export function GiftCardForm({
  sucursalId,
  codigoSugerido,
  vencePorDefecto,
  mediosPago,
  cuentasBanco,
  action,
  submitLabel,
}: Props) {
  // Arranca en un medio que tenga cuenta asignada. Antes tomaba el primero de
  // la lista sin mirar, y si ese no tenía cuenta la plata no entraba a la caja
  // sin que nadie se enterara.
  const [mpId, setMpId] = useState(
    () => (mediosPago.find((m) => m.cuenta_id) ?? mediosPago[0])?.id ?? "",
  );
  const [cuentaId, setCuentaId] = useState("");
  const mp = mediosPago.find((m) => m.id === mpId);

  // Sin cuenta —ni la del medio ni una elegida a mano— el cobro no impacta en
  // caja. El servidor lo permite igual (no frena la venta por configuración),
  // así que el aviso tiene que estar acá, antes de guardar.
  const sinCuenta = !!mp && !mp.cuenta_id && !cuentaId;

  return (
    <CrudForm
      action={action}
      redirectTo="/catalogos/gift-cards"
      submitLabel={submitLabel}
    >
      {(errors) => (
        <>
          <input type="hidden" name="sucursal_id" value={sucursalId} />

          <Field
            label="Código de la tarjeta"
            name="codigo"
            defaultValue={codigoSugerido}
            error={errors.codigo}
            hint="Escribí este mismo código en la tarjeta antes de entregarla. Si ya armaste el diseño con otro número, poné ese."
            required
            autoFocus
          />

          <CurrencyField
            label="Importe"
            name="importe"
            error={errors.importe}
            hint="Lo que paga quien la compra. Es el saldo con el que arranca."
            required
          />

          <div className="space-y-1.5">
            <label
              htmlFor="mp_id"
              className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Cómo la pagó
            </label>
            {mediosPago.length === 0 ? (
              <p className="text-xs text-destructive">
                Esta sucursal no tiene medios de pago cargados. Cargalos en
                Catálogos → Medios de pago.
              </p>
            ) : (
              <select
                id="mp_id"
                name="mp_id"
                value={mpId}
                onChange={(e) => setMpId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {mediosPago.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            )}
            {errors.mp_id && (
              <p className="text-xs text-destructive">
                {errors.mp_id.join(", ")}
              </p>
            )}
            {sinCuenta && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
                <p className="text-xs font-medium text-brown-900">
                  {mp?.nombre} no tiene cuenta asignada
                </p>
                <p className="mt-1 text-xs text-brown-700">
                  La gift card se va a emitir igual, pero{" "}
                  <strong>esos pesos no van a aparecer en la caja del día</strong>.
                  Asignale una cuenta en Catálogos → Medios de pago, o elegí otro
                  medio.
                </p>
              </div>
            )}
          </div>

          {usaCuentaBanco(mp) && cuentasBanco.length > 0 ? (
            <div className="space-y-1.5">
              <label
                htmlFor="mp_cuenta_id"
                className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Cuenta
              </label>
              <select
                id="mp_cuenta_id"
                name="mp_cuenta_id"
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Cuenta por defecto del medio —</option>
                {cuentasBanco.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <Field
            label="Vence el"
            name="vence_el"
            type="date"
            defaultValue={vencePorDefecto}
            error={errors.vence_el}
            hint="30 días es lo habitual. Vacío = sin vencimiento."
          />

          <Field
            label="Quién la compra"
            name="compradora"
            error={errors.compradora}
          />

          <Field
            label="Para quién es"
            name="beneficiaria"
            error={errors.beneficiaria}
            hint="Ayuda a encontrarla después, cuando la vengan a canjear."
          />

          <Field
            label="Observación"
            name="observacion"
            error={errors.observacion}
          />
        </>
      )}
    </CrudForm>
  );
}
