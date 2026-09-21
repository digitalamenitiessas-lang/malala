import type { Metadata } from "next";
import {
  listIntegracionesManychat,
  listUltimosEnvios,
} from "@/lib/data/integraciones-manychat";
import { formatDateTime } from "@/lib/utils";
import { IntegracionManychatForm } from "./form";
import { ProbarEnvioForm } from "./probar-envio";
import { ConexionWhatsapp } from "./conexion-whatsapp";

export const metadata: Metadata = {
  title: "MALALA — Integraciones WhatsApp",
};

export const dynamic = "force-dynamic";

export default async function IntegracionesWhatsappPage() {
  const integraciones = await listIntegracionesManychat();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">
          Integraciones WhatsApp
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vinculá el WhatsApp de cada sucursal escaneando el QR. Las
          notificaciones salen directo desde ese número (vía Baileys), sin
          ManyChat ni WhatsApp Business.
        </p>
      </header>

      {integraciones.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No tenés sucursales asignadas.
        </div>
      )}

      <div className="space-y-6">
        {integraciones.map((integ) => (
          <SucursalCard key={integ.sucursal_id} integ={integ} />
        ))}
      </div>
    </div>
  );
}

async function SucursalCard({
  integ,
}: {
  integ: Awaited<ReturnType<typeof listIntegracionesManychat>>[number];
}) {
  const envios = await listUltimosEnvios(integ.sucursal_id, 5);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            {integ.sucursal_nombre}
          </h2>
          <p className="text-xs text-muted-foreground">
            {integ.numero_whatsapp_e164 ? (
              <span className="text-sage-700">
                Número {integ.numero_whatsapp_e164}
              </span>
            ) : (
              <span className="text-warning">Sin número — pendiente</span>
            )}
            {integ.actualizado_en && (
              <>
                {" · Última edición: "}
                {formatDateTime(integ.actualizado_en)}
              </>
            )}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            integ.activo
              ? "bg-sage-100 text-sage-900"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {integ.activo ? "Activa" : "Inactiva"}
        </span>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <IntegracionManychatForm integ={integ} />
          <ConexionWhatsapp sucursalId={integ.sucursal_id} />
        </div>
        <div className="space-y-4">
          <ProbarEnvioForm sucursalId={integ.sucursal_id} />
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <h3 className="text-sm font-medium text-ink">Últimos envíos</h3>
            {envios.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Aún no hay envíos para esta sucursal.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-xs">
                {envios.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-start justify-between gap-2"
                  >
                    <span className="text-muted-foreground">
                      {formatDateTime(e.enviado_en)}
                    </span>
                    <span className="flex-1 text-ink">
                      {e.tipo} → {e.telefono}
                    </span>
                    <span
                      className={
                        e.estado === "ok"
                          ? "font-medium text-sage-700"
                          : "font-medium text-destructive"
                      }
                      title={e.error}
                    >
                      {e.estado}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
