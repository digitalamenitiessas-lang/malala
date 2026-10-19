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
  searchParams: Promise<{
    q?: string | string[];
    desde?: string | string[];
    hasta?: string | string[];
  }>;
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

  /**
   * Rango de emisión, para poder medir una campaña.
   *
   * "Quise filtrar las que vendí desde el 12/10 y no pude. Necesitamos poder
   * filtrar y tener reporte de eso para saber cuántas vendo en cierta fecha.
   * Por ej quise filtrar las que vendí por el día de la madre y medirlo."
   */
  const uno = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? "";
  const ES_YMD = /^\d{4}-\d{2}-\d{2}$/;
  const desdeRaw = uno(sp.desde);
  const hastaRaw = uno(sp.hasta);
  const desde = ES_YMD.test(desdeRaw) ? desdeRaw : "";
  const hasta = ES_YMD.test(hastaRaw) ? hastaRaw : "";
  const hayRango = Boolean(desde || hasta);

  const [giftCards, pasivo] = await Promise.all([
    listGiftCards({
      sucursalId: sucursal?.id,
      q,
      desde: desde || undefined,
      hasta: hasta || undefined,
    }),
    sucursal
      ? getPasivoGiftCards(sucursal.id)
      : Promise.resolve({ vigente: 0, vencido: 0, total: 0 }),
  ]);

  const hoy = hoyAr();

  /**
   * El reporte del período. Lo vendido no es la suma de los importes: una
   * tarjeta con descuento se cobró menos que su valor, y las de cortesía y las
   * de antes del sistema no entraron un peso hoy. Mezclarlas infla la campaña.
   */
  const delPeriodo = giftCards.filter((g) => g.estado !== "anulada");
  const vendidas = delPeriodo.filter((g) => g.origen === "venta");
  const totalCobrado = vendidas.reduce(
    (acc, g) => acc + (g.cobrado ?? g.importe),
    0,
  );
  const totalValor = vendidas.reduce((acc, g) => acc + g.importe, 0);
  const nCortesia = delPeriodo.filter((g) => g.origen === "cortesia").length;
  const nAnuladas = giftCards.length - delPeriodo.length;

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
              : hayRango
                ? `${giftCards.length} ${giftCards.length === 1 ? "gift card" : "gift cards"} en el período`
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

      {/* Filtro por fecha de venta. Form GET para que el período quede en la
          URL: el link de "las del día de la madre" se puede guardar y volver a
          abrir igual. Conserva el texto buscado si lo hay. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3"
      >
        {q && <input type="hidden" name="q" value={q} />}
        <div className="space-y-1">
          <label
            htmlFor="gc-desde"
            className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Vendidas desde
          </label>
          <input
            id="gc-desde"
            type="date"
            name="desde"
            defaultValue={desde}
            max={hoy}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor="gc-hasta"
            className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Hasta
          </label>
          <input
            id="gc-hasta"
            type="date"
            name="hasta"
            defaultValue={hasta}
            max={hoy}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-ink px-4 py-1.5 text-sm text-cream hover:opacity-90"
        >
          Filtrar
        </button>
        {hayRango && (
          <a
            href={`/catalogos/gift-cards${q ? `?q=${encodeURIComponent(q)}` : ""}`}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Quitar el filtro
          </a>
        )}
      </form>

      {/* El reporte del período: cuántas se vendieron y por cuánta plata. Es lo
          que se quería para medir una campaña. Sólo cuenta las VENDIDAS: las de
          cortesía y las de antes del sistema no entraron plata, y las anuladas
          no existieron. */}
      {hayRango && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Vendidas en el período
              </div>
              <div className="text-base font-semibold tabular-nums">
                {vendidas.length}
              </div>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Plata que entró
              </div>
              <div className="text-base font-semibold tabular-nums">
                {formatARS(totalCobrado)}
              </div>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Valor a canjear
              </div>
              <div className="text-base font-semibold tabular-nums">
                {formatARS(totalValor)}
              </div>
            </div>
          </div>
          {(totalValor !== totalCobrado || nCortesia > 0 || nAnuladas > 0) && (
            <p className="text-[11px] text-muted-foreground">
              {totalValor !== totalCobrado &&
                `Se vendieron ${formatARS(totalValor)} de valor por ${formatARS(totalCobrado)}: la diferencia son las que llevaron descuento. `}
              {nCortesia > 0 &&
                `${nCortesia} de cortesía, que no suman porque no entró plata. `}
              {nAnuladas > 0 && `${nAnuladas} anuladas, que no se cuentan.`}
            </p>
          )}
        </div>
      )}

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
