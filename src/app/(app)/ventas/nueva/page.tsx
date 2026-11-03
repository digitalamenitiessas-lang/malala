import { buildAccessScope } from "@/lib/auth/access";
import { redirect } from "next/navigation";
import { NuevaVentaForm } from "@/components/forms/nueva-venta-form";
import { listClientes } from "@/lib/data/clientes";
import { listEmpleados } from "@/lib/data/empleados";
import { listInsumosVendibles } from "@/lib/data/insumos";
import { listMediosPago } from "@/lib/data/medios-pago";
import { listServicios } from "@/lib/data/servicios";
import { listPromociones } from "@/lib/data/promociones";
import { listServiciosHorariosAll } from "@/lib/data/servicios-horarios";
import { listMotivosDescuento } from "@/lib/data/motivos-descuento";
import { listCuentas } from "@/lib/data/cuentas-bancarias";
import { listGiftCards } from "@/lib/data/gift-cards";
import { listTinturasElegibles } from "@/lib/data/recetas";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import type { ServicioHorario } from "@/lib/types";

export default async function NuevaVentaPage() {
  const user = await requireUser();
  // La ruta se abre tipeándola: esconder el botón no alcanza.
  if (!buildAccessScope(user).puedeCargarVentas) redirect("/ventas");
  const sucursal = await getActiveSucursal();
  if (!sucursal) redirect("/dev/login");

  const [
    clientes,
    servicios,
    empleados,
    mediosPago,
    productos,
    motivosDescuento,
    cuentas,
    promociones,
    horariosAll,
    giftCards,
    tinturasPorServicio,
  ] = await Promise.all([
    listClientes({ sucursalId: sucursal.id }),
    listServicios({ sucursalId: sucursal.id }),
    listEmpleados({ sucursalId: sucursal.id }),
    listMediosPago({
      sucursalId: sucursal.id,
      soloActivos: true,
      incluirCuentaCorriente: true,
    }),
    listInsumosVendibles(sucursal.id),
    listMotivosDescuento({ sucursalId: sucursal.id }),
    listCuentas({ sucursalId: sucursal.id, soloActivas: true }),
    listPromociones({ sucursalId: sucursal.id }),
    listServiciosHorariosAll(),
    // Todas, no sólo las canjeables: el selector muestra también las usadas y
    // las anuladas, deshabilitadas y con el motivo al lado. Una lista vacía y
    // una tarjeta falsa se ven igual desde el mostrador.
    listGiftCards({ sucursalId: sucursal.id }),
    listTinturasElegibles(sucursal.id),
  ]);

  const mediosActivos = mediosPago;
  const cuentasBanco = cuentas.filter((c) => c.tipo === "banco");

  // Franjas horarias por promo (para advertir si se vende fuera de vigencia).
  const promoIds = new Set(promociones.map((p) => p.id));
  const promoHorariosById = horariosAll.reduce<Record<string, ServicioHorario[]>>(
    (acc, h) => {
      if (promoIds.has(h.servicio_id)) {
        (acc[h.servicio_id] ??= []).push(h);
      }
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Nueva venta
        </h1>
        <p className="text-sm text-muted-foreground">
          {sucursal.nombre} · El stock se descuenta automáticamente al guardar
        </p>
      </header>

      <NuevaVentaForm
        sucursalId={sucursal.id}
        sucursalNombre={sucursal.nombre}
        clientes={clientes}
        servicios={servicios}
        empleados={empleados}
        mediosPago={mediosActivos}
        productos={productos}
        motivosDescuento={motivosDescuento.filter((m) => m.activo)}
        giftCards={giftCards}
        cuentasBanco={cuentasBanco}
        promociones={promociones}
        promoHorariosById={promoHorariosById}
        tinturasPorServicio={tinturasPorServicio}
      />
    </div>
  );
}
