import Link from "next/link";
import { Plus } from "lucide-react";
import { TableActionLink } from "@/components/table-action-link";
import { listPromociones } from "@/lib/data/promociones";
import { redirect } from "next/navigation";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope, esAdmin } from "@/lib/auth/access";
import { formatARS } from "@/lib/utils";

export default async function PromocionesPage() {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCatalogos) redirect("/dashboard");
  const sucursal = await getActiveSucursal();
  const promociones = await listPromociones({
    incluirInactivas: true,
    sucursalId: sucursal?.id,
  });

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Promociones
          </h1>
          <p className="text-sm text-muted-foreground">
            Combinaciones de servicios · {promociones.length} promo
            {promociones.length !== 1 ? "s" : ""}
          </p>
        </div>

        {esAdmin(user.rol) && (
          <Link
            href="/catalogos/promociones/nuevo"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4 stroke-[1.5]" />
            Nueva
          </Link>
        )}
      </header>

      {promociones.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No hay promociones cargadas todavía.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Promo</th>
                <th className="text-left font-medium px-4 py-3">Servicios</th>
                <th className="text-right font-medium px-4 py-3">P. efectivo</th>
                <th className="text-center font-medium px-4 py-3">Vence</th>
                <th className="text-center font-medium px-4 py-3">Estado</th>
                {esAdmin(user.rol) && <th className="px-4 py-3 w-20"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {promociones.map((p) => (
                <tr key={p.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 font-medium">{p.nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.componentes.map((c) => c.nombre).join(" + ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatARS(p.precio_efectivo)}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">
                    {p.vence_el ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.activo ? (
                      <span className="bg-sage-100 text-sage-900 px-2 py-0.5 rounded text-xs">
                        Activa
                      </span>
                    ) : (
                      <span className="bg-stone-100 text-stone-500 px-2 py-0.5 rounded text-xs">
                        Inactiva
                      </span>
                    )}
                  </td>
                  {esAdmin(user.rol) && (
                    <td className="px-4 py-3 text-right">
                      <TableActionLink
                        href={`/catalogos/promociones/${p.id}`}
                        variant="edit"
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
