import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { listIngresos } from "@/lib/data/ingresos";
import { listEgresos } from "@/lib/data/egresos";
import { listSucursales } from "@/lib/data/sucursales";
import { formatARS } from "@/lib/utils";
import { GRUPO_NOMBRE } from "@/lib/grupos-gasto";
import { parseReporteFiltros, type ReporteFiltrosInput } from "../_filters";
import { ReporteFiltroForm } from "../_filter-form";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<ReporteFiltrosInput>;
}

/**
 * Estado de resultados del período.
 *
 * Lo que resuelve: "Flujo de caja" suma todos los egresos y muestra un número
 * que incluye el retiro de socios. Eso no es un costo de operar el salón, es
 * reparto de ganancia — en septiembre eran $350.000 sobre $1.528.165, un 23%
 * que hacía ver al salón más caro de lo que es. Acá lo no operativo va aparte,
 * debajo de la línea, y no toca el resultado del salón.
 *
 * Dos criterios que conviene tener presentes al leerlo:
 *
 * - Va por DEVENGADO, no por caja: el gasto cuenta en el mes en que se hizo,
 *   esté pagado o no. Si sólo contáramos lo pagado, un mes en el que se le
 *   compró mucho al proveedor y todavía no se le pagó saldría espectacular y el
 *   golpe aparecería el mes siguiente, que es justo lo que un estado de
 *   resultados tiene que evitar.
 * - Las comisiones NO se cargan como egreso: se calculan en cada venta. Se
 *   toman de ahí, y por eso no hay riesgo de contarlas dos veces.
 */
export default async function ReportesResultadosPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerReportes) redirect("/dashboard");

  const sp = await searchParams;
  const filtros = parseReporteFiltros(sp, scope);

  const [sucursalesAll, ingresos, egresos] = await Promise.all([
    listSucursales({ soloActivas: true }),
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

  const sucursales = sucursalesAll.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );

  const facturacion = ingresos.reduce((a, r) => a + r.breakdown.total, 0);
  const comisiones = ingresos.reduce((a, r) => a + r.breakdown.comisiones, 0);

  // Los egresos se agrupan por grupo y, dentro, por rubro.
  interface Renglon {
    nombre: string;
    monto: number;
    pendiente: number;
  }
  const porGrupo = new Map<number | null, Map<string, Renglon>>();
  for (const row of egresos) {
    const grupo = row.rubro?.grupo ?? null;
    const nombre = row.rubro
      ? row.rubro.subrubro
        ? `${row.rubro.rubro} / ${row.rubro.subrubro}`
        : row.rubro.rubro
      : "Sin rubro";
    const dentro = porGrupo.get(grupo) ?? new Map<string, Renglon>();
    const cur = dentro.get(nombre) ?? { nombre, monto: 0, pendiente: 0 };
    cur.monto += row.egreso.valor;
    if (!row.egreso.pagado) cur.pendiente += row.egreso.valor;
    dentro.set(nombre, cur);
    porGrupo.set(grupo, dentro);
  }

  const totalDeGrupo = (g: number | null) =>
    [...(porGrupo.get(g)?.values() ?? [])].reduce((a, r) => a + r.monto, 0);

  const gruposOperativos = [1, 2, 3, 4, 5].filter((g) => porGrupo.has(g));
  const egresosOperativos = gruposOperativos.reduce(
    (a, g) => a + totalDeGrupo(g),
    0,
  );
  const noOperativo = totalDeGrupo(6);
  const sinClasificar = totalDeGrupo(null);

  const resultadoOperativo = facturacion - comisiones - egresosOperativos;
  const resultadoFinal = resultadoOperativo - noOperativo;

  const pct = (n: number) =>
    facturacion > 0 ? `${((n / facturacion) * 100).toFixed(1)}%` : "—";

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Estado de resultados
        </h1>
        <p className="text-sm text-muted-foreground">
          Lo que gana el salón operando. Los retiros, aportes, deuda e inversión
          van aparte: no son costo de operar.
        </p>
      </header>

      <ReporteFiltroForm
        action="/reportes/resultados"
        filtros={filtros}
        sucursales={sucursales}
        mostrarSucursal
      />

      {sinClasificar > 0 && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Hay {formatARS(sinClasificar)} en gastos cuyo rubro no tiene grupo
          asignado, así que no entran en ningún renglón de abajo. Asignales grupo
          en Catálogos → Rubros de gasto.
        </p>
      )}

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            <Fila
              concepto="Facturación"
              monto={facturacion}
              pct={facturacion > 0 ? "100%" : "—"}
              tono="titulo"
            />

            <Fila
              concepto="Comisiones del equipo"
              detalle="Calculadas sobre las ventas del período, no se cargan como gasto"
              monto={-comisiones}
              pct={pct(comisiones)}
            />

            {gruposOperativos.map((g) => (
              <GrupoFilas
                key={g}
                titulo={`${g} · ${GRUPO_NOMBRE[g]}`}
                renglones={[...(porGrupo.get(g)?.values() ?? [])].sort(
                  (a, b) => b.monto - a.monto,
                )}
                total={totalDeGrupo(g)}
                pct={pct}
              />
            ))}

            <Fila
              concepto="Resultado operativo"
              monto={resultadoOperativo}
              pct={pct(resultadoOperativo)}
              tono="resultado"
            />

            {noOperativo > 0 && (
              <>
                <GrupoFilas
                  titulo="6 · No operativo — bajo la línea"
                  detalle="Retiros, aportes, deuda e inversión. No son costo del salón."
                  renglones={[...(porGrupo.get(6)?.values() ?? [])].sort(
                    (a, b) => b.monto - a.monto,
                  )}
                  total={noOperativo}
                  pct={pct}
                />
                <Fila
                  concepto="Resultado final"
                  detalle="Después de retiros e inversión"
                  monto={resultadoFinal}
                  pct={pct(resultadoFinal)}
                  tono="resultado"
                />
              </>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Los gastos cuentan en el mes en que se hicieron, estén pagados o no. Si
        sólo contara lo pagado, un mes de compras grandes sin pagar saldría
        mejor de lo que fue y el golpe caería el mes siguiente. Para ver lo que
        efectivamente se movió de caja está el reporte de Flujo de caja.
      </p>
    </div>
  );
}

