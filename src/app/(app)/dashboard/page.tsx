import Link from "next/link";
import {
  CalendarClock,
  Landmark,
  Plus,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { requireUser, getActiveSucursal } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { EmployeePushCard } from "@/components/pwa/employee-push-card";
import { listIngresos } from "@/lib/data/ingresos";
import { listSucursales } from "@/lib/data/sucursales";
import { listSaldos } from "@/lib/data/cuentas-bancarias";
import { listTurnos } from "@/lib/data/turnos";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/db/env";
import { aggregate, comisionesPorEmpleado } from "@/lib/data/ingresos-helpers";
import { ESTADO_BADGE, ESTADO_LABEL, estadoEfectivo } from "@/lib/turno-estado";
import { formatARS } from "@/lib/utils";

export const dynamic = "force-dynamic";

// El server corre en UTC; los turnos se guardan en hora de Argentina. Calcular
// fecha y hora "de hoy" en esa zona para no descartar próximos turnos por el
// desfasaje de 3 horas.
const TZ = "America/Argentina/Buenos_Aires";

function todayYMD(): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function fmtFechaLarga(d: Date): string {
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  });
}

function hhmmActual(): string {
  // en-GB 24h da "HH:MM".
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  });
}

export default async function DashboardPage() {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const activa = await getActiveSucursal();
  const isEmployee = scope.rol === "empleado";

  const hoy = todayYMD();
  const desdeIso = `${hoy}T00:00:00.000`;
  const hastaIso = `${hoy}T23:59:59.999`;
  const horaActual = hhmmActual();
  const pushConfigured = isWebPushConfigured();
  const vapidPublicKey = pushConfigured ? getVapidPublicKey() : undefined;

  // Los números del día son los de LA sucursal en la que estás parada.
  //
  // El dashboard calculaba la sucursal activa y no la usaba para pedir los
  // datos. Con una sola sucursal permitida no se notaba —el scope ya recorta—,
  // pero un superadmin veía las dos sumadas y los mismos totales en las dos:
  // 39 tickets y $2.396.375 tanto en Centro como en Yerba Buena, con Valentina
  // (Centro) entre las top de Yerba Buena. Lucía: "pruebo en dashboard y no veo
  // que cambien los números de las cards".
  //
  // Los saldos quedan afuera a propósito: esa tarjeta los agrupa por sucursal
  // y muestra las dos, que es lo que se quiere ver de un vistazo.
  const [ingresosHoy, saldos, turnosHoy, sucursalesAll] = await Promise.all([
    listIngresos({
      sucursalId: activa?.id,
      desde: desdeIso,
      hasta: hastaIso,
      empleadoId: isEmployee ? scope.empleadoId : undefined,
    }),
    scope.puedeVerCaja ? listSaldos() : Promise.resolve([]),
    listTurnos({ fecha: hoy, sucursalId: activa?.id }),
    listSucursales({ soloActivas: true }),
  ]);
  const sucursales = sucursalesAll.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );

  const totales = aggregate(ingresosHoy);
  const totalSaldos = saldos.reduce((acc, s) => acc + s.saldo, 0);
  const topEmpleadasHoy = comisionesPorEmpleado(ingresosHoy).slice(0, 3);

  // Próximos turnos: futuros (hora >= ahora) que siguen pendientes.
  const proximos = turnosHoy
    .filter((t) => t.hora >= horaActual && estadoEfectivo(t) === "pendiente")
    .slice(0, 10);

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
          Hoy
        </p>
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          {fmtFechaLarga(new Date())}
        </h1>
        <p className="text-sm text-muted-foreground">
          Hola {user.nombre}
          {activa ? ` · ${activa.nombre}` : ""}
        </p>
      </header>

      {/* Accesos rápidos */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {scope.puedeCargarVentas && (
          <QuickAction
            href="/ventas/nueva"
            label="Nueva venta"
            Icon={Plus}
            highlight
          />
        )}
        <QuickAction href="/turnos" label="Turnos" Icon={CalendarClock} />
        {scope.puedeVerCaja && (
          <QuickAction href="/caja" label="Caja" Icon={Wallet} />
        )}
        {scope.puedeVerReportes && (
          <QuickAction href="/reportes" label="Reportes" Icon={Receipt} />
        )}
      </section>

      {/* Lo ve cualquier usuario logueado. Antes estaba detrás de
          user.empleado_id, o sea que no lo veía nadie: los 7 perfiles tienen ese
          campo vacío, y el dueño y las encargadas —que son quienes más avisos
          van a querer— no tienen ni van a tener ficha de empleada. */}
      <EmployeePushCard
        configured={pushConfigured}
        vapidPublicKey={vapidPublicKey}
      />

      {/* Ventas de hoy */}
      <section className="rounded-[1.5rem] border border-border bg-card p-5 shadow-[0_14px_40px_rgba(44,53,37,0.04)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-sage-700" />
            <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
              Ventas de hoy
            </p>
          </div>
          {scope.puedeVerReportes && (
            <Link
              href={`/reportes/ventas?desde=${hoy}&hasta=${hoy}`}
              className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              Ver detalle →
            </Link>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Tickets" value={String(totales.cantidad)} />
          <Stat
            label={isEmployee ? "Mi facturado" : "Facturado"}
            value={formatARS(totales.total)}
            accent="sage"
          />
          <Stat
            label="Comisiones"
            value={formatARS(totales.comisiones)}
            hint="al equipo"
          />
          <Stat
            label="Neto"
            value={formatARS(totales.neto)}
            accent={totales.neto >= 0 ? "sage" : "danger"}
          />
        </div>
        {topEmpleadasHoy.length > 0 && !isEmployee && (
          <div className="mt-5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Top empleadas hoy
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {topEmpleadasHoy.map((emp) => (
                <div
                  key={emp.empleado.id}
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {emp.empleado.nombre}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {emp.lineas} servicio{emp.lineas !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums text-sage-700 font-medium">
                    {formatARS(emp.total)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Saldos en cuentas */}
      {scope.puedeVerCaja && saldos.length > 0 && (
        <SaldosCard
          saldos={saldos}
          sucursales={sucursales}
          total={totalSaldos}
        />
      )}

      {/* Próximos turnos */}
      <section className="rounded-[1.5rem] border border-border bg-card p-5 shadow-[0_14px_40px_rgba(44,53,37,0.04)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-sage-700" />
            <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
              Próximos turnos
            </p>
          </div>
          <Link
            href="/turnos"
            className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            Ver todos los turnos →
          </Link>
        </div>
        {proximos.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No hay más turnos pendientes para hoy.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-border">
            {proximos.map((t) => {
              const empleado = t as unknown as { profesional_nombre?: string };
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 py-2.5"
                >
                  <div className="w-14 font-display text-lg tabular-nums text-sage-700">
                    {t.hora}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {t.cliente_nombre}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {(t as unknown as { servicio_nombre?: string })
                        .servicio_nombre ?? "Servicio"}
                      {empleado.profesional_nombre
                        ? ` · ${empleado.profesional_nombre}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${
                      ESTADO_BADGE[estadoEfectivo(t)]
                    }`}
                  >
                    {ESTADO_LABEL[estadoEfectivo(t)]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "sage" | "danger";
}) {
  const color =
    accent === "sage"
      ? "text-sage-700"
      : accent === "danger"
        ? "text-destructive"
        : "";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`font-display text-xl mt-1 tabular-nums ${color}`}>{value}</p>
      {hint && (
        <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
      )}
    </div>
  );
}

function QuickAction({
  href,
  label,
  Icon,
  highlight,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  const base =
    "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors";
  const cls = highlight
    ? `${base} border-sage-700 bg-sage-50 text-sage-900 hover:bg-sage-100`
    : `${base} border-border bg-card hover:bg-cream/40`;
  return (
    <Link href={href} className={cls}>
      <Icon className="h-5 w-5 stroke-[1.5]" />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

function SaldosCard({
  saldos,
  sucursales,
  total,
}: {
  saldos: Array<{
    cuenta: {
      id: string;
      sucursal_id: string;
      nombre: string;
      tipo: string;
    };
    saldo: number;
  }>;
  sucursales: Array<{ id: string; nombre: string }>;
  total: number;
}) {
  const sucursalNombreById = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const grupos = new Map<string, { total: number; items: typeof saldos }>();
  for (const s of saldos) {
    const entry = grupos.get(s.cuenta.sucursal_id) ?? { total: 0, items: [] };
    entry.total += s.saldo;
    entry.items.push(s);
    grupos.set(s.cuenta.sucursal_id, entry);
  }
  const multipleSucursales = grupos.size > 1;
  return (
    <section className="rounded-[1.5rem] border border-border bg-card p-5 shadow-[0_14px_40px_rgba(44,53,37,0.04)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-sage-700" />
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Saldos en cuentas
          </p>
        </div>
        <Link
          href="/bancos"
          className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          Ver detalle →
        </Link>
      </div>
      <p className="mt-2 font-display text-3xl tabular-nums">
        {formatARS(total)}
      </p>
      <div className="mt-4 space-y-3">
        {Array.from(grupos.entries()).map(([sucId, entry]) => (
          <div key={sucId}>
            {multipleSucursales && (
              <div className="flex items-baseline justify-between mb-1.5">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {sucursalNombreById.get(sucId) ?? sucId}
                </p>
                <p className="text-xs tabular-nums font-medium">
                  {formatARS(entry.total)}
                </p>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {entry.items.map((s) => (
                <div
                  key={s.cuenta.id}
                  className="flex items-baseline justify-between rounded-xl border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{s.cuenta.nombre}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {s.cuenta.tipo}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums font-medium">
                    {formatARS(s.saldo)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
