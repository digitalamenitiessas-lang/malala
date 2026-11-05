import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { getConteo } from "@/lib/data/stock-control";
import { aEnvases, envaseDe, fmtEnvases } from "@/lib/stock-planillas";
import { formatARS, formatDateTime } from "@/lib/utils";
import { ConteoDetalleTabla } from "./tabla";

export const dynamic = "force-dynamic";

export default async function ConteoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!buildAccessScope(user).puedeVerStock) redirect("/dashboard");
  const { id } = await params;
  const conteo = await getConteo(id);
  if (!conteo) notFound();

  const filas = conteo.items.map((i) => {
    const diferencia = i.contado - i.sistema;
    const valor = diferencia * (i.costo_unitario ?? 0);
    const deposito =
      i.sistema_deposito != null && i.contado_deposito != null
        ? `dep. ${fmtEnvases(aEnvases(i.sistema_deposito, i.insumo))} → ${fmtEnvases(aEnvases(i.contado_deposito, i.insumo))}`
        : null;
    return {
      id: i.insumo.id,
      nombre: i.insumo.nombre,
      detalle: [i.insumo.proveedor, `envase ${envaseDe(i.insumo)}`, deposito]
        .filter(Boolean)
        .join(" · "),
      sistema: aEnvases(i.sistema, i.insumo),
      contado: aEnvases(i.contado, i.insumo),
      diferencia: aEnvases(diferencia, i.insumo),
      cambioDeposito: i.sistema_deposito !== i.contado_deposito,
      valor,
    };
  });

  const faltante = filas.reduce((a, f) => a + Math.min(f.valor, 0), 0);
  const sobrante = filas.reduce((a, f) => a + Math.max(f.valor, 0), 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">Conteo</h1>
          <p className="text-sm text-muted-foreground">
            Contado el {formatDateTime(conteo.fecha)}
            {conteo.contado_por ? ` por ${conteo.contado_por}` : ""} · cargado por{" "}
            {conteo.usuario_nombre} el {formatDateTime(conteo.cargado_en)}
          </p>
          {conteo.nota && <p className="text-sm">{conteo.nota}</p>}
        </div>
        <a
          href={`/stock/conteos/${conteo.id}/excel`}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-cream"
        >
          <Download className="h-4 w-4 stroke-[1.5]" />
          Excel
        </a>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Resumen label="Productos contados" value={String(filas.length)} />
        <Resumen label="Faltante" value={formatARS(faltante)} tone="danger" />
        <Resumen label="Sobrante" value={`+${formatARS(sobrante)}`} />
      </div>

      <ConteoDetalleTabla filas={filas} />
    </div>
  );
}

function Resumen({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div
      className={`rounded-[1.4rem] border p-5 ${
        tone === "danger" ? "border-destructive/30 bg-destructive/10" : "border-border bg-card"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">{value}</p>
    </div>
  );
}
