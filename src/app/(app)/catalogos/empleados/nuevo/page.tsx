import { redirect } from "next/navigation";
import { EmpleadoForm } from "@/components/forms/empleado-form";
import { createEmpleado } from "@/lib/data/empleados";
import { listSucursales } from "@/lib/data/sucursales";
import { requireUser } from "@/lib/auth/session";
import { buildAccessScope, esAdmin } from "@/lib/auth/access";

const ROL_LABEL: Record<string, string> = {
  empleado: "Empleado",
  encargada: "Encargada",
  admin: "Admin",
};

export default async function NuevoEmpleadoPage() {
  const user = await requireUser();
  if (!esAdmin(user.rol)) {
    redirect("/catalogos/empleados");
  }
  const scope = buildAccessScope(user);
  const todas = await listSucursales();
  // El admin solo ve su(s) sucursal(es); el superadmin, todas.
  const sucursales = todas.filter((s) => scope.sucursalIdsPermitidas.includes(s.id));

  const rolesPermitidos =
    user.rol === "superadmin"
      ? ["empleado", "encargada", "admin"]
      : ["empleado", "encargada"];
  const rolesDisponibles = rolesPermitidos.map((value) => ({
    value,
    label: ROL_LABEL[value] ?? value,
  }));

  async function action(_prev: unknown, formData: FormData) {
    "use server";
    return await createEmpleado(formData);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Nuevo empleado
        </h1>
      </header>
      <EmpleadoForm
        sucursales={sucursales}
        rolesDisponibles={rolesDisponibles}
        action={action}
        submitLabel="Crear"
      />
    </div>
  );
}
