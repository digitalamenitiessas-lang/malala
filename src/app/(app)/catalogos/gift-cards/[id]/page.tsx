import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  anularGiftCard,
  corregirCodigoGiftCard,
  getGiftCard,
  listMovimientosGiftCard,
} from "@/lib/data/gift-cards";
import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import {
  ESTADO_BADGE,
  ESTADO_LABEL,
  MOV_BADGE,
  MOV_LABEL,
  estadoGiftCard,
  hoyAr,
} from "@/lib/gift-card-estado";
import { formatARS, formatDateTime } from "@/lib/utils";
import { AnularGiftCard, CorregirCodigo } from "./gift-card-acciones";

function fmtFechaHora(iso: string): string {
  return formatDateTime(iso);
}

export default async function GiftCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCatalogos) redirect("/dashboard");
  const { id } = await params;

  const [giftCard, movimientos] = await Promise.all([
    getGiftCard(id),
    listMovimientosGiftCard(id),
  ]);
  if (!giftCard) notFound();

  const estado = estadoGiftCard(giftCard, hoyAr());
  const usado = giftCard.importe - giftCard.saldo;

  async function corregir(_prev: unknown, formData: FormData) {
    "use server";
    return await corregirCodigoGiftCard(formData);
  }

  async function anular(_prev: unknown, formData: FormData) {
    "use server";
    return await anularGiftCard(formData);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <Link
        href="/catalogos/gift-cards"
        className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 stroke-[1.5]" />
        Gift cards
      </Link>

      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase tabular-nums">
            {giftCard.codigo}
          </h1>
          <p className="text-sm text-muted-foreground">
            {giftCard.beneficiaria
              ? `Para ${giftCard.beneficiaria}`
              : "Sin beneficiaria"}
            {" · emitida el "}
            {fmtFechaHora(giftCard.fecha_emision)}
          </p>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-xs ${ESTADO_BADGE[estado]}`}
        >
          {ESTADO_LABEL[estado]}
        </span>
      </header>

      {giftCard.emitida_pre_sistema ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-brown-700">
          Esta tarjeta se vendió antes de que existiera esta pantalla, así que su
          venta ya se contó como facturación en su momento. Cuando se canjee, el
          servicio va a facturar de nuevo: ese monto figura aparte para poder
          descontarlo.
        </p>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Saldo disponible
          </p>
          <p className="mt-2 font-display text-3xl tabular-nums">
            {formatARS(giftCard.saldo)}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Importe original
          </p>
          <p className="mt-2 font-display text-2xl tabular-nums">
            {formatARS(giftCard.importe)}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Ya usado
          </p>
          <p className="mt-2 font-display text-2xl tabular-nums">
            {formatARS(usado)}
          </p>
          {giftCard.vence_el ? (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              Vence el {giftCard.vence_el}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Sin vencimiento</p>
          )}
        </div>
      </div>

      {estado === "vencida" ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-brown-700">
          Venció el {giftCard.vence_el}. Se puede canjear igual — el sistema
          avisa y deja registrado que fue fuera de término.
        </p>
      ) : null}

      {giftCard.compradora || giftCard.observacion ? (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Datos
          </h2>
          <dl className="rounded-md border border-border bg-card divide-y divide-border text-sm">
            {giftCard.compradora ? (
              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-muted-foreground">La compró</dt>
                <dd>{giftCard.compradora}</dd>
              </div>
            ) : null}
            {giftCard.observacion ? (
              <div className="flex justify-between gap-6 px-4 py-2.5">
                <dt className="text-muted-foreground">Observación</dt>
                <dd className="text-right">{giftCard.observacion}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="space-y-3 border-t border-border pt-6">
        <h2 className="font-display text-xl tracking-[0.15em] uppercase">
          Historial
        </h2>
        {movimientos.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Todavía no hay movimientos.
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
            {movimientos.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${MOV_BADGE[m.tipo]}`}
                    >
                      {MOV_LABEL[m.tipo]}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {fmtFechaHora(m.fecha)}
                    </span>
                  </div>
                  {m.descripcion ? (
                    <p className="mt-0.5 text-sm">{m.descripcion}</p>
                  ) : null}
                </div>
                {m.monto !== 0 ? (
                  <span
                    className="shrink-0 font-medium tabular-nums"
                    style={{
                      color:
                        m.monto < 0 ? "var(--danger)" : "var(--sage-700)",
                    }}
                  >
                    {m.monto < 0 ? "−" : "+"} {formatARS(Math.abs(m.monto))}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Correcciones
        </h2>
        <CorregirCodigo
          giftCardId={giftCard.id}
          codigo={giftCard.codigo}
          action={corregir}
        />
        {giftCard.estado === "activa" && scope.esAdmin ? (
          <AnularGiftCard giftCardId={giftCard.id} action={anular} />
        ) : null}
      </section>
    </div>
  );
}
