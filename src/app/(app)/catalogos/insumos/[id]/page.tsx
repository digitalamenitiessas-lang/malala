import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PackageMinus } from "lucide-react";
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
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { esAdmin } from "@/lib/auth/access";

export default async function EditarInsumoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!esAdmin(user.rol)) redirect("/catalogos/insumos");
  const { id } = await params;
  const [insumo, proveedores, serviciosUsando, todosServicios, sucursalActiva] =
    await Promise.all([
      getInsumo(id),
      listProveedores(),
      listServiciosByInsumo(id),
      listServicios(),
      getActiveSucursal(),
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
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Editar insumo
          </h1>
          <p className="text-sm text-muted-foreground">{insumo.nombre}</p>
        </div>
        {/* El retiro se hace sobre la sucursal activa, que es la del insumo. */}
        {insumo.tipo === "venta" &&
          insumo.activo &&
          sucursalActiva?.id === insumo.sucursal_id && (
            <Link
              href={`/stock/retiro?insumo=${insumo.id}`}
              className="border border-border px-3 py-2 rounded-md text-sm font-medium hover:bg-cream transition-colors flex items-center gap-2"
            >
              <PackageMinus className="h-4 w-4 stroke-[1.5]" />
              Retirar para uso interno
            </Link>
          )}
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
