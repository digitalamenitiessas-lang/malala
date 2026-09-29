import { redirect } from "next/navigation";
import { buildAccessScope, clampSucursalId } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { listEmpleados } from "@/lib/data/empleados";
import { getEmpleadosInactivosConDeuda } from "@/lib/data/liquidaciones";
import { listSucursales } from "@/lib/data/sucursales";
import { NuevaLiquidacionForm } from "@/components/forms/nueva-liquidacion-form";

interface SearchParams {
  sucursal?: string;
}

export default async function NuevaLiquidacionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja) redirect("/dashboard");

  const sp = await searchParams;
  const sucursales = await listSucursales({ soloActivas: true });
  const sucursalesPermitidas = sucursales.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );
  const sucursalId = clampSucursalId(scope, sp.sucursal);
  const sucursal = sucursalesPermitidas.find((s) => s.id === sucursalId) ?? null;
  if (!sucursal) redirect("/dashboard");

  // Todas las activas: la comisión se calcula por la sucursal del servicio,
  // no por la sucursal principal del empleado, así que una empleada de otra
  // sucursal igual puede tener comisiones pendientes acá.
  //
  // De las dadas de baja se listan SOLO las que todavia tienen comision sin
  // liquidar. A alguien que se fue hay que pagarle lo ultimo que hizo, y ese es
  // justamente el momento en que se la da de baja: si desaparece de aca, esa
  // plata queda sin forma de pagarse. Pero una vez liquidada no tiene por que
  // seguir apareciendo, asi que se va sola.
  const [todos, conDeuda] = await Promise.all([
    listEmpleados({
      sucursalIds: scope.sucursalIdsPermitidas,
      incluirInactivos: true,
    }),
    getEmpleadosInactivosConDeuda(scope.sucursalIdsPermitidas),
  ]);
  const pendientes = new Set(conDeuda);
  const empleados = todos.filter((e) => e.activo || pendientes.has(e.id));

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Nueva liquidación
        </h1>
        <p className="text-sm text-muted-foreground">
          {sucursal.nombre} · Elegí el empleado y el período. El sistema calcula las
          comisiones pendientes.
        </p>
      </header>

      <NuevaLiquidacionForm
        sucursalId={sucursal.id}
        sucursales={sucursalesPermitidas}
        empleados={empleados}
        permiteCambiarSucursal={scope.puedeVerGlobal}
      />
    </div>
  );
}
