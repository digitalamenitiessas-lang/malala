import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { BackButton } from "@/components/back-button";
import { ToastProvider } from "@/components/feedback/toast-provider";
import { SucursalSwitcher } from "@/components/sucursal-switcher";
import { AdminChat } from "@/components/admin-chat/admin-chat";
import { LogoutButton } from "@/components/logout-button";
import { PushClientBootstrap } from "@/components/pwa/push-client-bootstrap";
import { getActiveSucursalForUser, getCurrentUser } from "@/lib/auth/session";
import { logout } from "@/lib/auth/actions";
import { listSucursales } from "@/lib/data/sucursales";
import { buildAccessScope } from "@/lib/auth/access";
import type { AccessScope } from "@/lib/types";

const ROL_LABEL: Record<string, string> = {
  admin: "Admin",
  encargada: "Encargada",
  empleado: "Empleado",
};

interface NavDef {
  href: string;
  label: string;
  iconKey: string;
  group?: string;
  visible: (scope: AccessScope) => boolean;
}

const NAV: NavDef[] = [
  { href: "/dashboard", label: "Dashboard", iconKey: "LayoutDashboard", group: "Operación", visible: () => true },
  { href: "/ventas", label: "Ventas", iconKey: "ShoppingBag", group: "Operación", visible: () => true },
  { href: "/turnos", label: "Turnos", iconKey: "CalendarDays", group: "Operación", visible: () => true },
  { href: "/catalogos/clientes", label: "Clientes", iconKey: "Users", group: "Operación", visible: () => true },
  { href: "/caja", label: "Caja diaria", iconKey: "Wallet", group: "Finanzas", visible: (s) => s.puedeVerCaja },
  { href: "/bancos", label: "Cuentas y saldos", iconKey: "Landmark", group: "Finanzas", visible: (s) => s.puedeVerCaja },
  { href: "/liquidaciones", label: "Liquidaciones", iconKey: "HandCoins", group: "Finanzas", visible: (s) => s.puedeVerCaja },
  { href: "/stock", label: "Stock", iconKey: "Package", group: "Gestión", visible: (s) => s.puedeVerStock },
  { href: "/egresos", label: "Gastos", iconKey: "Receipt", group: "Gestión", visible: (s) => s.rol !== "empleado" },
  { href: "/catalogos", label: "Catalogos", iconKey: "BookOpen", group: "Gestión", visible: (s) => s.puedeVerCatalogos },
  { href: "/reportes", label: "Reportes", iconKey: "BarChart3", group: "Gestión", visible: (s) => s.puedeVerReportes },
  { href: "/conexiones-ia", label: "Conectar con IA", iconKey: "Sparkles", group: "Gestión", visible: (s) => s.puedeVerReportes },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/dev/login");
  const sucursal = await getActiveSucursalForUser(user);
  if (!sucursal) redirect("/dev/login");
  // El selector de sucursal solo aparece cuando el usuario tiene más de una
  // permitida (en la práctica, superadmin). Para el resto evitamos el query
  // en cada navegación y pasamos solo la sucursal activa.
  const puedeCambiarSucursal = (user.sucursal_ids_permitidas?.length ?? 0) > 1;
  const sucursales = puedeCambiarSucursal
    ? await listSucursales({ soloActivas: true })
    : [sucursal];

  const scope = buildAccessScope(user);
  const navItems = NAV
    .filter((n) => n.visible(scope))
    .map(({ href, label, iconKey, group }) => ({ href, label, iconKey, group }));

  return (
    <div className="flex flex-1 min-h-screen">
      <AppSidebar navItems={navItems} />
      <div className="flex-1 flex flex-col min-w-0">
        <header
          data-app-chrome
          className="h-14 border-b border-border bg-sand px-4 md:px-6 flex items-center justify-between gap-2"
        >
          {/* Spacer for hamburger button on mobile */}
          <div className="w-10 lg:w-0 shrink-0" />
          <BackButton />
          <div className="text-xs uppercase tracking-widest text-muted-foreground hidden sm:block">
            Sistema MALALA
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <SucursalSwitcher
              user={user}
              active={sucursal}
              sucursales={sucursales}
            />
            <div className="hidden sm:block h-6 w-px bg-border" />
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm font-medium truncate max-w-[12rem]">
                {user.nombre}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {ROL_LABEL[user.rol] ?? user.rol}
              </span>
            </div>
            <form action={logout}>
              <LogoutButton />
            </form>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <ToastProvider>
            <PushClientBootstrap />
            {children}
          </ToastProvider>
        </main>
      </div>
      <AdminChat rol={user.rol} sucursalNombre={sucursal.nombre} />
    </div>
  );
}
