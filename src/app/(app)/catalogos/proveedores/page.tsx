import Link from "next/link";
import { Plus } from "lucide-react";
import { listProveedoresConTotal } from "@/lib/data/proveedores";
import { redirect } from "next/navigation";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { formatARS } from "@/lib/utils";

export default async function ProveedoresPage() {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCatalogos) redirect("/dashboard");
  const sucursal = await getActiveSucursal();
  const proveedores = await listProveedoresConTotal({ sucursalId: sucursal?.id });

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Proveedores
          </h1>
          <p className="text-sm text-muted-foreground">
            {proveedores.length} proveedores
          </p>
        </div>
        <Link
          href="/catalogos/proveedores/nuevo"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4 stroke-[1.5]" />
          Nuevo
        </Link>
      </header>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-3">Proveedor</th>
              <th className="text-left font-medium px-4 py-3">Teléfono</th>
              {/* Lo que se le debe hoy, no lo comprado. Yerba Buena: "serviría
                  más que se vea lo que se debe actualmente y no el monto de la
                  compra inicial". Es la columna que miraban en el sistema
                  anterior; lo comprado sigue en la ficha de cada uno. */}
              <th className="text-right font-medium px-4 py-3">
                Se le debe
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {proveedores.map((p) => (
              <tr
                key={p.id}
                className="hover:bg-cream/30 cursor-pointer"
              >
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/catalogos/proveedores/${p.id}`}
                    className="block hover:text-sage-700"
                  >
                    {p.nombre}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  <Link
                    href={`/catalogos/proveedores/${p.id}`}
                    className="block"
                  >
                    {p.telefono ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <Link
                    href={`/catalogos/proveedores/${p.id}`}
                    className="block"
                  >
                    {p.deuda_pendiente > 0 ? (
                      <span
                        className="font-medium"
                        style={{ color: "var(--danger)" }}
                      >
                        {formatARS(p.deuda_pendiente)}
                      </span>
                    ) : p.deuda_pendiente < 0 ? (
                      <>
                        <span className="font-medium">
                          {formatARS(-p.deuda_pendiente)}
                        </span>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                          A favor del salón
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        {formatARS(0)}
                      </span>
                    )}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
