import { redirect } from "next/navigation";
import {
  createMotivoDescuento,
  listMotivosDescuento,
  toggleMotivoComisionIgnoraDescuento,
  toggleMotivoDescuentoActivo,
} from "@/lib/data/motivos-descuento";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { SubmitButton } from "@/components/forms/field";

export default async function MotivosDescuentoPage() {
  const user = await requireUser();
  if (user.rol !== "admin") redirect("/catalogos");

  const sucursal = await getActiveSucursal();
  const motivos = await listMotivosDescuento({ sucursalId: sucursal?.id });

  async function create(formData: FormData) {
    "use server";
    await createMotivoDescuento(formData);
  }
  async function toggle(formData: FormData) {
    "use server";
    const id = formData.get("id");
    if (typeof id === "string") await toggleMotivoDescuentoActivo(id);
  }
  async function toggleComision(formData: FormData) {
    "use server";
    const id = formData.get("id");
    if (typeof id === "string") await toggleMotivoComisionIgnoraDescuento(id);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Motivos de descuento
        </h1>
        <p className="text-sm text-muted-foreground">
          {motivos.length} motivos · clasifican los descuentos al cargar ventas
        </p>
      </header>

      <section className="bg-card border border-border rounded-md p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
          Agregar motivo
        </h2>
        <form action={create} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Nombre
              </label>
              <input
                name="nombre"
                required
                placeholder="Ej: Publicidad, Autoconsumo socios"
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <SubmitButton
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors"
              pendingLabel="Agregando..."
            >
              Agregar
            </SubmitButton>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="comision_ignora_descuento"
              className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--primary)]"
            />
            <span>
              El descuento lo pone el local
              <span className="block text-xs text-muted-foreground">
                La comisión de la empleada se calcula como si no hubiera habido
                descuento. Para los casos donde el servicio se regala por
                decisión del negocio —publicidad, canje— y la chica igual lo
                trabajó.
              </span>
            </span>
          </label>
        </form>
      </section>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-3">Motivo</th>
              <th className="text-center font-medium px-4 py-3 w-56">
                Comisión
              </th>
              <th className="text-center font-medium px-4 py-3 w-28">Estado</th>
              <th className="px-4 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {motivos.map((m) => (
              <tr key={m.id} className="hover:bg-cream/30">
                <td className="px-4 py-3 font-medium">{m.nombre}</td>
                {/* Se muestra el efecto, no el nombre del campo: quien mira esta
                    tabla quiere saber si la chica cobra o no cobra. */}
                <td className="px-4 py-3 text-center">
                  <form action={toggleComision}>
                    <input type="hidden" name="id" value={m.id} />
                    <SubmitButton className="text-xs">
                      {m.comision_ignora_descuento ? (
                        <span className="bg-sage-100 text-sage-900 px-2 py-0.5 rounded">
                          Lo pone el local
                        </span>
                      ) : (
                        <span className="text-muted-foreground hover:text-foreground">
                          Lo absorbe la empleada
                        </span>
                      )}
                    </SubmitButton>
                  </form>
                </td>
                <td className="px-4 py-3 text-center">
                  {m.activo ? (
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
                    <input type="hidden" name="id" value={m.id} />
                    <SubmitButton className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
                      {m.activo ? "Desactivar" : "Reactivar"}
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
