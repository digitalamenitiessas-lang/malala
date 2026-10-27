"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Buscar recarga la página en vez de navegar con el router: la lista de
 * insumos no se terminaba de mostrar navegando sin recargar (pasaba al entrar
 * desde Catálogo, al volver de guardar un insumo y al limpiar la búsqueda).
 *
 * Para que recargar no corte la escritura, espera a que se deje de tipear
 * (Enter busca en el acto) y al volver deja el foco y el cursor en el campo.
 */
export function InsumosSearch() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = searchParams.get("q") ?? "";

  useEffect(() => {
    const input = inputRef.current;
    if (!input || !current) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [current]);

  function go(value: string) {
    if (timeout.current) clearTimeout(timeout.current);
    const params = new URLSearchParams(searchParams.toString());
    const q = value.trim();
    if (q === current) return;
    if (q) params.set("q", q);
    else params.delete("q");
    setPending(true);
    const qs = params.toString();
    window.location.replace(`/catalogos/insumos${qs ? `?${qs}` : ""}`);
  }

  function onChange(value: string) {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => go(value), 700);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    go("");
  }

  return (
    <div className="relative max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground stroke-[1.5]" />
      <input
        ref={inputRef}
        type="search"
        defaultValue={current}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") go(e.currentTarget.value);
        }}
        placeholder="Buscar por nombre o código…"
        className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-9 text-sm outline-none focus:border-sage-700 focus:ring-1 focus:ring-sage-700"
        aria-label="Buscar insumos"
      />
      {current ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Limpiar búsqueda"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-stone-100 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {pending ? (
        <span className="absolute -bottom-5 left-1 text-xs text-muted-foreground">
          Buscando…
        </span>
      ) : null}
    </div>
  );
}
