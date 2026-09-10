"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Globe, Store } from "lucide-react";
import type { TurnoAgenda } from "@/lib/types";
import { ESTADO_BADGE, ESTADO_LABEL, estadoEfectivo } from "@/lib/turno-estado";
import { formatARS } from "@/lib/utils";

/**
 * Resumen flotante de un turno al pasar el mouse por encima.
 *
 * Va por portal a <body> a propósito: las tres agendas viven dentro de
 * contenedores con overflow (la timeline scrollea horizontal, el mes y la
 * semana recortan las celdas), así que una tarjeta posicionada dentro del
 * árbol quedaría cortada por el borde de la celda.
 *
 * Sólo aparece donde hay mouse de verdad ((hover: hover)). En teléfonos el
 * toque ya abre el detalle completo del turno, y un tooltip táctil sólo
 * lograría comerse ese toque.
 */

const ANCHO = 264;
const MARGEN = 8;
const DEMORA_MS = 140;

interface Anclado {
  turno: TurnoAgenda;
  rect: DOMRect;
}

function hayMouse(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

/**
 * Devuelve los handlers para colgar de cada turno y el portal ya listo para
 * renderizar. Una sola tarjeta por vista, no una por turno.
 */
export function useTurnoHover() {
  const [activo, setActivo] = useState<Anclado | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelar = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const cerrar = useCallback(() => {
    cancelar();
    setActivo(null);
  }, [cancelar]);

  useEffect(() => cancelar, [cancelar]);

  // Si la página se mueve, la posición guardada ya no sirve: se cierra.
  useEffect(() => {
    if (!activo) return;
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [activo, cerrar]);

  const hoverProps = useCallback(
    (turno: TurnoAgenda) => ({
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
        if (!hayMouse()) return;
        const rect = e.currentTarget.getBoundingClientRect();
        cancelar();
        timer.current = setTimeout(() => setActivo({ turno, rect }), DEMORA_MS);
      },
      onMouseLeave: cerrar,
      // El foco de teclado muestra lo mismo: quien tabula por la agenda ve el
      // resumen sin tener que entrar al turno. :focus-visible deja afuera el
      // foco que da un toque en el celular, que si no haría parpadear la
      // tarjeta justo antes de navegar.
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        const el = e.currentTarget;
        if (!el.matches(":focus-visible")) return;
        setActivo({ turno, rect: el.getBoundingClientRect() });
      },
      onBlur: cerrar,
    }),
    [cancelar, cerrar],
  );

  const resumen = activo ? (
    <ResumenTurnoFlotante turno={activo.turno} rect={activo.rect} />
  ) : null;

  return { hoverProps, resumen };
}

function ResumenTurnoFlotante({ turno, rect }: Anclado) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // No hace falta esperar a montar para tocar document.body: esta tarjeta sólo
  // se renderiza a partir de un mouseenter o un focus, o sea que en el servidor
  // nunca existe.
  //
  // Se mide primero y se ubica después: la altura depende de si el turno tiene
  // observación, así que no se puede calcular de antemano.
  useLayoutEffect(() => {
    const alto = ref.current?.offsetHeight ?? 160;
    const derecha = rect.right + MARGEN;
    const izquierda = rect.left - ANCHO - MARGEN;

    let left = derecha;
    if (derecha + ANCHO > window.innerWidth - MARGEN) {
      left = izquierda >= MARGEN ? izquierda : window.innerWidth - ANCHO - MARGEN;
    }

    const top = Math.min(
      Math.max(rect.top, MARGEN),
      Math.max(MARGEN, window.innerHeight - alto - MARGEN),
    );

    setPos({ left: Math.max(MARGEN, left), top });
  }, [rect]);

  const estado = estadoEfectivo(turno);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-[70] rounded-xl border border-border bg-card p-3 shadow-lg"
      style={{
        width: ANCHO,
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-ink">
          {turno.hora}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {turno.duracion_min} min
          </span>
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${ESTADO_BADGE[estado]}`}
        >
          {ESTADO_LABEL[estado]}
        </span>
      </div>

      <p className="mt-1.5 truncate text-sm font-medium text-ink">
        {turno.cliente_nombre}
      </p>

      {turno.servicio_nombre && (
        <p className="mt-0.5 text-xs text-stone-600">
          {turno.servicio_nombre}
          {typeof turno.servicio_precio === "number" && (
            <span className="ml-1.5 tabular-nums text-muted-foreground">
              {formatARS(turno.servicio_precio)}
            </span>
          )}
        </p>
      )}

      {turno.profesional_nombre && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-600">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: turno.profesional_color ?? "#78766f" }}
          />
          <span className="truncate">Con {turno.profesional_nombre}</span>
        </p>
      )}

      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {turno.canal === "web" ? (
          <Globe className="h-3 w-3 stroke-[1.5]" />
        ) : (
          <Store className="h-3 w-3 stroke-[1.5]" />
        )}
        {turno.canal === "web" ? "Reservó online" : "Cargado en recepción"}
      </p>

      {turno.observacion && (
        <p className="mt-2 border-t border-border pt-2 text-xs text-stone-600">
          {turno.observacion}
        </p>
      )}
    </div>,
    document.body,
  );
}
