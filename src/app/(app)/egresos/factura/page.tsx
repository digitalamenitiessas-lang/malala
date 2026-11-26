import { redirect } from "next/navigation";
import { FacturaProveedorForm } from "@/components/forms/factura-proveedor-form";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { esAdmin } from "@/lib/auth/access";
import { listProveedores } from "@/lib/data/proveedores";
import { listInsumos } from "@/lib/data/insumos";
import { registrarFacturaProveedor } from "@/lib/data/facturas-proveedor";
import { hoyAr } from "@/lib/fecha-ar";

export default async function CargarFacturaPage({
  searchParams,
}: {
  searchParams: Promise<{ proveedor?: string }>;
}) {
  const user = await requireUser();
  if (!esAdmin(user.rol) && user.rol !== "encargada") redirect("/egresos");

  const sucursal = await getActiveSucursal();
  if (!sucursal) redirect("/dev/login");

  const sp = await searchParams;
  const [proveedores, insumos] = await Promise.all([
    listProveedores({ sucursalId: sucursal.id }),
    listInsumos({ sucursalId: sucursal.id }),
  ]);

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">Cargar factura de proveedor</h1>
        <p className="text-sm text-muted-foreground">
          {sucursal.nombre} · La factura entera de una vez: los productos suman al stock y la deuda con el
          proveedor queda exactamente en el total de la factura, IVA incluido.
        </p>
      </header>

      <FacturaProveedorForm
        sucursalId={sucursal.id}
        proveedores={proveedores}
        insumos={insumos}
        defaultFecha={hoyAr()}
        defaultProveedorId={sp.proveedor}
        action={registrarFacturaProveedor}
      />
    </div>
  );
}