function GrupoFilas({
  titulo,
  detalle,
  renglones,
  total,
  pct,
}: {
  titulo: string;
  detalle?: string;
  renglones: { nombre: string; monto: number; pendiente: number }[];
  total: number;
  pct: (n: number) => string;
}) {
  return (
    <>
      <Fila concepto={titulo} detalle={detalle} monto={-total} pct={pct(total)} tono="grupo" />
      {renglones.map((r) => (
        <Fila
          key={r.nombre}
          concepto={r.nombre}
          detalle={
            r.pendiente > 0
              ? `${formatARS(r.pendiente)} todavía sin pagar`
              : undefined
          }
          monto={-r.monto}
          pct={pct(r.monto)}
          tono="detalle"
        />
      ))}
    </>
  );
}

function Fila({
  concepto,
  detalle,
  monto,
  pct,
  tono = "normal",
}: {
  concepto: string;
  detalle?: string;
  monto: number;
  pct: string;
  tono?: "titulo" | "grupo" | "detalle" | "resultado" | "normal";
}) {
  const fondo =
    tono === "resultado"
      ? "bg-cream/60"
      : tono === "grupo"
        ? "bg-cream/30"
        : tono === "detalle"
          ? "bg-card"
          : "";
  const textoConcepto =
    tono === "titulo" || tono === "resultado"
      ? "text-xs font-semibold uppercase tracking-wider"
      : tono === "grupo"
        ? "text-xs font-medium uppercase tracking-wider text-muted-foreground"
        : tono === "detalle"
          ? "text-sm text-muted-foreground pl-6"
          : "text-sm";
  const textoMonto =
    tono === "titulo" || tono === "resultado"
      ? "font-display text-xl"
      : tono === "detalle"
        ? "text-sm text-muted-foreground"
        : "text-sm";

  return (
    <tr className={fondo}>
      <td className="px-4 py-2.5">
        <p className={textoConcepto}>{concepto}</p>
        {detalle && (
          <p className="text-[11px] text-muted-foreground">{detalle}</p>
        )}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground w-20">
        {pct}
      </td>
      <td
        className={`px-4 py-2.5 text-right tabular-nums w-40 ${textoMonto}`}
        style={
          tono === "resultado"
            ? { color: monto >= 0 ? "var(--sage-700)" : "var(--danger)" }
            : undefined
        }
      >
        {formatARS(monto)}
      </td>
    </tr>
  );
}
