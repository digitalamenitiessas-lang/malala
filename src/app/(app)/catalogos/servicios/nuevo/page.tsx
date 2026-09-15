import { redirect } from "next/navigation";
import { ServicioForm } from "@/components/forms/servicio-form";
import {
  createServicio,
  getCodigosSugeridos,
  listRubrosServicios,
} from "@/lib/data/servicios";
import { requireUser } from "@/lib/auth/session";

export default async function NuevoServicioPage() {
  const user = await requireUser();
  if (user.rol !== "admin") redirect("/catalogos/servicios");

  const [rubros, codigos] = await Promise.all([
    listRubrosServicios(),
    getCodigosSugeridos(),
  ]);

  async function action(_prev: unknown, formData: FormData) {
    "use server";
    return await createServicio(formData);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Nuevo servicio
        </h1>
        <p className="text-sm text-muted-foreground">
          Catálogo compartido entre sucursales
        </p>
      </header>

      <ServicioForm
        action={action}
        rubros={rubros}
        codigos={codigos}
        submitLabel="Crear"
      />
    </div>
  );
}
