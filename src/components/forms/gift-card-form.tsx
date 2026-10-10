"use client";

import { useState } from "react";
import { CrudForm } from "./crud-form";
import { ClienteCombobox } from "@/components/forms/cliente-combobox";
import { CurrencyField, Field } from "./field";
import { formatARS } from "@/lib/utils";
import type { Cliente, CuentaBancaria, MedioPago } from "@/lib/types";
import type { ActionResult } from "@/lib/data/_helpers";
import { hoyAr } from "@/lib/fecha-ar";

interface Props {
  sucursalId: string;
  /** Sugerido por el sistema; la encargada lo puede pisar. */
  codigoSugerido: string;
  /** vence_el propuesto (hoy + 30 días). */
  vencePorDefecto: string;
  mediosPago: MedioPago[];
  cuentasBanco: CuentaBancaria[];
  /** Para fiarla: la deuda necesita un cliente, no un nombre escrito. */
  clientes: Cliente[];
  action: (
    state: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  submitLabel: string;
}

// ¿El medio de pago impacta en una cuenta de banco? (habilita elegir a cuál).
// Mismo criterio que nueva-venta-form.tsx: efectivo y cuenta corriente no van a
// bancos, el resto sí.
/** Fiada: no entra plata, queda como deuda de quien la compra. */
function esCuentaCorriente(mp: MedioPago | undefined): boolean {
  return mp?.codigo.toUpperCase() === "CC";
}

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
  clientes,
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
  // De donde sale la tarjeta. Lo unico que cambia en la pantalla es si hoy se
  // cobra: "venta" si, las otras dos no, por motivos opuestos.
  const [origen, setOrigen] = useState<"venta" | "pre_sistema" | "cortesia">(
    "venta",
  );
  const cobraHoy = origen === "venta";
  // Controlado sólo para poder avisar de una fecha futura con nuestras
  // palabras; vacío sigue significando "se vende hoy".
  const [fechaVenta, setFechaVenta] = useState("");
  const [clienteCc, setClienteCc] = useState("");
  // Controlados para poder decir, antes de guardar, cuanta deuda se genera.
  const [importe, setImporte] = useState(0);
  const [cobrado, setCobrado] = useState(0);
  /** Lo que de verdad se le cobra: el campo de descuento si lo usaron. */
  const aCobrar = cobrado > 0 ? cobrado : importe;
  const mp = mediosPago.find((m) => m.id === mpId);

  // Sin cuenta —ni la del medio ni una elegida a mano— el cobro no impacta en
  // caja. El servidor lo permite igual (no frena la venta por configuración),
  // así que el aviso tiene que estar acá, antes de guardar.
  const sinCuenta = cobraHoy && !!mp && !mp.cuenta_id && !cuentaId;

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
            value={importe}
            onChange={setImporte}
            error={errors.importe}
            hint={
              origen === "pre_sistema"
                ? "El saldo que le queda a la tarjeta hoy."
                : origen === "cortesia"
                  ? "Por cuanto se regala. Es el saldo con el que arranca."
                  : "Cuánto vale la tarjeta: el saldo con el que arranca."
            }
            required
          />

          {/* Lo que vale y lo que pagan no siempre son lo mismo.
              Elu: "Venta de GIFT CARD a DUEÑOS (40% de descuento) ... al pagar
              con un dto. no coincide lo que pagan con lo que tienen a favor,
              cómo se hace en ese caso?". Antes no se podía: el importe era las
              dos cosas, y había que mentir en una de las dos puntas.
              Vacío = pagaron el importe, que es el caso de siempre. */}
          {cobraHoy && (
            <CurrencyField
              label="Lo que pagan (si es distinto)"
              name="cobrado"
              value={cobrado}
              onChange={setCobrado}
              error={errors.cobrado}
              hint="Dejalo en 0 si pagan el importe completo. Si va con descuento, poné acá lo que entra a caja."
            />
          )}

