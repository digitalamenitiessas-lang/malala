"use client";

import { CurrencyInput } from "@/components/forms/currency-input";
import { useMemo, useState, useTransition } from "react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "@/components/forms/field";
import {
  createLiquidacion,
  previewLiquidacion,
  type LiquidacionPreview,
} from "@/lib/data/liquidaciones";
import type { Empleado, Sucursal } from "@/lib/types";
import { formatARS } from "@/lib/utils";
import { calcularLiquidacion } from "@/lib/liquidacion-formula";

interface Props {
  sucursalId: string;
  sucursales: Sucursal[];
  empleados: Empleado[];
  permiteCambiarSucursal: boolean;
}

function todayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * La semana que termina hoy.
 *
 * Antes proponia la QUINCENA, y el salon liquida por semana: Centro los
 * viernes, Yerba Buena los sabados. Si se liquida el dia de pago, los ultimos
 * siete dias son exactamente su semana —domingo a sabado en YB, sabado a
 * viernes en Centro— sin tener que configurar el dia de pago en ningun lado.
 *
 * No es cosmetico: con la quincena, una liquidacion del 5 arrancaba el dia 1 y
 * se llevaba puestos los anticipos de la semana ANTERIOR, que ya se habian
 * descontado al pagar. Reportado asi: "se fueron cargando anticipos en algunas
 * de las chicas que ya son de la semana pasada".
 */
