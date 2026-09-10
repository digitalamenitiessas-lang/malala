import Link from "next/link";
import { TableActionLink } from "@/components/table-action-link";
import { Plus } from "lucide-react";
import { listClientes } from "@/lib/data/clientes";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { formatARS } from "@/lib/utils";
import { ClientesSearch } from "./clientes-search";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const sucursal = await getActiveSucursal();
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const clientes = await listClientes({
    incluirInactivos: true,
    sucursalId: sucursal?.id,
    q,
  });

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            {q
              ? `${clientes.length} ${clientes.length === 1 ? "resultado" : "resultados"} para “${q}”`
              : `${clientes.length} clientes`}
          </p>
        </div>
        <Link
          href="/catalogos/clientes/nuevo"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4 stroke-[1.5]" />
          Nuevo
        </Link>
      </header>

      <ClientesSearch />

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-3">Nombre</th>
              <th className="text-left font-medium px-4 py-3">Teléfono</th>
              <th className="text-left font-medium px-4 py-3">Observación</th>
              <th className="text-right font-medium px-4 py-3">Saldo CC</th>
              <th className="text-center font-medium px-4 py-3">Estado</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clientes.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {q
                    ? `Sin resultados para “${q}”.`
                    : "No hay clientes cargados."}
                </td>
              </tr>
            ) : null}
            {clientes.map((c) => (
              <tr key={c.id} className="hover:bg-cream/30">
                <td className="px-4 py-3 font-medium">{c.nombre}</td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  {c.telefono ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.observacion ?? "—"}
                </td>
                {/* saldo_cc negativo es plata a favor del cliente, no una
                    deuda negativa: se muestra en positivo y etiquetado. */}
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.saldo_cc < -0.01 ? (
                    <span className="text-sage-700">
                      {formatARS(-c.saldo_cc)}
                      <span className="ml-1 text-xs uppercase tracking-wider">
                        a favor
                      </span>
                    </span>
                  ) : (
                    formatARS(c.saldo_cc)
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {c.activo ? (
                    <span className="bg-sage-100 text-sage-900 px-2 py-0.5 rounded text-xs">
                      Activo
                    </span>
                  ) : (
                    <span className="bg-stone-100 text-stone-500 px-2 py-0.5 rounded text-xs">
                      Inactivo
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <TableActionLink
                    href={`/catalogos/clientes/${c.id}`}
                    variant="edit"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
