import Link from "next/link";

import { redirect } from "next/navigation";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import {
  getCierreDeFecha,
  getResumenDelDia,
} from "@/lib/data/caja";
import {
  getAperturaDeFecha,
  getSugerenciasApertura,
} from "@/lib/data/apertura-caja";
import { formatARS } from "@/lib/utils";
import { CierreCajaSimpleForm } from "@/components/forms/cierre-caja-simple-form";
import { hoyAr } from "@/lib/fecha-ar";
import { esAdmin } from "@/lib/auth/access";

function todayYMD(): string {
  return hoyAr();
}

export default async function NuevoCierrePage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const user = await requireUser();
  if (!esAdmin(user.rol) && user.rol !== "encargada") redirect("/caja");

  const sucursal = await getActiveSucursal();
  if (!sucursal) redirect("/dev/login");

  const sp = await searchParams;
  const fecha = sp.fecha ?? todayYMD();

  const existente = await getCierreDeFecha(sucursal.id, fecha);
  if (existente) redirect(`/caja/${existente.id}`);

  // No se puede cerrar una caja que no fue abierta (apertura obligatoria).
  const apertura = await getAperturaDeFecha(sucursal.id, fecha);
  if (!apertura) redirect("/caja/apertura");

  const resumen = await getResumenDelDia(sucursal.id, fecha);
  const cuentas = await getSugerenciasApertura(sucursal.id);

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Cerrar caja
        </h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {sucursal.nombre} · {fecha}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Resumen esperado del día
        </h2>
        {/* Desglose por medio de pago real del día (mismo origen que la tabla de
            Caja diaria) para que se vea todo, incluidos medios fuera de
            EF/TR/TC/TD como Mercado Pago. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {resumen.porMp.map((row) => (
            <Kpi
              key={row.mp.id}
              label={row.mp.nombre}
              value={formatARS(row.neto)}
            />
          ))}
          <Kpi label="Total del día" value={formatARS(resumen.totalNeto)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Al cerrar se guarda esta foto del día. Las comisiones a pagar a empleados
          se gestionan desde{" "}
          <Link href="/liquidaciones" className="underline">
            Liquidaciones
          </Link>
          .
        </p>
      </section>

      <CierreCajaSimpleForm
        sucursalId={sucursal.id}
        fecha={fecha}
        cuentas={cuentas}
      />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-xl tabular-nums">{value}</p>
    </div>
  );
}
