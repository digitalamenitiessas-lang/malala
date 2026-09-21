import { redirect } from "next/navigation";
import { InsumoForm } from "@/components/forms/insumo-form";
import { createInsumo, getBloquesCodigoInsumo } from "@/lib/data/insumos";
import { listMediosPago } from "@/lib/data/medios-pago";
import { listProveedores } from "@/lib/data/proveedores";
import { listSucursales } from "@/lib/data/sucursales";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";

export default async function NuevoInsumoPage() {
  const user = await requireUser();
  if (user.rol !== "admin") redirect("/catalogos/insumos");
  const [proveedores, sucursales, mediosPago, sucursalActiva, bloquesCodigo] =
    await Promise.all([
      listProveedores(),
      listSucursales({ soloActivas: true }),
      listMediosPago({ soloActivos: true, excluirGiftCard: true }),
      getActiveSucursal(),
      getBloquesCodigoInsumo(),
    ]);

  // La compra inicial debe ir a la MISMA sucursal donde se crea el insumo
  // (sucursales aisladas), así que el selector solo ofrece la sucursal activa.
  const sucursalesParaCompra = sucursalActiva
    ? sucursales.filter((s) => s.id === sucursalActiva.id)
    : sucursales;

  async function action(_prev: unknown, formData: FormData) {
    "use server";
    return await createInsumo(formData);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Nuevo insumo
        </h1>
      </header>
      <InsumoForm
        proveedores={proveedores}
        sucursales={sucursalesParaCompra}
        mediosPago={mediosPago}
        defaultSucursalId={sucursalActiva?.id}
        bloquesCodigo={bloquesCodigo}
        action={action}
        submitLabel="Crear"
      />
    </div>
  );
}
