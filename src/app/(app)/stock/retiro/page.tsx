import { redirect } from "next/navigation";
import { RetiroForm } from "@/components/forms/retiro-form";
import { listInsumos } from "@/lib/data/insumos";
import { listEmpleados } from "@/lib/data/empleados";
import { createRetiroUsoInterno, listStockBySucursal } from "@/lib/data/stock";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";

interface SearchParams {
  insumo?: string;
}

export default async function RetiroPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  if (!buildAccessScope(user).puedeGestionarStock) redirect("/stock");
  const sucursal = await getActiveSucursal();
  if (!sucursal) redirect("/stock");

  const sp = await searchParams;
  // Sólo productos de venta: los de bacha ya se consumen por receta.
  const [insumos, empleados, stockActual] = await Promise.all([
    listInsumos({ sucursalId: sucursal.id, tipo: "venta" }),
    listEmpleados({ sucursalId: sucursal.id }),
    listStockBySucursal(sucursal.id),
  ]);

  const stockMap = Object.fromEntries(
    stockActual.map((row) => [row.insumo.id, row.cantidad]),
  );
  const defaultInsumoId = insumos.some((i) => i.id === sp.insumo)
    ? sp.insumo
    : undefined;

  async function action(_prev: unknown, formData: FormData) {
    "use server";
    return await createRetiroUsoInterno(formData);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Retiro para uso interno
        </h1>
        <p className="text-sm text-muted-foreground">
          Un producto de venta que se saca para usar en el salón. Baja el stock y
          queda asentado aparte de los ajustes, valuado a costo. No genera gasto:
          ya se pagó al comprarlo.
        </p>
      </header>
      {insumos.length === 0 ? (
        <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
          {sucursal.nombre} no tiene productos de venta activos.
        </div>
      ) : (
        <RetiroForm
          insumos={insumos}
          empleados={empleados}
          sucursal={sucursal}
          stockMap={stockMap}
          defaultInsumoId={defaultInsumoId}
          action={action}
        />
      )}
    </div>
  );
}
