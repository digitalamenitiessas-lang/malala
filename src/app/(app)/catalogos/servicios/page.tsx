import Link from "next/link";
import { TableActionLink } from "@/components/table-action-link";
import { Plus, TrendingUp } from "lucide-react";
import { listServicios } from "@/lib/data/servicios";
import { redirect } from "next/navigation";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { formatARS } from "@/lib/utils";
import { ServiciosSearch } from "./servicios-search";

export default async function ServiciosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCatalogos) redirect("/dashboard");
  const sucursal = await getActiveSucursal();
  const sp = await searchParams;
  // Next entrega un array si el parámetro viene repetido (?q=a&q=b): nos
  // quedamos con el primero para no llamar .trim() sobre un array.
  const qParam = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = qParam?.trim() || undefined;
  const servicios = await listServicios({
    incluirInactivos: true,
    sucursalId: sucursal?.id,
    q,
  });

  // Agrupar por rubro
  const grupos = servicios.reduce<Record<string, typeof servicios>>(
    (acc, s) => {
      (acc[s.rubro] ??= []).push(s);
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Servicios
          </h1>
          <p className="text-sm text-muted-foreground">
            {q
              ? `${servicios.length} ${servicios.length === 1 ? "resultado" : "resultados"} para “${q}”`
              : `Catálogo compartido entre sucursales · ${servicios.length} servicios`}
          </p>
        </div>

        {user.rol === "admin" && (
          <div className="flex items-center gap-2">
            <Link
              href="/catalogos/servicios/aumento"
              className="border border-border px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-cream transition-colors flex items-center gap-2"
            >
              <TrendingUp className="h-4 w-4 stroke-[1.5]" />
              Aumento masivo
            </Link>
            <Link
              href="/catalogos/servicios/nuevo"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors flex items-center gap-2"
            >
              <Plus className="h-4 w-4 stroke-[1.5]" />
              Nuevo
            </Link>
          </div>
        )}
      </header>

      <ServiciosSearch />

      <div className="space-y-8">
        {servicios.length === 0 ? (
          <div className="bg-card border border-border rounded-md px-4 py-10 text-center text-sm text-muted-foreground">
            {q ? `Sin resultados para “${q}”.` : "No hay servicios cargados."}
          </div>
        ) : null}
        {Object.entries(grupos).map(([rubro, items]) => (
          <section key={rubro} className="space-y-3">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              {rubro}
            </h2>
            {/* Con la columna de código la tabla queda justa: scrollea en
                pantallas chicas en vez de que se corten las acciones. */}
            <div className="bg-card border border-border rounded-md overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3 w-24">Código</th>
                    <th className="text-left font-medium px-4 py-3">Nombre</th>
                    <th className="text-right font-medium px-4 py-3">P. lista</th>
                    <th className="text-right font-medium px-4 py-3">P. efectivo</th>
                    <th className="text-center font-medium px-4 py-3">Estado</th>
                    {user.rol === "admin" && (
                      <th className="px-4 py-3 w-44"></th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((s) => (
                    <tr key={s.id} className="hover:bg-cream/30">
                      <td className="px-4 py-3 font-medium tabular-nums">
                        {s.codigo ?? (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      {/* El nombre abre la edición. Los botones de acción viven
                          en la última columna de una tabla de 52rem: desde el
                          celular hay que arrastrarla hasta el extremo derecho
                          para verlos, y en la práctica no se encuentran. Acá se
                          llega tocando lo primero que se busca, el servicio. */}
                      <td className="px-4 py-3">
                        {user.rol === "admin" ? (
                          <Link
                            href={`/catalogos/servicios/${s.id}`}
                            className="underline decoration-transparent underline-offset-2 transition-colors hover:decoration-inherit"
                          >
                            {s.nombre}
                          </Link>
                        ) : (
                          s.nombre
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatARS(s.precio_lista)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatARS(s.precio_efectivo)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {s.activo ? (
                            <span className="bg-sage-100 text-sage-900 px-2 py-0.5 rounded text-xs">
                              Activo
                            </span>
                          ) : (
                            <span className="bg-stone-100 text-stone-500 px-2 py-0.5 rounded text-xs">
                              Inactivo
                            </span>
                          )}
                          {s.visible_reserva === false && (
                            <span
                              className="bg-warning/15 text-brown-900 px-2 py-0.5 rounded text-xs"
                              title="Solo se cobra en caja: no aparece en la reserva online"
                            >
                              Solo caja
                            </span>
                          )}
                        </div>
                      </td>
                      {user.rol === "admin" && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <TableActionLink
                              href={`/catalogos/recetas/${s.id}`}
                              variant="view"
                              label="Receta"
                            />
                            <TableActionLink
                              href={`/catalogos/servicios/${s.id}`}
                              variant="edit"
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
