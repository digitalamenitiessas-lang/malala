"use client";

import { coincide } from "./buscador-servicio";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Cliente } from "@/lib/types";

interface Props {
  clientes: Cliente[];
  value: string; // clienteId; "" = Consumidor Final
  onChange: (id: string) => void;
}

const MAX_RESULTADOS = 50;

export function ClienteCombobox({ clientes, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = clientes.find((c) => c.id === value) ?? null;
  const displayValue = open ? query : selected ? selected.nombre : "";

  // Mismo criterio que el buscador de servicios: sin acentos y por palabras
  // sueltas. Antes era un includes pelado, así que "maria jose" no encontraba
  // a "María José" y había que escribir las tildes para dar con la clienta.
  const q = query.trim();
  const filtered = (
    q
      ? clientes.filter(
          (c) =>
            coincide(c.nombre, q) || coincide(c.telefono ?? "", q),
        )
      : clientes
  ).slice(0, MAX_RESULTADOS);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function select(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          placeholder="Buscar cliente o dejar en Consumidor Final"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          className="w-full px-3 py-2 pr-8 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>

      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-md border border-border bg-card shadow-lg">
          <button
            type="button"
            onClick={() => select("")}
            className={
              "block w-full px-3 py-2 text-left text-sm hover:bg-cream/60 " +
              (value === "" ? "bg-cream/40 font-medium" : "")
            }
          >
            — Consumidor Final —
          </button>
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => select(c.id)}
              className={
                "block w-full px-3 py-2 text-left text-sm hover:bg-cream/60 " +
                (value === c.id ? "bg-cream/40 font-medium" : "")
              }
            >
              {c.nombre}
              {c.telefono ? (
                <span className="text-muted-foreground"> · {c.telefono}</span>
              ) : null}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Sin resultados para “{query.trim()}”
            </p>
          )}
        </div>
      )}
    </div>
  );
}
