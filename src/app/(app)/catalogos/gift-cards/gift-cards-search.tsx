"use client";

import { useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

export function GiftCardsSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = searchParams.get("q") ?? "";

  function push(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    const q = value.trim();
    if (q) params.set("q", q);
    else params.delete("q");
    startTransition(() => {
      router.replace(`/catalogos/gift-cards?${params.toString()}`);
    });
  }

  function onChange(value: string) {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => push(value), 300);
  }

  function clear() {
    if (timeout.current) clearTimeout(timeout.current);
    if (inputRef.current) inputRef.current.value = "";
    push("");
    inputRef.current?.focus();
  }

  return (
    <div className="relative max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground stroke-[1.5]" />
      <input
        ref={inputRef}
        type="search"
        defaultValue={current}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar por código, quién la compró o para quién es…"
        className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-9 text-sm outline-none focus:border-sage-700 focus:ring-1 focus:ring-sage-700"
        aria-label="Buscar gift cards"
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
