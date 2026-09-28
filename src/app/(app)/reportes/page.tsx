import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  Coins,
  CreditCard,
  FileText,
  ListChecks,
  Rows3,
  Sparkles,
  TicketPercent,
  Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { listIngresos } from "@/lib/data/ingresos";
import { listEgresos } from "@/lib/data/egresos";
import { listSucursales } from "@/lib/data/sucursales";
import { aggregate } from "@/lib/data/ingresos-helpers";
import { formatARS } from "@/lib/utils";
import { parseReporteFiltros, type ReporteFiltrosInput } from "./_filters";
import { ReporteFiltroForm } from "./_filter-form";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<ReporteFiltrosInput>;
}

export default async function ReportesHubPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerReportes) redirect("/dashboard");

  const sp = await searchParams;
  const filtros = parseReporteFiltros(sp, scope);

  const sucursalesAll = await listSucursales({ soloActivas: true });
  const sucursales = sucursalesAll.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );

  const [ingresos, egresos] = await Promise.all([
    listIngresos({
      sucursalId: filtros.sucursalId,
      desde: filtros.desdeIso,
      hasta: filtros.hastaIso,
    }),
    listEgresos({
      sucursalId: filtros.sucursalId,
      desde: filtros.desdeIso,
      hasta: filtros.hastaIso,
    }),
  ]);

  const ingresoTotals = aggregate(ingresos);
  const egresosTotal = egresos
    .filter((e) => e.egreso.pagado)
    .reduce((acc, e) => acc + e.egreso.valor, 0);
  const ticketPromedio =
    ingresoTotals.cantidad > 0 ? ingresoTotals.total / ingresoTotals.cantidad : 0;

  const reportes = [
    {
      href: "/reportes/ventas",
      label: "Ventas",
      desc: "Listado detallado del período con totales, comisiones y neto",
      Icon: ClipboardList,
    },
    {
      href: "/reportes/servicios",
      label: "Rentabilidad por servicio",
      desc: "Qué servicios dan margen y cuáles pierden plata",
      Icon: Sparkles,
    },
    {
      href: "/reportes/empleadas",
      label: "Rendimiento por empleada",
      desc: "Servicios, facturación, comisiones y neto por empleada",
      Icon: Users,
    },
    {
      href: "/reportes/profesionales",
      label: "Resumen semanal por profesional",
      desc: "Facturado y servicios por profesional, con cortes semanales",
      Icon: Rows3,
    },
    {
      href: "/reportes/resultados",
      label: "Estado de resultados",
      desc: "Lo que gana el salón operando, con retiros e inversión bajo la línea",
      Icon: Coins,
    },
    {
      href: "/reportes/flujo-caja",
      label: "Flujo de caja",
      desc: "Ingresos por método de pago, egresos por rubro, neto del período",
      Icon: Coins,
    },
    {
      href: "/reportes/medios-pago",
      label: "Medios de pago",
      desc: "Cobros por medio: operaciones, ticket promedio, recargo y cuenta destino",
      Icon: CreditCard,
    },
    {
      href: "/reportes/descuentos",
      label: "Descuentos",
      desc: "Usos y montos por tipo de descuento, con el detalle de cada venta",
      Icon: TicketPercent,
    },
    {
      href: "/reportes/auditoria",
      label: "Auditoría",
      desc: "Línea de tiempo de cada movimiento operativo",
      Icon: ListChecks,
    },
  ];

  // Construir querystring que conserve filtros al ir a sub-reportes
  const qs = new URLSearchParams();
  if (sp.desde) qs.set("desde", filtros.desde);
  if (sp.hasta) qs.set("hasta", filtros.hasta);
  if (filtros.sucursalId) qs.set("sucursal", filtros.sucursalId);
  const qsStr = qs.toString() ? `?${qs.toString()}` : "";

  return (
    <div className="space-y-8 max-w-6xl">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Control de gestión
          </p>
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Reportes
          </h1>
          <p className="text-sm text-muted-foreground">
            Período {filtros.desde} → {filtros.hasta}
            {filtros.sucursalId
              ? ` · ${sucursales.find((s) => s.id === filtros.sucursalId)?.nombre ?? ""}`
              : sucursales.length > 1
                ? " · todas las sucursales"
                : ""}
          </p>
        </div>
        <Link
          href={`/reportes/exportar${qsStr}`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
        >
          <FileText className="h-4 w-4 stroke-[1.5]" />
          Exportar PDF
        </Link>
      </header>

      <ReporteFiltroForm
        action="/reportes"
        filtros={filtros}
        sucursales={sucursales}
      />

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Ventas" value={String(ingresoTotals.cantidad)} hint="tickets" />
        <Kpi label="Facturado" value={formatARS(ingresoTotals.total)} accent="sage" />
        <Kpi label="Ticket prom." value={formatARS(ticketPromedio)} />
        <Kpi label="Comisiones" value={formatARS(ingresoTotals.comisiones)} hint="al equipo" />
        <Kpi label="Costo insumos" value={formatARS(ingresoTotals.costoInsumos)} />
        <Kpi
          label="Neto operativo"
          value={formatARS(ingresoTotals.neto)}
          accent={ingresoTotals.neto >= 0 ? "sage" : "danger"}
        />
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi
          label="Egresos pagados"
          value={formatARS(egresosTotal)}
          hint="del período"
          accent="warn"
        />
        <Kpi
          label="Neto del período"
          value={formatARS(ingresoTotals.total - egresosTotal)}
          hint="facturado − egresos pagos"
          accent={
            ingresoTotals.total - egresosTotal >= 0 ? "sage" : "danger"
          }
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5" />
          Reportes disponibles
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportes.map(({ href, label, desc, Icon }) => (
            <Link
              key={href}
              href={`${href}${qsStr}`}
              className="bg-card border border-border rounded-md p-5 hover:bg-cream/40 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-sage-50 p-2">
                  <Icon className="h-5 w-5 stroke-[1.5] text-sage-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "sage" | "danger" | "warn";
}) {
  const color =
    accent === "sage"
      ? "text-sage-700"
      : accent === "danger"
        ? "text-destructive"
        : accent === "warn"
          ? "text-warning"
          : "";
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`font-display text-xl mt-1 tabular-nums ${color}`}>{value}</p>
      {hint && (
        <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
      )}
    </div>
  );
}
