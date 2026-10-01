import { notFound, redirect } from "next/navigation";
import { InsumoForm } from "@/components/forms/insumo-form";
import { InsumoServiciosCard } from "@/components/forms/insumo-servicios-card";
import {
  getInsumo,
  toggleInsumoActivo,
  updateInsumo,
} from "@/lib/data/insumos";
import { listProveedores } from "@/lib/data/proveedores";
import { listServiciosByInsumo } from "@/lib/data/recetas";
import { listServicios } from "@/lib/data/servicios";
import { requireUser } from "@/lib/auth/session";
import { esAdmin } from "@/lib/auth/access";

export default async function EditarInsumoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!esAdmin(user.rol)) redirect("/catalogos/insumos");
  const { id } = await params;
  const [insumo, proveedores, serviciosUsando, todosServicios] =
    await Promise.all([
      getInsumo(id),
      listProveedores(),
      listServiciosByInsumo(id),
      listServicios(),
    ]);
  if (!insumo) notFound();

  const usadosIds = new Set(serviciosUsando.map((s) => s.servicio.id));
  const serviciosDisponibles = todosServicios.filter(
    (s) => !usadosIds.has(s.id),
  );

  async function update(_prev: unknown, formData: FormData) {
    "use server";
    return await updateInsumo(id, formData);
  }
  async function toggle() {
    "use server";
    await toggleInsumoActivo(id);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Editar insumo
        </h1>
        <p className="text-sm text-muted-foreground">{insumo.nombre}</p>
      </header>
      <InsumoForm
        insumo={insumo}
        proveedores={proveedores}
        action={update}
        submitLabel="Guardar"
      />
      <InsumoServiciosCard
        insumo={insumo}
        serviciosUsando={serviciosUsando}
        serviciosDisponibles={serviciosDisponibles}
      />
      <div className="border-t border-border pt-6">
        <form action={toggle}>
          <button
            type="submit"
            className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {insumo.activo ? "Marcar inactivo" : "Reactivar"}
          </button>
        </form>
      </div>
    </div>
  );
}