function semanaQueTerminaHoy() {
  const hasta = todayYMD();
  const d = new Date(`${hasta}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 6);
  return { desde: d.toISOString().slice(0, 10), hasta };
}

/** No tiene sentido liquidar a futuro: topamos cualquier fecha a hoy. */
function clampToToday(ymd: string): string {
  const hoy = todayYMD();
  return ymd > hoy ? hoy : ymd;
}

function clampRange(r: { desde: string; hasta: string }) {
  return { desde: clampToToday(r.desde), hasta: clampToToday(r.hasta) };
}

function formatYMD(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export function NuevaLiquidacionForm({
  sucursalId: initialSucursal,
  sucursales,
  empleados,
  permiteCambiarSucursal,
}: Props) {
  const { pending: saving, run: runSave } = useTransitionFeedback();
  const [sucursalId, setSucursalId] = useState(initialSucursal);
  const [empleadoId, setEmpleadoId] = useState("");

  const q = clampRange(semanaQueTerminaHoy());
  const [desde, setDesde] = useState(q.desde);
  const [hasta, setHasta] = useState(q.hasta);

  const [preview, setPreview] = useState<LiquidacionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [horas, setHoras] = useState(0);
  // Monto fijo del periodo. Se propone prorrateado y queda editable: si esa
  // semana se acordo otra cosa, el numero lo pone quien liquida.
  const [basico, setBasico] = useState(0);
  const [diasViatico, setDiasViatico] = useState(0);

  function clearPreviewState() {
    setPreview(null);
    setPreviewError(null);
    setHoras(0);
    setBasico(0);
    setDiasViatico(0);
  }

  function doPreview() {
    setPreviewError(null);
    setErrors({});
    if (!empleadoId) {
      setPreviewError("Elegí un empleado");
      return;
    }
    startPreview(async () => {
      const res = await previewLiquidacion({
        sucursalId,
        empleadoId,
        periodoDesde: desde,
        periodoHasta: hasta,
      });
      if (!res.ok) {
        setPreviewError(
          Object.values(res.errors).flat().join(", ") || "Error",
        );
        setPreview(null);
        return;
      }
      setPreview(res.preview);
      // Proponer las horas según la jornada del empleado (editable).
      setHoras(res.preview.horas_sugeridas);
      setBasico(res.preview.sueldo_basico_sugerido);
    });
  }

  function doSave() {
    setErrors({});
    if (!preview) {
      setErrors({ _: ["Primero calculá el período"] });
      return;
    }
    if (
      preview.lineas.length === 0 &&
      horas <= 0 &&
      basico <= 0 &&
      preview.total_viatico <= 0
    ) {
      setErrors({ _: ["No hay servicios, horas ni viatico para liquidar"] });
      return;
    }
    const fd = new FormData();
    fd.set("sucursal_id", sucursalId);
    fd.set("empleado_id", empleadoId);
    fd.set("periodo_desde", desde);
    fd.set("periodo_hasta", hasta);
    fd.set("horas_trabajadas", String(horas));
    fd.set("sueldo_basico", String(basico));
    fd.set("dias_viatico", String(diasViatico));
    runSave(
      async () => {
        const res = await createLiquidacion(fd);
        if (!res.ok) {
          setErrors(res.errors);
        }
        return res;
      },
      {
        redirectTo: (res) =>
          `/liquidaciones/${(res as unknown as { liquidacionId: string }).liquidacionId}`,
        successMessage: "Liquidacion creada",
      },
    );
  }

  // Las inactivas van al final y marcadas: siguen siendo elegibles porque a
  // quien se fue hay que pagarle lo ultimo, pero no tienen que estorbar en el
  // uso normal.
  const empleadosElegibles = useMemo(
    () =>
      empleados
        .filter((e) => e.sucursal_principal_id === sucursalId)
        .sort((a, b) => Number(b.activo) - Number(a.activo)),
    [empleados, sucursalId],
  );

  // Desglose en vivo (depende de las horas que carga el usuario).
  const sueldoHoras = horas * (preview?.valor_hora ?? 0);
  // El viatico ya no se estima: sale de lo cargado dia por dia.
  const totalViatico = preview?.viatico_a_pagar ?? 0;
  // La misma cuenta que hace el servidor, no una copia a mano: antes acá se
  // sumaban los tres conceptos y a una profesional le mostraba la comisión MÁS
  // el asegurado en vez de la mayor de las dos.
  const detalle = preview
    ? calcularLiquidacion({
        tipoComision: preview.tipo_comision,
        totalComision: preview.total_comision,
        sueldoHoras,
        sueldoBasico: basico,
        viaticoAPagar: totalViatico,
        totalAnticipos: preview.total_anticipos,
        arrastre: preview.arrastre,
      })
    : null;
  const totalPagar = detalle?.total ?? 0;
  const puedeGuardar =
    !!preview &&
    (preview.lineas.length > 0 ||
      horas > 0 ||
      basico > 0 ||
      preview.total_viatico > 0 ||
      // Una semana sin trabajo pero con plata a favor igual se liquida: es
      // lo único que hay para pagarle.
      preview.arrastre > 0);

  return (
    <div className="space-y-6">
      <section className="bg-card border border-border rounded-md p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Parámetros
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Sucursal
            </label>
            <select
              value={sucursalId}
              onChange={(e) => {
                clearPreviewState();
                setSucursalId(e.target.value);
                setEmpleadoId("");
              }}
              disabled={!permiteCambiarSucursal}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm disabled:opacity-60"
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Empleado *
            </label>
            <select
              value={empleadoId}
              onChange={(e) => {
                clearPreviewState();
                setEmpleadoId(e.target.value);
              }}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
              required
            >
              <option value="">— Elegí —</option>
              {empleadosElegibles.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} · {e.porcentaje_default}%
                  {e.activo ? "" : " · dada de baja"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Desde
            </label>
            <input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => {
                clearPreviewState();
                setDesde(e.target.value);
              }}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Hasta
            </label>
            <input
              type="date"
              value={hasta}
              min={desde}
              max={todayYMD()}
              onChange={(e) => {
                clearPreviewState();
                setHasta(e.target.value);
              }}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
            />
          </div>
        </div>

        <div className="pt-2">
          <LoadingButton
            type="button"
            onClick={doPreview}
            pending={previewing}
            pendingLabel="Calculando..."
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
          >
            Calcular comisiones
          </LoadingButton>
          {previewError && (
            <p className="text-xs text-destructive mt-2">{previewError}</p>
          )}
        </div>
      </section>

      {preview && (
        <section className="bg-card border border-border rounded-md p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              Comisiones del período
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatYMD(preview.periodo_desde)} – {formatYMD(preview.periodo_hasta)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label="Servicios" value={String(preview.total_servicios)} />
            <Kpi label="Días trabajados" value={String(preview.dias_trabajados)} />
            <Kpi label="Comisiones" value={formatARS(preview.total_comision)} />
            <Kpi
              label="Valor por hora"
              value={formatARS(preview.valor_hora)}
              hint="Configurado en la ficha del empleado"
            />
          </div>

          {preview.lineas.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No hay servicios con comisión para este empleado en el período. Podés
              liquidar solo horas, viatico o ambos.
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium">Servicio</th>
                    <th className="px-3 py-2 text-right font-medium">Precio</th>
                    <th className="px-3 py-2 text-right font-medium">Com.%</th>
                    <th className="px-3 py-2 text-right font-medium">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.lineas.map((l) => (
                    <tr key={l.ingreso_linea_id}>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {formatYMD(l.fecha)}
                      </td>
                      <td className="px-3 py-2">{l.servicio_nombre}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatARS(l.precio)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {l.comision_pct}%
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatARS(l.comision_monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Horas trabajadas */}
          <div className="border-t border-border pt-4">
            <div className="sm:max-w-xs space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Horas trabajadas en el período
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={horas || ""}
                onChange={(e) => setHoras(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0"
                className="w-full px-3 py-2 text-right tabular-nums border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                {horas > 0
                  ? `${horas} h × ${formatARS(preview.valor_hora)} = ${formatARS(sueldoHoras)}`
                  : "Cargá las horas efectivamente trabajadas"}
              </p>
              {preview.horas_sugeridas > 0 && (
                <p className="text-xs text-muted-foreground">
                  Sugerido por la jornada: {preview.horas_sugeridas} h.
                  {horas !== preview.horas_sugeridas && (
                    <button
                      type="button"
                      onClick={() => setHoras(preview.horas_sugeridas)}
                      className="ml-1 underline hover:text-foreground"
                    >
                      Usar sugerido
                    </button>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Sueldo basico del periodo. Solo aparece si esta persona lo tiene:
              para el resto seria un campo en cero pidiendo atencion. */}
          {(preview.sueldo_basico_sugerido > 0 || basico > 0) && (
            <div className="border-t border-border pt-4">
              <div className="sm:max-w-xs space-y-1.5">
                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Sueldo básico del período
                </label>
                <CurrencyInput
                  value={basico}
                  onChange={setBasico}
                  min={0}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  Va arriba de la comisión y de las horas.
                </p>
                {preview.sueldo_basico_sugerido > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sugerido por su semanal:{" "}
                    {formatARS(preview.sueldo_basico_sugerido)}.
                    {Math.abs(basico - preview.sueldo_basico_sugerido) > 0.5 && (
                      <button
                        type="button"
                        onClick={() => setBasico(preview.sueldo_basico_sugerido)}
                        className="ml-1 underline hover:text-foreground"
                      >
                        Usar sugerido
                      </button>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
                Viáticos del período
              </h3>
              <span className="text-sm tabular-nums">
                {formatARS(preview.total_viatico)}
                {preview.viatico_a_pagar !== preview.total_viatico && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (a pagar acá: {formatARS(preview.viatico_a_pagar)})
                  </span>
                )}
              </span>
            </div>

            {preview.viaticos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay viáticos cargados en este período. Se cargan día por día
                desde la ficha de la empleada.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card text-sm">
                  {preview.viaticos.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <span className="tabular-nums">{v.fecha}</span>
                        {v.observacion && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {v.observacion}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {v.pagado && (
                          <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-stone-500">
                            ya entregado
                          </span>
                        )}
                        <span className="tabular-nums">{formatARS(v.monto)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                {preview.viatico_a_pagar !== preview.total_viatico && (
                  <p className="text-xs text-muted-foreground">
                    Los marcados como ya entregados suman a lo que cobró en el
                    período, pero no se vuelven a pagar acá: esa plata ya salió de
                    la caja el día que se le dio.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Anticipos del período */}
          {preview.anticipos.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Anticipos del período (se descuentan)
              </p>
              <ul className="divide-y divide-border rounded-md border border-border bg-cream/30">
                {preview.anticipos.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {formatYMD(a.fecha)}
                      {a.observacion ? ` · ${a.observacion}` : ""}
                    </span>
                    <span className="tabular-nums text-warning">
                      − {formatARS(a.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Desglose total */}
          <div className="rounded-md border border-border bg-cream/40 p-4 space-y-1.5">
            {/* En el arreglo de profesional se cobra una de las dos, así que
                mostrar las dos sumando era lo que hacía parecer que el total
                estaba mal. Se muestran igual —hacen falta para entender por
                qué ganó una— pero tachada la que no se paga. */}
            <DesgloseRow
              label="Comisiones"
              value={formatARS(preview.total_comision)}
              tachado={detalle?.gana === "asegurado"}
            />
            <DesgloseRow
              label={
                detalle?.gana ? "Asegurado por horas" : "Sueldo por horas"
              }
              value={formatARS(sueldoHoras)}
              tachado={detalle?.gana === "comision"}
            />
            {detalle?.gana && (
              <p className="text-[11px] text-muted-foreground pt-0.5">
                Cobra {detalle.gana === "comision" ? "la comisión" : "el asegurado"},
                que es lo mayor de las dos. No se suman.
              </p>
            )}
            {totalViatico > 0 && (
              <DesgloseRow
                label="Viatico"
                value={formatARS(totalViatico)}
              />
            )}
            {preview.total_anticipos > 0 && (
              <DesgloseRow
                label="Anticipos"
                value={`− ${formatARS(preview.total_anticipos)}`}
                muted
              />
            )}
            {/* Lo que quedó sin pagar de la liquidación anterior por redondeo.
                Entra solo; se muestra para que el total no parezca un error. */}
            {preview.arrastre > 0 && (
              <DesgloseRow
                label="A favor de la semana pasada"
                value={formatARS(preview.arrastre)}
              />
            )}
            <div className="flex items-center justify-between border-t border-border pt-2 mt-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Total a pagar
              </span>
              <span
                className="font-display text-xl tabular-nums"
                style={{ color: "var(--sage-700)" }}
              >
                {formatARS(totalPagar)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <LoadingButton
              type="button"
              onClick={doSave}
              pending={saving}
              pendingLabel="Guardando..."
              disabled={!puedeGuardar || saving}
              className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
            >
              Guardar liquidación
            </LoadingButton>
            <p className="text-xs text-muted-foreground">
              Se generará una liquidación pendiente. Luego registrás el pago al
              empleado.
            </p>
          </div>

          {errors._ && (
            <p className="text-sm text-destructive">{errors._.join(", ")}</p>
          )}
        </section>
      )}
    </div>
  );
}

function DesgloseRow({
  label,
  value,
  muted,
  tachado,
}: {
  label: string;
  value: string;
  muted?: boolean;
  /** Se muestra para explicar el total, pero no se paga. */
  tachado?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between text-sm ${
        tachado ? "opacity-50" : ""
      }`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums ${muted ? "text-warning" : ""} ${
          tachado ? "line-through" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Kpi({
  label,
  value,
  highlight,
  hint,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  hint?: string;
}) {
  return (
    <div
      className="rounded-md border border-border p-4"
      style={{ backgroundColor: highlight ? "rgb(82 116 79 / 0.06)" : undefined }}
      title={hint}
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className="mt-1 font-display text-xl tabular-nums"
        style={{ color: highlight ? "var(--sage-700)" : undefined }}
      >
        {value}
      </p>
    </div>
  );
}
