"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { TurnoAgenda } from "@/lib/types";
import { hoyAr } from "@/lib/fecha-ar";
import { useTurnoHover } from "@/components/turnos/turno-hover";

interface Props {
  fecha: string; // any date within the month (used to derive the month)
  turnosPorFecha: Record<string, TurnoAgenda[]>;
}

function getMonthGrid(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00`);
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Monday = 0 for our grid (ISO week)
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6; // Sunday wraps

  const cells: { iso: string; dayNum: number; isCurrentMonth: boolean }[] = [];

  // Previous month padding
  for (let i = startOffset - 1; i >= 0; i--) {
    const pd = new Date(year, month, -i);
    cells.push({
      iso: pd.toISOString().slice(0, 10),
      dayNum: pd.getDate(),
      isCurrentMonth: false,
    });
  }

  // Current month
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const cd = new Date(year, month, day);
    cells.push({
      iso: cd.toISOString().slice(0, 10),
      dayNum: day,
      isCurrentMonth: true,
    });
  }

  // Next month padding to fill 6 rows
  while (cells.length < 42) {
    const nd = new Date(year, month + 1, cells.length - startOffset - lastDay.getDate() + 1);
    cells.push({
      iso: nd.toISOString().slice(0, 10),
      dayNum: nd.getDate(),
      isCurrentMonth: false,
    });
  }

  return cells;
}

export function MonthlyView({ fecha, turnosPorFecha }: Props) {
  const searchParams = useSearchParams();
  const { hoverProps, resumen } = useTurnoHover();
  const today = hoyAr();
  const cells = getMonthGrid(fecha);
  const HEADERS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  function buildDayHref(dayIso: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("fecha", dayIso);
    params.delete("vista");
    return `/turnos?${params.toString()}`;
  }

  function buildTurnoHref(turnoId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("turno", turnoId);
    return `/turnos?${params.toString()}`;
  }

  return (
    <section className="rounded-[1.75rem] border border-border bg-card p-4">
      <div className="mb-3">
        <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
          Vista mensual
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Panorama del mes. Toca un día para ver el detalle.
        </p>
      </div>

      {/* Desktop grid */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-7 gap-px bg-stone-100 rounded-2xl overflow-hidden border border-stone-100">
          {HEADERS.map((h) => (
            <div
              key={h}
              className="bg-cream/70 px-2 py-2.5 text-center text-xs uppercase tracking-wider font-medium text-muted-foreground"
            >
              {h}
            </div>
          ))}
          {cells.map((cell) => {
            const dayTurnos = turnosPorFecha[cell.iso] ?? [];
            const isToday = cell.iso === today;
            const hasItems = dayTurnos.length > 0;
            const MAX_VISIBLE = 4;
            return (
              <div
                key={cell.iso}
                className={`bg-white min-h-[132px] p-2 transition ${
                  !cell.isCurrentMonth ? "opacity-50" : ""
                } ${isToday ? "bg-sage-50/40" : ""}`}
              >
                <Link
                  href={buildDayHref(cell.iso)}
                  className="flex items-center justify-between group"
                >
                  <span
                    className={`text-sm font-semibold ${
                      isToday
                        ? "bg-ink text-white rounded-full w-7 h-7 flex items-center justify-center"
                        : "text-ink group-hover:text-sage-700"
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {hasItems && (
                    <span className="rounded-full bg-sage-100 text-sage-900 px-1.5 py-0.5 text-[10px] font-semibold">
                      {dayTurnos.length}
                    </span>
                  )}
                </Link>
                {hasItems && (
                  <div className="mt-1.5 space-y-1">
                    {dayTurnos.slice(0, MAX_VISIBLE).map((t) => (
                      <Link
                        key={t.id}
                        href={buildTurnoHref(t.id)}
                        {...hoverProps(t)}
                        className="flex items-center gap-1.5 rounded-md bg-stone-50 px-1.5 py-1 transition hover:bg-sage-50"
                      >
                        <span
                          className="h-2 w-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: t.profesional_color ?? "#78766f" }}
                        />
                        <span className="text-xs font-medium text-ink tabular-nums">
                          {t.hora}
                        </span>
                        <span className="text-xs text-stone-600 truncate">
                          {t.cliente_nombre}
                        </span>
                      </Link>
                    ))}
                    {dayTurnos.length > MAX_VISIBLE && (
                      <Link
                        href={buildDayHref(cell.iso)}
                        className="block px-1.5 text-xs font-medium text-sage-700 hover:underline"
                      >
                        +{dayTurnos.length - MAX_VISIBLE} más
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile grid — compact */}
      <div className="sm:hidden">
        <div className="grid grid-cols-7 gap-px bg-stone-100 rounded-2xl overflow-hidden border border-stone-100">
          {HEADERS.map((h) => (
            <div
              key={h}
              className="bg-cream/70 px-1 py-1.5 text-center text-[9px] uppercase tracking-wider font-medium text-muted-foreground"
            >
              {h.slice(0, 2)}
            </div>
          ))}
          {cells.map((cell) => {
            const dayTurnos = turnosPorFecha[cell.iso] ?? [];
            const isToday = cell.iso === today;
            const hasItems = dayTurnos.length > 0;
            return (
              <Link
                key={cell.iso}
                href={buildDayHref(cell.iso)}
                className={`bg-white min-h-[44px] p-1 flex flex-col items-center justify-start gap-0.5 ${
                  !cell.isCurrentMonth ? "opacity-30" : ""
                }`}
              >
                <span
                  className={`text-[11px] font-medium ${
                    isToday
                      ? "bg-ink text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
                      : "text-ink"
                  }`}
                >
                  {cell.dayNum}
                </span>
                {hasItems && (
                  <span className="rounded-full bg-sage-100 text-sage-900 px-1 py-px text-[8px] font-semibold">
                    {dayTurnos.length}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
      {resumen}
    </section>
  );
}
