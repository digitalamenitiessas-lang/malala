import { redirect } from "next/navigation";
import {
  createRubroGasto,
  listRubrosGasto,
  toggleRubroGastoActivo,
} from "@/lib/data/rubros-gasto";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { SubmitButton } from "@/components/forms/field";
import { GrupoSelector } from "./grupo-selector";

export default async function RubrosGastoPage() {
  const user = await requireUser();
  if (user.rol !== "admin") redirect("/catalogos");

  const sucursal = await getActiveSucursal();
  const rubros = await listRubrosGasto({ sucursalId: sucursal?.id });
  const sinClasificar = rubros.filter((r) => r.grupo == null).length;

  async function create(formData: FormData) {
    "use server";
    await createRubroGasto(formData);
  }
  async function toggle(formData: FormData) {
    "use server";
    const id = formData.get("id");
    if (typeof id === "string") await toggleRubroGastoActivo(id);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Rubros de gasto
        </h1>
        <p className="text-sm text-muted-foreground">
          {rubros.length} rubros · usados al cargar egresos
        </p>
        {/* El grupo decide si el gasto resta al resultado del salón, así que un
            rubro sin clasificar no es un detalle: queda afuera del estado de
            resultados y nadie se entera. */}
        {sinClasificar > 0 && (
          <p className="text-sm text-destructive">
            {sinClasificar} sin grupo asignado: sus gastos no entran en el estado
            de resultados.
          </p>
        )}
      </header>

      <section className="bg-card border border-border rounded-md p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
          Agregar rubro
        </h2>
        <form action={create} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Rubro
            </label>
            <input
              name="rubro"
              required
              placeholder="Ej: Servicios"
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Subrubro
            </label>
            <input
              name="subrubro"
              placeholder="Opcional"
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <SubmitButton
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors"
            pendingLabel="Agregando..."
          >
            Agregar
          </SubmitButton>
        </form>
      </section>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-3">Rubro</th>
              <th className="text-left font-medium px-4 py-3">Subrubro</th>
              <th className="text-center font-medium px-4 py-3 w-80">Grupo</th>
              <th className="text-center font-medium px-4 py-3 w-28">Estado</th>
              <th className="px-4 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rubros.map((r) => (
              <tr key={r.id} className="hover:bg-cream/30">
                <td className="px-4 py-3 font-medium">{r.rubro}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.subrubro ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <GrupoSelector rubroId={r.id} grupo={r.grupo} />
                </td>
                <td className="px-4 py-3 text-center">
                  {r.activo ? (
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
                  <form action={toggle}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
                      {r.activo ? "Desactivar" : "Reactivar"}
                    </SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
