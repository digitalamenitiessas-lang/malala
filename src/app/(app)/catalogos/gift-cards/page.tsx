import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { TableActionLink } from "@/components/table-action-link";
import { getPasivoGiftCards, listGiftCards } from "@/lib/data/gift-cards";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import {
  ESTADO_BADGE,
  ESTADO_LABEL,
  estadoGiftCard,
  hoyAr,
} from "@/lib/gift-card-estado";
import { formatARS } from "@/lib/utils";
import { GiftCardsSearch } from "./gift-cards-search";

export default async function GiftCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCatalogos) redirect("/dashboard");
  const sucursal = await getActiveSucursal();
  const sp = await searchParams;
  // Next entrega un array si el parámetro viene repetido (?q=a&q=b): nos
  // quedamos con el primero para no llamar .trim() sobre un array.
  const qParam = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = qParam?.trim() || undefined;

  const [giftCards, pasivo] = await Promise.all([
    listGiftCards({ sucursalId: sucursal?.id, q }),
    sucursal
      ? getPasivoGiftCards(sucursal.id)
      : Promise.resolve({ vigente: 0, vencido: 0, total: 0 }),
  ]);

  const hoy = hoyAr();

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Gift cards
          </h1>
          <p className="text-sm text-muted-foreground">
            {q
              ? `${giftCards.length} ${giftCards.length === 1 ? "resultado" : "resultados"} para “${q}”`
              : `${giftCards.length} gift cards emitidas`}
          </p>
        </div>
        <Link
          href="/catalogos/gift-cards/nueva"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4 stroke-[1.5]" />
          Emitir
        </Link>
      </header>

      {/* Los dos números son de signo opuesto y eso tiene que verse.
          Lo vigente es deuda: plata cobrada por un servicio que todavía hay que
          prestar. Lo vencido es lo contrario — se cobró y ya no hay nada que
          prestar, así que es ganancia del salón. Llamar "saldo sin canjear" a
          las dos cosas hacía leer la pantalla como si debieran la suma. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Lo que el salón debe
          </p>
          <p className="mt-2 font-display text-2xl tabular-nums">
            {formatARS(pasivo.vigente)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Plata ya cobrada por servicios que todavía no se prestaron. Estas
            tarjetas se pueden usar hoy, así que es deuda de verdad.
          </p>
        </div>
        <div className="rounded-md border border-sage-700/30 bg-sage-100/40 p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Vencidas · ya es del salón
          </p>
          <p
            className="mt-2 font-display text-2xl tabular-nums"
            style={{ color: "var(--sage-700)" }}
          >
            {formatARS(pasivo.vencido)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Se cobraron y el servicio nunca se prestó: el salón se quedó con esa
            plata. Si deciden tomar alguna igual como excepción, ahí vuelve a
            costarles y queda registrada como fuera de término.
          </p>
        </div>
      </div>

      <GiftCardsSearch />

      <div className="bg-card border border-border rounded-md overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-3">Código</th>
              <th className="text-left font-medium px-4 py-3">Para</th>
              <th className="text-right font-medium px-4 py-3">Importe</th>
              <th className="text-right font-medium px-4 py-3">Saldo</th>
              <th className="text-center font-medium px-4 py-3">Vence</th>
              <th className="text-center font-medium px-4 py-3">Estado</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {giftCards.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {q
                    ? `Sin resultados para “${q}”.`
                    : "No hay gift cards emitidas."}
                </td>
              </tr>
            ) : null}
            {giftCards.map((g) => {
              const estado = estadoGiftCard(g, hoy);
              return (
                <tr key={g.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 font-medium tabular-nums">
                    {g.codigo}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {g.beneficiaria ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatARS(g.importe)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatARS(g.saldo)}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">
                    {g.vence_el ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${ESTADO_BADGE[estado]}`}
                    >
                      {ESTADO_LABEL[estado]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <TableActionLink
                      href={`/catalogos/gift-cards/${g.id}`}
                      variant="edit"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