          <div className="rounded-md border border-border bg-cream/40 p-3 space-y-2">
            <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              De dónde sale
            </span>
            {(
              [
                {
                  v: "venta",
                  t: "Se vende ahora",
                  d: "Alguien la compra. Entra la plata hoy.",
                },
                {
                  v: "pre_sistema",
                  t: "Se vendió antes de usar este sistema",
                  d: "La clienta trae una tarjeta vieja. Se carga para poder canjearla, pero hoy no entra plata: ya entró cuando se vendió.",
                },
                {
                  v: "cortesia",
                  t: "Cortesía del salón",
                  d: "La regala el salón. No entra plata hoy ni después: cuando la canjeen, el servicio factura y la chica cobra su comisión, pero ese monto lo pone el negocio.",
                },
              ] as const
            ).map((o) => (
              <label key={o.v} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="origen"
                  value={o.v}
                  checked={origen === o.v}
                  onChange={() => setOrigen(o.v)}
                  className="mt-0.5 h-4 w-4 border-border accent-sage-500"
                />
                <span>
                  {o.t}
                  <span className="block text-xs text-muted-foreground">
                    {o.d}
                  </span>
                </span>
              </label>
            ))}
            {/* La fecha vale para los tres casos, no solo para las viejas.
                Una tarjeta o un pack que se vendio hace unos dias y se carga
                recien hoy cobró ese dia: con la fecha de hoy, la plata entra
                en la caja equivocada. */}
            {origen !== "cortesia" && (
              <div className="space-y-1.5">
                <label
                  htmlFor="fecha_venta"
                  className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Cuándo se vendió (opcional)
                </label>
                <input
                  id="fecha_venta"
                  name="fecha_venta"
                  type="date"
                  max={hoyAr()}
                  value={fechaVenta}
                  onChange={(e) => setFechaVenta(e.currentTarget.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {/* El navegador ya frena la fecha futura, pero lo hace con un
                    globito suyo que dice "el valor debe ser menor o igual a
                    2026-10-07". Elu se quedó trabada mirando eso y conclusión:
                    "no me deja avanzar por los importes me parece". Decirlo
                    nosotros, abajo del campo y en castellano, es la diferencia
                    entre arreglarlo sola y escribir por WhatsApp. */}
                {fechaVenta > hoyAr() ? (
                  <p className="text-xs text-danger">
                    Esa fecha todavía no llegó. Poné el día en que se vendió de
                    verdad, o dejalo vacío si se vende hoy. ¿No la confundiste
                    con el vencimiento, que va más abajo?
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {cobraHoy
                      ? "Dejalo vacío si se vende hoy. Si se vendió otro día, la plata entra en la caja de ese día."
                      : "El día en que se vendió de verdad, para saber de cuándo viene."}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Si hoy no entra plata no hay medio de pago ni cuenta que elegir:
              ni la tarjeta vieja ni la cortesia se cobran. */}
          {cobraHoy && (
            <>
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

            {/* Fiada: hay que decir a quién. Un nombre escrito a mano alcanza
                para encontrar la tarjeta después, pero no para cargarle la
                deuda a nadie: la cuenta corriente es de un cliente. */}
            {esCuentaCorriente(mp) && (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  A la cuenta de quién
                </label>
                <ClienteCombobox
                  clientes={clientes}
                  value={clienteCc}
                  onChange={setClienteCc}
                />
                <input
                  type="hidden"
                  name="compradora_cliente_id"
                  value={clienteCc}
                />
                {/* Decir el número de la deuda ANTES de guardar.
                    Belén compró una de $84.000 con descuento, pagando
                    $63.000, y el descuento no llegó a guardarse: se le cargaron
                    los $84.000 y recién apareció en su cuenta corriente.
                    "Debería haberse tomado el monto de $63.000". El formulario
                    nunca le mostró cuánta deuda iba a generar. */}
                {aCobrar > 0 && (
                  <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-brown-700">
                    Le va a quedar debiendo{" "}
                    <strong>{formatARS(aCobrar)}</strong>
                    {cobrado > 0 && cobrado !== importe && (
                      <> — la tarjeta vale {formatARS(importe)}</>
                    )}
                    . No entra plata ahora: la paga después desde su ficha.
                  </p>
                )}
                {aCobrar <= 0 && (
                  <p className="text-xs text-muted-foreground">
                    No entra plata ahora: queda como deuda suya y la paga
                    después desde su ficha.
                  </p>
                )}
              </div>
            )}

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
            </>
          )}

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
