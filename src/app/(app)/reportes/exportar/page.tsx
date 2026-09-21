import Image from "next/image";
import { redirect } from "next/navigation";

import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { listIngresos } from "@/lib/data/ingresos";
import { listEgresos } from "@/lib/data/egresos";
import { listMediosPago } from "@/lib/data/medios-pago";
import { listMotivosDescuento } from "@/lib/data/motivos-descuento";
import {
  aggregate,
  comisionesPorEmpleado,
  descuentosPorMotivo,
} from "@/lib/data/ingresos-helpers";
import { BarChart } from "@/components/charts/bar-chart";
import { PrintButton } from "@/components/print-button";
import { ReporteFiltroForm } from "../_filter-form";
import { parseReporteFiltros, type ReporteFiltrosInput } from "../_filters";
import { formatARS, formatDateTimeLong } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<ReporteFiltrosInput>;
}

export default async function ReporteExportarPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerReportes) redirect("/dashboard");

  const sp = await searchParams;
  const filtros = parseReporteFiltros(sp, scope);

  // La exportación se acota a la sucursal activa de la sesión.
  const sucursal = await getActiveSucursal();
  const sucursalId = sucursal?.id;

  const [ingresos, egresos, mediosPago, motivos] = await Promise.all([
    listIngresos({
      sucursalId,
      desde: filtros.desdeIso,
      hasta: filtros.hastaIso,
    }),
    listEgresos({
      sucursalId,
      desde: filtros.desdeIso,
      hasta: filtros.hastaIso,
    }),
    listMediosPago(),
    listMotivosDescuento(),
  ]);

  const totals = aggregate(ingresos);
  const egresosPagados = egresos.filter((e) => e.egreso.pagado);
  const egresosTotal = egresosPagados.reduce((a, e) => a + e.egreso.valor, 0);
  const ticketPromedio =
    totals.cantidad > 0 ? totals.total / totals.cantidad : 0;

  // --- Serie diaria para el gráfico de ventas ---
  const porDia = new Map<string, { total: number; tickets: number }>();
  for (const row of ingresos) {
    const dia = row.ingreso.fecha.slice(0, 10);
    const cur = porDia.get(dia) ?? { total: 0, tickets: 0 };
    cur.total += row.breakdown.total;
    cur.tickets += 1;
    porDia.set(dia, cur);
  }
  const serieDiaria = Array.from(porDia.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, v]) => ({ fecha, total: v.total, tickets: v.tickets }));

  // --- Flujo de caja: ingresos por medio de pago ---
  const mpById = new Map(mediosPago.map((m) => [m.id, m]));
  const ingresosPorMp = new Map<string, { nombre: string; monto: number }>();
  for (const row of ingresos) {
    const add = (mpId: string | undefined, monto: number) => {
      if (!mpId) return;
      const mp = mpById.get(mpId);
      if (!mp) return;
      const cur = ingresosPorMp.get(mp.id) ?? { nombre: mp.nombre, monto: 0 };
      cur.monto += monto;
      ingresosPorMp.set(mp.id, cur);
    };
    add(row.ingreso.mp1_id, row.ingreso.valor1);
    if (row.ingreso.mp2_id && row.ingreso.valor2) {
      add(row.ingreso.mp2_id, row.ingreso.valor2);
    }
  }
  const ingresosMpFilas = Array.from(ingresosPorMp.values()).sort(
    (a, b) => b.monto - a.monto,
  );

  // --- Flujo de caja: egresos por rubro (pagados) ---
  const egresosPorRubro = new Map<string, { rubro: string; monto: number }>();
  for (const row of egresosPagados) {
    if (!row.rubro) continue;
    const cur = egresosPorRubro.get(row.rubro.id) ?? {
      rubro: row.rubro.subrubro
        ? `${row.rubro.rubro} / ${row.rubro.subrubro}`
        : row.rubro.rubro,
      monto: 0,
    };
    cur.monto += row.egreso.valor;
    egresosPorRubro.set(row.rubro.id, cur);
  }
  const egresosRubroFilas = Array.from(egresosPorRubro.values()).sort(
    (a, b) => b.monto - a.monto,
  );

  // --- Rentabilidad por servicio ---
  const porServicio = new Map<
    string,
    { nombre: string; cantidad: number; facturado: number; comisiones: number; costoInsumos: number }
  >();
  for (const row of ingresos) {
    for (const linea of row.lineas) {
      if (!linea.servicio) continue;
      const cur = porServicio.get(linea.servicio.id) ?? {
        nombre: linea.servicio.nombre,
        cantidad: 0,
        facturado: 0,
        comisiones: 0,
        costoInsumos: 0,
      };
      cur.cantidad += linea.cantidad;
      cur.facturado += linea.subtotal;
      cur.comisiones += linea.comision_monto;
      cur.costoInsumos += linea.costoInsumos;
      porServicio.set(linea.servicio.id, cur);
    }
  }
  const servicioFilas = Array.from(porServicio.values())
    .map((f) => ({ ...f, neto: f.facturado - f.comisiones - f.costoInsumos }))
    .sort((a, b) => b.facturado - a.facturado);

  // --- Rendimiento por empleada ---
  const comisiones = comisionesPorEmpleado(ingresos);
  const facturadoPorEmpleado = new Map<string, number>();
  for (const row of ingresos) {
    for (const linea of row.lineas) {
      if (!linea.empleado) continue;
      facturadoPorEmpleado.set(
        linea.empleado.id,
        (facturadoPorEmpleado.get(linea.empleado.id) ?? 0) + linea.subtotal,
      );
    }
  }

  // --- Descuentos por motivo ---
  const motivosById = new Map(motivos.map((m) => [m.id, m]));
  const descuentos = descuentosPorMotivo(ingresos, motivosById);

  const generado = formatDateTimeLong(new Date());

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Controles (no se imprimen) */}
      <div className="no-print space-y-4">
        <ReporteFiltroForm
          action="/reportes/exportar"
          filtros={filtros}
          sucursales={[]}
          mostrarSucursal={false}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Vista de exportación · usá <strong>Exportar PDF</strong> y elegí
            “Guardar como PDF”.
          </p>
          <PrintButton />
        </div>
      </div>

      {/* Documento imprimible */}
      <div className="print-doc space-y-6 bg-white">
        <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-malala.png"
              alt="MALALA"
              width={48}
              height={48}
              className="h-12 w-12 rounded-full border border-stone-100 object-cover"
            />
            <div>
              <p className="font-display text-2xl tracking-[0.2em] uppercase">
                MALALA
              </p>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Reporte de gestión
              </p>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{sucursal?.nombre ?? "Todas las sucursales"}</p>
            <p className="text-muted-foreground tabular-nums">
              {filtros.desde} → {filtros.hasta}
            </p>
            <p className="text-xs text-muted-foreground">Generado: {generado}</p>
          </div>
        </header>

        {/* KPIs */}
        <section className="print-break-avoid space-y-2">
          <SecTitle>Resumen del período</SecTitle>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            <Kpi label="Ventas" value={String(totals.cantidad)} hint="tickets" />
            <Kpi label="Facturado" value={formatARS(totals.total)} />
            <Kpi label="Ticket prom." value={formatARS(ticketPromedio)} />
            <Kpi label="Comisiones" value={formatARS(totals.comisiones)} />
            <Kpi label="Costo insumos" value={formatARS(totals.costoInsumos)} />
            <Kpi label="Neto operativo" value={formatARS(totals.neto)} />
            <Kpi label="Egresos pagados" value={formatARS(egresosTotal)} />
            <Kpi
              label="Neto del período"
              value={formatARS(totals.total - egresosTotal)}
            />
          </div>
        </section>

        {/* Gráfico de ventas diarias */}
        <section className="print-break-avoid space-y-2">
          <SecTitle>Ventas diarias</SecTitle>
          <div className="rounded-md border border-border bg-card p-4 text-sage-700">
            <BarChart data={serieDiaria} />
          </div>
        </section>

        {/* Flujo de caja */}
        <section className="print-break-avoid space-y-2">
          <SecTitle>Flujo de caja</SecTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Tabla
              titulo="Ingresos por método de pago"
              cols={["Medio", "Monto"]}
              filas={ingresosMpFilas.map((f) => [f.nombre, formatARS(f.monto)])}
              total={["Total", formatARS(totals.total)]}
              vacio="Sin ingresos."
            />
            <Tabla
              titulo="Egresos por rubro (pagados)"
              cols={["Rubro", "Monto"]}
              filas={egresosRubroFilas.map((f) => [f.rubro, formatARS(f.monto)])}
              total={["Total", formatARS(egresosTotal)]}
              vacio="Sin egresos pagados."
            />
          </div>
        </section>

        {/* Rentabilidad por servicio */}
        <section className="print-break-avoid space-y-2">
          <SecTitle>Rentabilidad por servicio</SecTitle>
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Servicio</th>
                  <th className="text-right font-medium px-3 py-2">Cant.</th>
                  <th className="text-right font-medium px-3 py-2">Facturado</th>
                  <th className="text-right font-medium px-3 py-2">Comisión</th>
                  <th className="text-right font-medium px-3 py-2">Insumos</th>
                  <th className="text-right font-medium px-3 py-2">Neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {servicioFilas.length === 0 ? (
                  <FilaVacia cols={6} texto="No hay ventas en el período." />
                ) : (
                  servicioFilas.map((f, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium">{f.nombre}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f.cantidad}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatARS(f.facturado)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatARS(f.comisiones)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatARS(f.costoInsumos)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${f.neto >= 0 ? "text-sage-700" : "text-destructive"}`}>{formatARS(f.neto)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Rendimiento por empleada */}
        <section className="print-break-avoid space-y-2">
          <SecTitle>Rendimiento por empleada</SecTitle>
          <Tabla
            cols={["Empleada", "Servicios", "Facturado", "Comisión"]}
            filas={comisiones.map((c) => [
              c.empleado.nombre,
              String(c.lineas),
              formatARS(facturadoPorEmpleado.get(c.empleado.id) ?? 0),
              formatARS(c.total),
            ])}
            vacio="Sin servicios en el período."
          />
        </section>

        {/* Descuentos */}
        <section className="print-break-avoid space-y-2">
          <SecTitle>Descuentos por motivo</SecTitle>
          <Tabla
            cols={["Motivo", "Usos", "Monto"]}
            filas={descuentos.map((d) => [
              d.motivo,
              String(d.cantidad),
              formatARS(d.total),
            ])}
            total={[
              "Total",
              String(descuentos.reduce((a, d) => a + d.cantidad, 0)),
              formatARS(descuentos.reduce((a, d) => a + d.total, 0)),
            ]}
            vacio="Sin descuentos en el período."
          />
        </section>
      </div>
    </div>
  );
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-md p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-display text-lg mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Tabla({
  titulo,
  cols,
  filas,
  total,
  vacio,
}: {
  titulo?: string;
  cols: string[];
  filas: string[][];
  total?: string[];
  vacio: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      {titulo && (
        <div className="px-3 py-2 border-b border-border bg-cream/30">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {titulo}
          </p>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            {cols.map((c, i) => (
              <th
                key={c}
                className={`px-3 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.length === 0 ? (
            <FilaVacia cols={cols.length} texto={vacio} />
          ) : (
            filas.map((fila, i) => (
              <tr key={i}>
                {fila.map((celda, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2 ${j === 0 ? "font-medium" : "text-right tabular-nums"}`}
                  >
                    {celda}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {total && filas.length > 0 && (
          <tfoot className="bg-cream/30 text-xs uppercase tracking-wider">
            <tr className="border-t-2 border-border">
              {total.map((celda, j) => (
                <td
                  key={j}
                  className={`px-3 py-2 font-semibold ${j === 0 ? "" : "text-right tabular-nums"}`}
                >
                  {celda}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function FilaVacia({ cols, texto }: { cols: number; texto: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-6 text-center text-sm text-muted-foreground">
        {texto}
      </td>
    </tr>
  );
}
