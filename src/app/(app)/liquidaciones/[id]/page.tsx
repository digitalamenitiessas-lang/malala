import Link from "next/link";

import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import {
  getEfectivoEsperadoPeriodo,
  getLiquidacion,
} from "@/lib/data/liquidaciones";
import { listMediosPago } from "@/lib/data/medios-pago";
import { formatARS, formatDateTime } from "@/lib/utils";
import { MarcarPagadaForm } from "@/components/forms/marcar-pagada-form";
import { AnularLiquidacionForm } from "@/components/forms/anular-liquidacion-form";

function formatYMD(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  anulada: "Anulada",
};

export default async function LiquidacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const { id } = await params;
  const data = await getLiquidacion(id);
  if (!data) notFound();

  const { liquidacion, empleado, sucursal, medioPago, lineas } = data;
  const efectivo = await getEfectivoEsperadoPeriodo({
    sucursalId: liquidacion.sucursal_id,
    desde: liquidacion.periodo_desde,
    hasta: liquidacion.periodo_hasta,
  });
  const mediosPagoActivos = await listMediosPago({
    sucursalId: liquidacion.sucursal_id,
    soloActivos: true,
    excluirGiftCard: true,
  });

  const diferencia = efectivo.neto_ef - liquidacion.total_pagar;

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
              {empleado.nombre}
            </h1>
            <p className="text-sm text-muted-foreground">
              {sucursal.nombre} · {formatYMD(liquidacion.periodo_desde)} –{" "}
              {formatYMD(liquidacion.periodo_hasta)}
            </p>
          </div>
          <span
            className="inline-block rounded-full px-3 py-1 text-xs uppercase tracking-wider"
            style={{
              backgroundColor:
                liquidacion.estado === "pagada"
                  ? "rgb(82 116 79 / 0.12)"
                  : liquidacion.estado === "pendiente"
                    ? "rgb(201 169 97 / 0.15)"
                    : "rgb(180 0 0 / 0.08)",
              color:
                liquidacion.estado === "pagada"
                  ? "var(--sage-700)"
                  : liquidacion.estado === "pendiente"
                    ? "var(--warning)"
                    : "var(--danger)",
            }}
          >
            {ESTADO_LABEL[liquidacion.estado]}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-card border border-border rounded-md overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-cream/40">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              Detalle del período
            </h2>
          </div>
          {lineas.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground italic">
              No hay líneas registradas.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-cream/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Fecha</th>
                  <th className="px-4 py-2 text-left font-medium">Servicio</th>
                  <th className="px-4 py-2 text-right font-medium">Precio</th>
                  <th className="px-4 py-2 text-right font-medium">%</th>
                  <th className="px-4 py-2 text-right font-medium">Comisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lineas.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {formatYMD(l.fecha)}
                    </td>
                    <td className="px-4 py-2">{l.servicio_nombre}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatARS(l.precio)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {l.comision_pct}%
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {formatARS(l.comision_monto)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-cream/40 font-medium">
                  <td colSpan={4} className="px-4 py-3 text-right">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatARS(liquidacion.total_comision)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        <aside className="space-y-4">
          <section className="bg-card border border-border rounded-md p-5 space-y-3">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              Resumen
            </h2>
            <KV label="Servicios" value={String(liquidacion.total_servicios)} />
            <KV label="Días trabajados" value={String(liquidacion.dias_trabajados)} />
            <KV label="Comisiones" value={formatARS(liquidacion.total_comision)} />
            {liquidacion.horas_trabajadas > 0 && (
              <KV
                label={`Sueldo (${liquidacion.horas_trabajadas} h × ${formatARS(liquidacion.valor_hora)})`}
                value={formatARS(liquidacion.sueldo_horas)}
              />
            )}
            {liquidacion.total_viatico > 0 && (
              <KV
                // Las liquidaciones viejas guardaron el viático como días ×
                // monto fijo; las nuevas suman los cargados día por día, así que
                // el detalle sólo tiene sentido si hay un monto por día.
                label={
                  liquidacion.viatico_por_dia > 0
                    ? `Viatico (${liquidacion.dias_viatico} dias × ${formatARS(liquidacion.viatico_por_dia)})`
                    : "Viatico del periodo"
                }
                value={formatARS(liquidacion.total_viatico)}
              />
            )}
            {liquidacion.total_anticipos > 0 && (
              <KV
                label="Anticipos"
                value={`− ${formatARS(liquidacion.total_anticipos)}`}
                color="var(--warning)"
              />
            )}
            <div className="pt-2 border-t border-border">
              <KV
                label="Total a pagar"
                value={formatARS(liquidacion.total_pagar)}
                strong
              />
            </div>
          </section>

          <section className="bg-cream/40 border border-border rounded-md p-5 space-y-3">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              Efectivo del período
            </h2>
            <KV label="Ingresos EF" value={formatARS(efectivo.ingresos_ef)} />
            <KV label="Egresos EF" value={formatARS(efectivo.egresos_ef)} />
            <KV label="Esperado en caja" value={formatARS(efectivo.neto_ef)} strong />
            <div className="pt-2 border-t border-border">
              <KV
                label="Después del pago"
                value={formatARS(diferencia)}
                color={diferencia >= 0 ? "var(--sage-700)" : "var(--danger)"}
                strong
              />
              <p className="text-[10px] text-muted-foreground pt-1">
                Si pagás en efectivo, este sería el efectivo restante esperado.
              </p>
            </div>
          </section>

          {liquidacion.estado === "pendiente" ? (
            <MarcarPagadaForm
              liquidacionId={liquidacion.id}
              mediosPago={mediosPagoActivos}
            />
          ) : (
            <section className="bg-card border border-border rounded-md p-5 space-y-2 text-sm">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
                Pago registrado
              </h2>
              {medioPago && (
                <p>
                  <span className="text-muted-foreground">Medio:</span>{" "}
                  {medioPago.nombre} ({medioPago.codigo})
                </p>
              )}
              {liquidacion.fecha_pago && (
                <p>
                  <span className="text-muted-foreground">Fecha:</span>{" "}
                  {formatDateTime(liquidacion.fecha_pago)}
                </p>
              )}
              {liquidacion.observacion && (
                <p className="text-muted-foreground italic pt-1">
                  {liquidacion.observacion}
                </p>
              )}
              {liquidacion.egreso_id && (
                <p className="pt-2 border-t border-border">
                  <span className="text-muted-foreground">Egreso:</span>{" "}
                  <Link
                    href={`/egresos`}
                    className="text-sage-700 hover:text-sage-900 underline"
                  >
                    registrado en caja
                  </Link>
                </p>
              )}
            </section>
          )}

          {scope.esAdmin && (
            <AnularLiquidacionForm liquidacionId={liquidacion.id} />
          )}
        </aside>
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  strong,
  color,
}: {
  label: string;
  value: string;
  strong?: boolean;
  color?: string;
}) {
  return (
    <div className="flex justify-between items-baseline text-sm tabular-nums">
      <span className="text-muted-foreground">{label}</span>
      <span
        style={{
          fontWeight: strong ? 600 : 400,
          color: color,
        }}
      >
        {value}
      </span>
    </div>
  );
}
