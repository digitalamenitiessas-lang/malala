import { TableActionLink } from "@/components/table-action-link";
import { listRecetasResumen } from "@/lib/data/recetas";
import { redirect } from "next/navigation";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { formatARS } from "@/lib/utils";
import { BadgeAConfirmar, BadgeSinPrecio } from "./receta-badges";

export default async function RecetasPage() {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCatalogos) redirect("/dashboard");
  const sucursal = await getActiveSucursal();
  const resumen = await listRecetasResumen({ sucursalId: sucursal?.id });

  // Agrupar por rubro
  const grupos = resumen.reduce<Record<string, typeof resumen>>((acc, r) => {
    (acc[r.servicio.rubro] ??= []).push(r);
    return acc;
  }, {});

  const sinReceta = resumen.filter((r) => r.cantidadInsumos === 0).length;

  // Pendientes de toda la sucursal: líneas propuestas por el sistema que nadie
  // confirmó, y líneas cuyo insumo no tiene precio (esas recetas muestran un
  // costo más bajo que el real).
  const lineasPropuestas = resumen.reduce((acc, r) => acc + r.propuestas, 0);
  const recetasConPropuestas = resumen.filter((r) => r.propuestas > 0).length;
  const lineasSinPrecio = resumen.reduce((acc, r) => acc + r.sinPrecio, 0);
  const recetasSinPrecio = resumen.filter((r) => r.sinPrecio > 0).length;

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Recetas
        </h1>
        <p className="text-sm text-muted-foreground">
          {resumen.length} servicios · {sinReceta} sin receta cargada
        </p>
      </header>

      {lineasPropuestas > 0 && (
        <div className="bg-warning/10 border border-warning/30 text-brown-900 rounded-md p-4 text-sm space-y-1">
          <p className="font-medium">
            {lineasPropuestas}{" "}
            {lineasPropuestas === 1 ? "línea propuesta" : "líneas propuestas"} sin
            confirmar en {recetasConPropuestas}{" "}
            {recetasConPropuestas === 1 ? "receta" : "recetas"}
          </p>
          <p className="text-xs">
            Las armó el sistema a partir de la planilla. Entrá a cada receta,
            revisá las cantidades y confirmalas.
          </p>
        </div>
      )}

      {lineasSinPrecio > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md p-4 text-sm space-y-1">
          <p className="font-medium">
            {recetasSinPrecio}{" "}
            {recetasSinPrecio === 1
              ? "receta usa un insumo sin precio"
              : "recetas usan insumos sin precio"}{" "}
            ({lineasSinPrecio}{" "}
            {lineasSinPrecio === 1 ? "línea" : "líneas"})
          </p>
          <p className="text-xs">
            Esos insumos no suman al costo: en esas recetas el costo real es
            mayor y el margen menor que el que muestra esta tabla. Cargá el
            precio en{" "}
            {/* <a> y no Link: Insumos se abre recargando (ver catalogos/page). */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/catalogos/insumos" className="underline">
              Catálogos → Insumos
            </a>
            .
          </p>
        </div>
      )}

      <div className="space-y-6">
        {resumen.length === 0 ? (
          <div className="bg-card border border-border rounded-md px-4 py-10 text-center text-sm text-muted-foreground">
            No hay servicios activos habilitados en esta sucursal.
          </div>
        ) : null}
        {Object.entries(grupos).map(([rubro, items]) => (
          <section key={rubro} className="space-y-3">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              {rubro}
            </h2>
            {/* Con el código y los badges la tabla queda justa: scrollea en
                pantallas chicas en vez de que se corte la acción. */}
            <div className="bg-card border border-border rounded-md overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3 w-24">
                      Código
                    </th>
                    <th className="text-left font-medium px-4 py-3">
                      Servicio
                    </th>
                    <th className="text-right font-medium px-4 py-3">
                      Insumos
                    </th>
                    <th className="text-right font-medium px-4 py-3">
                      Costo total
                    </th>
                    <th className="text-right font-medium px-4 py-3">
                      Precio efectivo
                    </th>
                    <th className="text-right font-medium px-4 py-3">
                      Margen real
                    </th>
                    <th className="px-4 py-3 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map(
                    ({
                      servicio,
                      cantidadInsumos,
                      costoTotal,
                      propuestas,
                      sinPrecio,
                    }) => {
                      // Margen real: precio − insumos − comisión de la empleada.
                      const comision =
                        servicio.precio_efectivo *
                        (servicio.comision_default_pct / 100);
                      const margen =
                        servicio.precio_efectivo - costoTotal - comision;
                      const margenPct =
                        servicio.precio_efectivo > 0
                          ? (margen / servicio.precio_efectivo) * 100
                          : 0;
                      return (
                        <tr key={servicio.id} className="hover:bg-cream/30">
                          <td className="px-4 py-3 font-medium tabular-nums">
                            {servicio.codigo ?? (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">
                                {servicio.nombre}
                              </span>
                              <BadgeAConfirmar cantidad={propuestas} />
                              <BadgeSinPrecio cantidad={sinPrecio} />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {cantidadInsumos === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            ) : (
                              cantidadInsumos
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {cantidadInsumos === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : sinPrecio > 0 ? (
                              // El "≥" avisa que el costo mostrado no es el
                              // real: faltan los insumos sin precio.
                              <span
                                className="text-destructive font-medium"
                                title={`Costo incompleto: ${sinPrecio} ${sinPrecio === 1 ? "insumo sin precio" : "insumos sin precio"}`}
                              >
                                ≥ {formatARS(costoTotal)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                {formatARS(costoTotal)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {formatARS(servicio.precio_efectivo)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {cantidadInsumos === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span
                                style={{
                                  color:
                                    margen >= 0
                                      ? "var(--sage-700)"
                                      : "var(--danger)",
                                }}
                                title={
                                  sinPrecio > 0
                                    ? "Margen optimista: falta el costo de los insumos sin precio"
                                    : undefined
                                }
                              >
                                {sinPrecio > 0 ? "≤ " : ""}
                                {formatARS(margen)} ({margenPct.toFixed(0)}%)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <TableActionLink
                              href={`/catalogos/recetas/${servicio.id}`}
                              variant="edit"
                              label={
                                cantidadInsumos === 0
                                  ? "Cargar"
                                  : propuestas > 0
                                    ? "Revisar"
                                    : "Editar"
                              }
                            />
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
