import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { listIngresos } from "@/lib/data/ingresos";
import { listPromociones } from "@/lib/data/promociones";
import { listSucursales } from "@/lib/data/sucursales";
import {
  buildFacturadoPorLineaMap,
  rendimientoPorEmpleado,
  totalesRendimientoPorEmpleado,
} from "@/lib/data/ingresos-helpers";
import {
  parseReporteFiltros,
  type ReporteFiltrosInput,
} from "../_filters";
import { ReporteFiltroForm } from "../_filter-form";
import {
  EmpleadasReportTable,
  type DetalleLinea,
} from "./empleadas-table";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<ReporteFiltrosInput>;
}

export default async function ReportesEmpleadasPage({
  searchParams,
}: PageProps) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerReportes) redirect("/dashboard");

  const sp = await searchParams;
  const filtros = parseReporteFiltros(sp, scope);

  const [sucursalesAll, ingresos, promociones] = await Promise.all([
    listSucursales({ soloActivas: true }),
    listIngresos({
      sucursalId: filtros.sucursalId,
      desde: filtros.desdeIso,
      hasta: filtros.hastaIso,
    }),
    listPromociones({ incluirInactivas: true }),
  ]);

  const sucursales = sucursalesAll.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );
  const promoPriceById = new Map(
    promociones.map((promo) => [promo.id, promo.precio_efectivo]),
  );
  // Cuántos servicios incluye cada combo: sirve para no repartir el precio
  // entero cuando el ticket trae sólo una parte del combo (se canjean en días
  // distintos). Ver buildFacturadoPorLineaMap.
  const promoComponentesById = new Map(
    promociones.map((promo) => [promo.id, promo.componentes.length]),
  );
  const promoListaById = new Map(
    promociones.map((promo) => [promo.id, promo.precio_lista]),
  );
  const filas = rendimientoPorEmpleado(ingresos, {
    promoPriceById,
    promoComponentesById,
    promoListaById,
  });
  const totales = totalesRendimientoPorEmpleado(filas);

  // Detalle de servicios por empleada (para desplegar al tocar cada fila).
  const detalle: Record<string, DetalleLinea[]> = {};
  for (const row of ingresos) {
    const facturadoPorLinea = buildFacturadoPorLineaMap(
      row,
      promoPriceById,
      promoComponentesById,
      promoListaById,
    );
    for (const linea of row.lineas) {
      if (!linea.empleado || !linea.servicio) continue;
      (detalle[linea.empleado.id] ??= []).push({
        fecha: row.ingreso.fecha,
        servicio: linea.servicio.nombre,
        cantidad: linea.cantidad,
        precio: facturadoPorLinea.get(linea.id) ?? linea.subtotal,
        comision: linea.comision_monto,
      });
    }
  }
  for (const id of Object.keys(detalle)) {
    detalle[id].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Rendimiento por empleada
        </h1>
        <p className="text-sm text-muted-foreground">
          {filtros.desde} → {filtros.hasta} · {filas.length} empleada
          {filas.length !== 1 ? "s" : ""} con servicios cargados
        </p>
      </header>

      <ReporteFiltroForm
        action="/reportes/empleadas"
        filtros={filtros}
        sucursales={sucursales}
      />

      <EmpleadasReportTable filas={filas} detalle={detalle} totales={totales} />

      <p className="text-xs text-muted-foreground italic">
        Tocá una empleada para ver el detalle de los servicios que hizo en el
        período. <strong>Neto negocio</strong> = facturado − comisión − costo
        insumos. El sueldo por horas y los anticipos se ven en cada liquidación.
      </p>
    </div>
  );
}
