import { redirect } from "next/navigation";
import { ReposicionForm } from "@/components/forms/reposicion-form";
import { listInsumos } from "@/lib/data/insumos";
import { createReposicion, listStockBySucursal } from "@/lib/data/stock";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";

interface SearchParams {
  insumo?: string;
}

export default async function ReponerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  if (!buildAccessScope(user).puedeGestionarStock) redirect("/stock");
  const sucursal = await getActiveSucursal();
  if (!sucursal) redirect("/stock");

  const sp = await searchParams;
  const [insumos, stockActual] = await Promise.all([
    listInsumos({ sucursalId: sucursal.id, tipo: "venta" }),
    listStockBySucursal(sucursal.id),
  ]);

  const stockMap = Object.fromEntries(
    stockActual.map((row) => [
      row.insumo.id,
      { cantidad: row.cantidad, deposito: row.cantidad_deposito },
    ]),
  );
  const defaultInsumoId = insumos.some((i) => i.id === sp.insumo)
    ? sp.insumo
    : undefined;

  async function action(_prev: unknown, formData: FormData) {
    "use server";
    return await createReposicion(formData);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Reponer exhibición
        </h1>
        <p className="text-sm text-muted-foreground">
          Pasar productos del depósito a la góndola. No cambia el stock total,
          sólo dónde está. Si una venta se lleva algo que no figuraba en
          exhibición, el sistema lo repone solo desde el depósito y lo deja
          anotado como reposición automática.
        </p>
      </header>
      {insumos.length === 0 ? (
        <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
          {sucursal.nombre} no tiene productos de venta activos.
        </div>
      ) : (
        <ReposicionForm
          insumos={insumos}
          sucursal={sucursal}
          stockMap={stockMap}
          defaultInsumoId={defaultInsumoId}
          action={action}
        />
      )}
    </div>
  );
}
