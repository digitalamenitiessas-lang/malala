import { redirect } from "next/navigation";
import { PromocionForm } from "@/components/forms/promocion-form";
import { createPromocion } from "@/lib/data/promociones";
import { listServicios } from "@/lib/data/servicios";
import { requireUser } from "@/lib/auth/session";
import { esAdmin } from "@/lib/auth/access";

export default async function NuevaPromocionPage() {
  const user = await requireUser();
  if (!esAdmin(user.rol)) redirect("/catalogos/promociones");

  const servicios = await listServicios();

  async function action(_prev: unknown, formData: FormData) {
    "use server";
    return await createPromocion(formData);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Nueva promoción
        </h1>
        <p className="text-sm text-muted-foreground">
          Combiná servicios existentes en un combo con su propio precio
        </p>
      </header>

      <PromocionForm action={action} servicios={servicios} submitLabel="Crear" />
    </div>
  );
}
