import { redirect } from "next/navigation";
import { AjusteForm } from "@/components/forms/ajuste-form";
import { listInsumos } from "@/lib/data/insumos";
import { createAjusteManual, listStockBySucursal } from "@/lib/data/stock";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { esAdmin } from "@/lib/auth/access";

export default async function AjustePage() {
  const user = await requireUser();
  if (!esAdmin(user.rol)) redirect("/stock");
  const sucursal = await getActiveSucursal();
  if (!sucursal) redirect("/stock");

  // El ajuste manual se limita a la sucursal activa de la sesión.
  const [insumos, stockActual] = await Promise.all([
    listInsumos(),
    listStockBySucursal(sucursal.id),
  ]);

  const stockMap: Record<string, Record<string, number>> = {
    [sucursal.id]: Object.fromEntries(
      stockActual.map((row) => [row.insumo.id, row.cantidad]),
    ),
  };

  async function action(_prev: unknown, formData: FormData) {
    "use server";
    return await createAjusteManual(formData);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Ajuste manual de stock
        </h1>
        <p className="text-sm text-muted-foreground">
          Suma o resta cantidad al stock y queda registrado en el log de
          movimientos.
        </p>
      </header>
      <AjusteForm
        insumos={insumos}
        sucursales={[sucursal]}
        stockMap={stockMap}
        defaultSucursalId={sucursal.id}
        action={action}
      />
    </div>
  );
}
