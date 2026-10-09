import { sucursalEnPantalla } from "@/lib/auth/session";
import Link from "next/link";
import { Plus } from "lucide-react";
import { TableActionLink } from "@/components/table-action-link";
import { redirect } from "next/navigation";
import { buildAccessScope, clampSucursalId, esAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { listEmpleados } from "@/lib/data/empleados";
import { listSucursales } from "@/lib/data/sucursales";
import { formatARS } from "@/lib/utils";

const TIPO_LABEL: Record<string, string> = {
  porcentaje: "Porcentaje",
  mixto: "Mixto",
  sueldo_fijo: "Sueldo fijo",
};

interface SearchParams {
  sucursal?: string;
  bajas?: string;
}

export default async function EmpleadosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCatalogos) redirect("/dashboard");
  const sp = await searchParams;

  const sucursalesAll = await listSucursales();
  const sucursales = sucursalesAll.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );
  const sucursalId =
    sucursales.length > 1
      ? await sucursalEnPantalla(scope, sp.sucursal)
      : sucursales[0]?.id ?? null;
  // Las dadas de baja quedan fuera salvo que se pidan. El salón no quiere ver
  // en la pantalla de todos los días a gente que ya no trabaja ahí; pero
  // tampoco se pueden borrar, porque sus ventas y su comisión tienen que seguir
  // existiendo. Se ocultan, no se eliminan.
  const verBajas = sp.bajas === "1";
  const todos = await listEmpleados({
    incluirInactivos: true,
    sucursalId: sucursalId ?? undefined,
  });
  const empleados = verBajas ? todos : todos.filter((e) => e.activo);
  const bajas = todos.length - todos.filter((e) => e.activo).length;
  const sucMap = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const puedeGestionar = esAdmin(user.rol) || user.rol === "superadmin";

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Empleados
          </h1>
          <p className="text-sm text-muted-foreground">
            {empleados.length} empleados
            {sucursalId ? ` · ${sucMap.get(sucursalId) ?? "Sucursal"}` : ""}
          </p>
          {bajas > 0 && (
            <Link
              href={{
                pathname: "/catalogos/empleados",
                query: {
                  ...(sucursalId ? { sucursal: sucursalId } : {}),
                  ...(verBajas ? {} : { bajas: "1" }),
                },
              }}
              className="text-xs uppercase tracking-wider text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {verBajas
                ? "Ocultar las dadas de baja"
                : `Ver ${bajas} dada${bajas === 1 ? "" : "s"} de baja`}
            </Link>
          )}
        </div>
        {puedeGestionar && (
          <Link
            href="/catalogos/empleados/nuevo"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4 stroke-[1.5]" />
            Nuevo
          </Link>
        )}
      </header>

      {sucursales.length > 1 && (
        <form
          action="/catalogos/empleados"
          method="get"
          className="bg-card border border-border rounded-md p-4 flex flex-wrap items-end gap-3"
        >
          <label className="space-y-1.5 text-sm min-w-56">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Sucursal
            </span>
            <select
              name="sucursal"
              defaultValue={sucursalId ?? ""}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
            >
              {sucursales.map((sucursal) => (
                <option key={sucursal.id} value={sucursal.id}>
                  {sucursal.nombre}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors"
          >
            Aplicar
          </button>
        </form>
      )}

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-3">Nombre</th>
              <th className="text-left font-medium px-4 py-3">Sucursal</th>
              <th className="text-left font-medium px-4 py-3">Comisión</th>
              <th className="text-right font-medium px-4 py-3">% default</th>
              <th className="text-right font-medium px-4 py-3">Valor/hora</th>
              <th className="text-center font-medium px-4 py-3">Estado</th>
              {puedeGestionar && <th className="px-4 py-3 w-20"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {empleados.length === 0 ? (
              <tr>
                <td
                  colSpan={puedeGestionar ? 7 : 6}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No hay empleadas visibles para la sucursal seleccionada.
                </td>
              </tr>
            ) : (
              empleados.map((e) => (
                <tr key={e.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 font-medium">{e.nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {sucMap.get(e.sucursal_principal_id) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {TIPO_LABEL[e.tipo_comision]}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {e.porcentaje_default}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatARS(e.valor_hora)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {e.activo ? (
                      <span className="bg-sage-100 text-sage-900 px-2 py-0.5 rounded text-xs">
                        Activo
                      </span>
                    ) : (
                      <span className="bg-stone-100 text-stone-500 px-2 py-0.5 rounded text-xs">
                        Inactivo
                      </span>
                    )}
                  </td>
                  {puedeGestionar && (
                    <td className="px-4 py-3 text-right">
                      <TableActionLink
                        href={`/catalogos/empleados/${e.id}`}
                        variant="edit"
                      />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
