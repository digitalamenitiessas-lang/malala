import Link from "next/link";
import {
  BookOpen,
  Users,
  UserCog,
  Truck,
  FlaskConical,
  CreditCard,
  Receipt,
  NotebookText,
  Landmark,
  TicketPercent,
  Tags,
  Clock3,
  MessageCircle,
  Gift,
} from "lucide-react";
import { redirect } from "next/navigation";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { listSucursales } from "@/lib/data/sucursales";
import {
  contarClientes,
  listEmpleados,
  listInsumos,
  listMediosPago,
  listProveedores,
  listRubrosGasto,
  listMotivosDescuento,
  listServicios,
  listPromociones,
  listCuentas,
  listGiftCards,
} from "./_counts";
import { listRecetasResumen } from "@/lib/data/recetas";

const items = [
  {
    href: "/catalogos/servicios",
    label: "Servicios",
    Icon: BookOpen,
    desc: "Catálogo de servicios prestados",
  },
  {
    href: "/catalogos/promociones",
    label: "Promociones",
    Icon: Tags,
    desc: "Combos de servicios con franja y vencimiento",
  },
  {
    href: "/catalogos/gift-cards",
    label: "Gift cards",
    Icon: Gift,
    desc: "Emitir, buscar por código y ver saldos",
  },
  {
    href: "/catalogos/insumos",
    label: "Insumos",
    Icon: FlaskConical,
    desc: "Productos consumibles",
  },
  {
    href: "/catalogos/recetas",
    label: "Recetas",
    Icon: NotebookText,
    desc: "Insumos por servicio",
  },
  {
    href: "/catalogos/clientes",
    label: "Clientes",
    Icon: Users,
    desc: "Base de clientes",
  },
  {
    href: "/catalogos/empleados",
    label: "Empleados",
    Icon: UserCog,
    desc: "Equipo y reglas de comisión",
  },
  {
    href: "/catalogos/proveedores",
    label: "Proveedores",
    Icon: Truck,
    desc: "Proveedores de insumos",
  },
  {
    href: "/catalogos/medios-pago",
    label: "Medios de pago",
    Icon: CreditCard,
    desc: "EF, TR, TC, TD, MP",
  },
  {
    href: "/catalogos/cuentas-bancarias",
    label: "Cuentas bancarias",
    Icon: Landmark,
    desc: "Galicia, Macro, caja efectivo…",
  },
  {
    href: "/catalogos/rubros-gasto",
    label: "Rubros de gasto",
    Icon: Receipt,
    desc: "Categorías para egresos",
  },
  {
    href: "/catalogos/motivos-descuento",
    label: "Motivos de descuento",
    Icon: TicketPercent,
    desc: "Publicidad, autoconsumo socios…",
  },
  {
    href: "/catalogos/sucursales",
    label: "Horarios de sucursal",
    Icon: Clock3,
    desc: "Días y horarios de atención por sede",
  },
  {
    href: "/catalogos/whatsapp",
    label: "WhatsApp",
    Icon: MessageCircle,
    desc: "Vincular el número de cada sucursal para notificaciones",
  },
];

export default async function CatalogosPage() {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCatalogos) redirect("/dashboard");

  const sucursal = await getActiveSucursal();
  const sid = sucursal?.id;

  // Esta pantalla sólo muestra cuántos hay de cada cosa: los trece listados no
  // se necesitan entre sí. En fila eran trece idas y vueltas a la base, una
  // atrás de la otra, y por eso Catálogos tardaba tanto en abrir.
  const [
    servicios,
    promociones,
    insumos,
    recetas,
    cantClientes,
    empleados,
    proveedores,
    mediosPago,
    rubrosGasto,
    motivosDescuento,
    cuentas,
    giftCards,
    sucursales,
  ] = await Promise.all([
    listServicios({ sucursalId: sid }),
    listPromociones({ incluirInactivas: true, sucursalId: sid }),
    listInsumos({ sucursalId: sid }),
    listRecetasResumen({ sucursalId: sid }),
    contarClientes({ sucursalId: sid }),
    listEmpleados({ sucursalId: sid }),
    listProveedores({ sucursalId: sid }),
    listMediosPago({ sucursalId: sid }),
    listRubrosGasto({ sucursalId: sid }),
    listMotivosDescuento({ sucursalId: sid }),
    listCuentas({ sucursalId: sid }),
    listGiftCards({ sucursalId: sid }),
    listSucursales(),
  ]);

  const recetasCargadas = recetas.filter((r) => r.cantidadInsumos > 0).length;

  const counts: Record<string, number> = {
    "/catalogos/servicios": servicios.length,
    "/catalogos/promociones": promociones.length,
    "/catalogos/gift-cards": giftCards.length,
    "/catalogos/insumos": insumos.length,
    "/catalogos/recetas": recetasCargadas,
    "/catalogos/clientes": cantClientes,
    "/catalogos/empleados": empleados.length,
    "/catalogos/proveedores": proveedores.length,
    "/catalogos/medios-pago": mediosPago.length,
    "/catalogos/cuentas-bancarias": cuentas.length,
    "/catalogos/rubros-gasto": rubrosGasto.length,
    "/catalogos/motivos-descuento": motivosDescuento.length,
    "/catalogos/sucursales": sucursales.length,
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Catálogos
        </h1>
        <p className="text-sm text-muted-foreground">
          {scope.puedeVerGlobal
            ? "Datos compartidos entre sucursales"
            : "Datos de la sucursal activa"}
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(({ href, label, Icon, desc }) => (
          <Link
            key={href}
            href={href}
            className="bg-card border border-border rounded-md p-5 hover:bg-cream/40 transition-colors group"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-sage-50 p-2">
                <Icon className="h-5 w-5 stroke-[1.5] text-sage-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                {counts[href] !== undefined && (
                  <p className="text-xs text-muted-foreground mt-2 tabular-nums">
                    {counts[href]} registros
                  </p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
