"use client";

import { useMemo, useState } from "react";
import { useActionStateFeedback } from "@/components/feedback/action-feedback";
import { CurrencyField, FormButtons, GlobalError } from "./field";
import { DENOMINACIONES_ARS } from "@/lib/validations/caja";
import { formatARS, formatTime } from "@/lib/utils";
import type { ResumenDelDia, SugerenciasArrastre } from "@/lib/data/caja";
import type { CreateCierreResult } from "@/lib/data/caja";

interface Props {
  sucursalId: string;
  sucursalNombre: string;
  fecha: string; // YYYY-MM-DD
  resumen: ResumenDelDia;
  arrastre: SugerenciasArrastre;
  action: (
    state: CreateCierreResult | null,
    formData: FormData,
  ) => Promise<CreateCierreResult>;
}

const DENOM_LABELS: Record<number, string> = {
  20000: "$ 20.000",
  10000: "$ 10.000",
  2000: "$ 2.000",
  1000: "$ 1.000",
  500: "$ 500",
  200: "$ 200",
  100: "$ 100",
  50: "$ 50",
  20: "$ 20",
  10: "$ 10",
};

export function CierreCajaForm({
  sucursalId,
  sucursalNombre,
  fecha,
  resumen,
  arrastre,
  action,
}: Props) {
  const [billetes, setBilletes] = useState<Record<number, number>>({});
  const [saldoInicial, setSaldoInicial] = useState<number>(
    arrastre.saldoInicialEf,
  );

  const [state, formAction, pending] = useActionStateFeedback<
    CreateCierreResult
  >(action, {
    successMessage: "Caja cerrada",
    redirectTo: (result) =>
      `/caja/${(result as Extract<CreateCierreResult, { ok: true }>).cierreId}`,
  });

  const errors = state && !state.ok ? state.errors : {};

  const efectivoContado = useMemo(
    () =>
      Object.entries(billetes).reduce(
        (acc, [denom, cant]) => acc + Number(denom) * (cant || 0),
        0,
      ),
    [billetes],
  );
  // Las gift cards vendidas en efectivo suman al cajón aunque no sean una
  // venta: la plata entró hoy, el servicio se presta después. Sin esto el
  // arqueo las reportaba como sobrante.
  const efectivoEsperado =
    saldoInicial +
    resumen.ef.ingresos +
    resumen.giftCards.vendidasEfectivo -
    resumen.ef.egresos;
  const diferencia = efectivoContado - efectivoEsperado;
  const cuadra = Math.abs(diferencia) < 0.005;

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="sucursal_id" value={sucursalId} />
      <input type="hidden" name="fecha" value={fecha} />

      {/* Aviso de arrastre */}
      {arrastre.desdeCierre && (
        <div
          className="text-xs px-3 py-2 rounded-md border"
          style={{
            borderColor: "var(--sage-700)",
            color: "var(--sage-700)",
            backgroundColor: "rgba(120,150,130,0.06)",
          }}
        >
          Saldos iniciales sugeridos a partir del cierre del{" "}
          <strong>{arrastre.desdeCierre.fecha}</strong>: efectivo{" "}
          <strong>{formatARS(arrastre.saldoInicialEf)}</strong> · banco{" "}
          <strong>{formatARS(arrastre.saldoInicialBanco)}</strong>. Podés
          ajustarlos si hace falta.
        </div>
      )}

      {/* Resumen automático del día */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Movimientos del día (automático)
        </h2>
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Medio</th>
                <th className="text-right font-medium px-4 py-3">Ingresos</th>
                <th className="text-right font-medium px-4 py-3">Egresos</th>
                <th className="text-right font-medium px-4 py-3">Neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {resumen.porMp.map((row) => (
                <tr key={row.mp.id}>
                  <td className="px-4 py-3 font-medium">
                    {row.mp.nombre}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({row.mp.codigo})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatARS(row.ingresos)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatARS(row.egresos)}
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums font-medium"
                    style={{
                      color:
                        row.neto >= 0 ? "var(--ink)" : "var(--danger)",
                    }}
                  >
                    {formatARS(row.neto)}
                  </td>
                </tr>
              ))}
              <tr className="bg-cream/40 font-medium">
                <td className="px-4 py-3">Totales</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatARS(resumen.totalIngresos)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatARS(resumen.totalEgresos)}
                </td>
                <td
                  className="px-4 py-3 text-right tabular-nums"
                  style={{
                    color:
                      resumen.totalNeto >= 0
                        ? "var(--sage-700)"
                        : "var(--danger)",
                  }}
                >
                  {formatARS(resumen.totalNeto)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          {resumen.cantIngresos} ticket
          {resumen.cantIngresos !== 1 ? "s" : ""} · {resumen.cantEgresos} egreso
          {resumen.cantEgresos !== 1 ? "s" : ""} en {sucursalNombre}.
        </p>
      </section>

      {/* Tickets del día */}
      {resumen.tickets.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Tickets del día
          </h2>
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Hora</th>
                  <th className="text-left font-medium px-4 py-3">Cliente</th>
                  <th className="text-left font-medium px-4 py-3">Equipo</th>
                  <th className="text-right font-medium px-4 py-3">Líneas</th>
                  <th className="text-right font-medium px-4 py-3">Total</th>
                  <th className="text-right font-medium px-4 py-3">Comisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {resumen.tickets.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {formatTime(t.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      {t.cliente?.nombre ?? "Consumidor Final"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {t.empleados.length > 0 ? t.empleados.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {t.cantLineas}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatARS(t.total)}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums"
                      style={{ color: "var(--sage-700)" }}
                    >
                      {formatARS(t.comisiones)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-cream/40 font-medium">
                  <td className="px-4 py-3" colSpan={4}>
                    Totales
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatARS(resumen.totalIngresos)}
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    style={{ color: "var(--sage-700)" }}
                  >
                    {formatARS(resumen.totalComisiones)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Reparto del día por empleado */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Reparto del día
        </h2>
        <div className="bg-card border border-border rounded-md overflow-hidden">
          {resumen.comisionesPorEmpleado.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No hay comisiones devengadas hoy.
            </div>
          ) : (
            resumen.comisionesPorEmpleado.map((row) => (
              <div
                key={row.empleado.id}
                className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium">{row.empleado.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.lineas} línea{row.lineas !== 1 ? "s" : ""} ·{" "}
                    {row.pctDelTotal.toFixed(0)}% del total cobrado
                  </p>
                </div>
                <p
                  className="font-display text-xl tabular-nums"
                  style={{ color: "var(--sage-700)" }}
                >
                  {formatARS(row.total)}
                </p>
              </div>
            ))
          )}

          <div
            className="flex items-center justify-between px-4 py-3 bg-cream/40 border-t border-border"
            style={{ borderTopStyle: "dashed" }}
          >
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-xs">
                Para el local
              </p>
              <p className="text-xs text-muted-foreground">
                Total cobrado − comisiones del equipo
              </p>
            </div>
            <p
              className="font-display text-xl tabular-nums"
              style={{
                color:
                  resumen.paraElLocal >= 0
                    ? "var(--ink)"
                    : "var(--danger)",
              }}
            >
              {formatARS(resumen.paraElLocal)}
            </p>
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-cream/30 border-t border-border">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-xs">
                Neto del negocio
              </p>
              <p className="text-xs text-muted-foreground">
                Para el local − costo de insumos ({formatARS(resumen.costoInsumos)})
              </p>
            </div>
            <p
              className="font-display text-xl tabular-nums"
              style={{
                color:
                  resumen.netoNegocio >= 0
                    ? "var(--sage-700)"
                    : "var(--danger)",
              }}
            >
              {formatARS(resumen.netoNegocio)}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Estas comisiones quedan devengadas. Se pagan efectivamente cuando
          cargues un egreso de rubro <em>Sueldos</em> a fin de período.
        </p>
      </section>

      {/* Arqueo de efectivo */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Arqueo de efectivo
        </h2>

        <div className="bg-card border border-border rounded-md p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CurrencyField
              label="Saldo inicial efectivo"
              name="saldo_inicial_ef"
              value={saldoInicial}
              onChange={setSaldoInicial}
              error={errors.saldo_inicial_ef}
              hint="Lo que había en caja al abrir"
            />
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Esperado en caja
              </label>
              <p className="font-display text-2xl tabular-nums pt-1">
                {formatARS(efectivoEsperado)}
              </p>
              <p className="text-xs text-muted-foreground">
                inicial + ingresos EF − egresos EF
                {resumen.giftCards.vendidasEfectivo > 0 && (
                  <>
                    {" "}
                    + {formatARS(resumen.giftCards.vendidasEfectivo)} de gift
                    cards vendidas en efectivo
                  </>
                )}
              </p>
            </div>
          </div>

          <div>
            <p className="block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Conteo por denominación
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {DENOMINACIONES_ARS.map((d) => {
                const cant = billetes[d] ?? 0;
                const sub = d * cant;
                return (
                  <div
                    key={d}
                    className="border border-border rounded-md p-3 space-y-1"
                  >
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {DENOM_LABELS[d]}
                    </p>
                    <input
                      type="number"
                      name={`billete_${d}`}
                      min={0}
                      step={1}
                      value={cant === 0 ? "" : cant}
                      onChange={(e) => {
                        const v = e.target.value;
                        setBilletes((prev) => ({
                          ...prev,
                          [d]: v === "" ? 0 : Math.max(0, Math.floor(Number(v))),
                        }));
                      }}
                      placeholder="0"
                      className="w-full px-2 py-1 border border-border rounded bg-card text-sm tabular-nums"
                    />
                    <p className="text-xs text-muted-foreground tabular-nums">
                      = {formatARS(sub)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-border">
            <SummaryBox
              label="Contado"
              value={formatARS(efectivoContado)}
            />
            <SummaryBox
              label="Esperado"
              value={formatARS(efectivoEsperado)}
            />
            <SummaryBox
              label="Diferencia"
              // Medio centavo de tolerancia, y el valor se muestra en cero
              // cuando cuadra. Comparar contra 0 exacto no servía: la suma de
              // decimales deja polvo de coma flotante y el cierre decía
              // "sobrante" por una diezmilésima de peso que nadie puede contar.
              value={formatARS(cuadra ? 0 : diferencia)}
              color={cuadra ? "sage-700" : diferencia > 0 ? "ink" : "danger"}
              hint={cuadra ? "Cuadra" : diferencia > 0 ? "Sobrante" : "Faltante"}
            />
          </div>
        </div>
      </section>

      {/* Banco y otros */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Otros valores
        </h2>
        <div className="bg-card border border-border rounded-md p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CurrencyField
            label="Saldo banco contado"
            name="saldo_banco"
            defaultValue={arrastre.saldoInicialBanco}
            error={errors.saldo_banco}
            hint={
              arrastre.desdeCierre
                ? "Pre-cargado desde el cierre anterior"
                : "Lo que ves en cuentas al cierre"
            }
          />
          <CurrencyField
            label="Vouchers"
            name="vouchers"
            error={errors.vouchers}
          />
          <CurrencyField
            label="Giftcards"
            name="giftcards"
            error={errors.giftcards}
          />
          <CurrencyField
            label="Autoconsumos"
            name="autoconsumos"
            error={errors.autoconsumos}
          />
          <CurrencyField
            label="Cheques"
            name="cheques"
            error={errors.cheques}
          />
          <CurrencyField
            label="Aportes"
            name="aportes"
            error={errors.aportes}
          />
          <CurrencyField
            label="Ingresos en CC"
            name="ingresos_cc"
            error={errors.ingresos_cc}
          />
          <CurrencyField
            label="Anticipos"
            name="anticipos"
            error={errors.anticipos}
          />
        </div>
      </section>

      {/* Observación */}
      <section className="space-y-1.5">
        <label
          htmlFor="observacion"
          className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Observación
        </label>
        <textarea
          id="observacion"
          name="observacion"
          rows={3}
          className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Diferencias, retiros, eventos del día…"
        />
        {errors.observacion && (
          <p className="text-xs text-destructive">
            {errors.observacion.join(", ")}
          </p>
        )}
      </section>

      <GlobalError error={errors._ ?? errors.fecha} />

      <FormButtons
        cancelHref="/caja"
        submitLabel="Cerrar caja"
        pending={pending}
      />
    </form>
  );
}

function SummaryBox({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color?: "sage-700" | "ink" | "danger";
  hint?: string;
}) {
  const style =
    color === "sage-700"
      ? { color: "var(--sage-700)" }
      : color === "danger"
        ? { color: "var(--danger)" }
        : color === "ink"
          ? { color: "var(--ink)" }
          : undefined;
  return (
    <div className="border border-border rounded-md p-4 bg-cream/30">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className="font-display text-2xl mt-1 tabular-nums"
        style={style}
      >
        {value}
      </p>
      {hint && (
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      )}
    </div>
  );
}
