import { redirect } from "next/navigation";
import { EgresoForm } from "@/components/forms/egreso-form";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { listRubrosGasto } from "@/lib/data/rubros-gasto";
import { listProveedores } from "@/lib/data/proveedores";
import { listMediosPago } from "@/lib/data/medios-pago";
import { listInsumos } from "@/lib/data/insumos";
import { listCuentas } from "@/lib/data/cuentas-bancarias";
import { createEgreso } from "@/lib/data/egresos";
import { registrarCompraInsumo } from "@/lib/data/insumos";
import { hoyAr } from "@/lib/fecha-ar";
import { esAdmin } from "@/lib/auth/access";

function todayYMD(): string {
  return hoyAr();
}

export default async function NuevoEgresoPage({
  searchParams,
}: {
  searchParams: Promise<{ proveedor?: string; compra?: string }>;
}) {
  const user = await requireUser();
  if (!esAdmin(user.rol) && user.rol !== "encargada") redirect("/egresos");

  const sucursal = await getActiveSucursal();
  if (!sucursal) redirect("/dev/login");

  const sp = await searchParams;
  const defaultProveedorId = sp.proveedor;
  const defaultEsCompra = sp.compra === "1";

  const [rubros, proveedores, mediosPago, insumos, cuentas] =
    await Promise.all([
      listRubrosGasto({ sucursalId: sucursal.id }),
      listProveedores({ sucursalId: sucursal.id }),
      listMediosPago({ sucursalId: sucursal.id, soloActivos: true, excluirGiftCard: true }),
      listInsumos({ sucursalId: sucursal.id }),
      listCuentas({ sucursalId: sucursal.id, soloActivas: true }),
    ]);
  const mediosActivos = mediosPago;
  const cuentasBanco = cuentas.filter((c) => c.tipo === "banco");

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Nuevo gasto
        </h1>
        <p className="text-sm text-muted-foreground">
          {sucursal.nombre} · Sueldos, alquiler, servicios y demás gastos. Si es
          una compra de insumos, tildá{" "}
          <strong>&ldquo;Es compra de insumo&rdquo;</strong> y se suma al stock
          automáticamente.
        </p>
      </header>

      <EgresoForm
        defaultSucursalId={sucursal.id}
        rubros={rubros}
        proveedores={proveedores}
        mediosPago={mediosActivos}
        cuentasBanco={cuentasBanco}
        insumos={insumos}
        defaultFecha={todayYMD()}
        defaultProveedorId={defaultProveedorId}
        defaultEsCompraInsumo={defaultEsCompra}
        action={createEgreso}
        compraAction={registrarCompraInsumo}
      />
    </div>
  );
}
