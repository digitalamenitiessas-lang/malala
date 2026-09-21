"use client";

import { useEffect, useState } from "react";
import { UserPen } from "lucide-react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "./field";
import { listClientes } from "@/lib/data/clientes";
import { reasignarClienteVenta } from "@/lib/data/ingresos-actions";
import type { Cliente } from "@/lib/types";

interface Props {
  ingresoId: string;
  sucursalId: string;
  clienteActualNombre: string | null;
  anulado: boolean;
}

const MAX_RESULTADOS = 8;

/**
 * Cambiar a quién está adjudicada una venta ya cargada, sin anularla.
 *
 * El buscador va contra el servidor y no trae la lista entera: son casi 2000
 * clientes y mandarlos todos a la pantalla de un ticket costaba más que el
 * ticket. Por eso pide dos letras antes de buscar y muestra de a pocos.
 */
export function CambiarClienteVenta({
  ingresoId,
  sucursalId,
  clienteActualNombre,
  anulado,
}: Props) {
  const { pending, run } = useTransitionFeedback();
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState("");
  // Se guarda junto con la búsqueda que lo produjo: así, mientras se tipea la
  // letra siguiente, no se muestra la lista de la búsqueda anterior como si
  // fuera la de lo que hay escrito.
  const [resultados, setResultados] = useState<{ q: string; rows: Cliente[] }>({
    q: "",
    rows: [],
  });
  const [error, setError] = useState<string | null>(null);

  const q = query.trim();
  const buscando = abierto && q.length >= 2 && resultados.q !== q;

  useEffect(() => {
    const termino = query.trim();
    if (!abierto || termino.length < 2) return;
    // Una búsqueda por pausa al tipear, y la respuesta vieja se descarta: si no,
    // una consulta lenta puede pisar a la de la última letra.
    let vigente = true;
    const t = setTimeout(async () => {
      const rows = await listClientes({
        sucursalId,
        q: termino,
        limit: MAX_RESULTADOS,
      });
      if (vigente) setResultados({ q: termino, rows });
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [query, abierto, sucursalId]);

  if (anulado) return null;

  function asignar(clienteId: string | null, nombre: string) {
    setError(null);
    run(
      async () => {
        const res = await reasignarClienteVenta(ingresoId, clienteId);
        if (!res.ok) {
          setError(Object.values(res.errors).flat().join(" "));
        } else {
          setAbierto(false);
          setQuery("");
        }
        return res;
      },
      { refreshOnSuccess: true, successMessage: `Venta asignada a ${nombre}` },
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <UserPen className="h-3.5 w-3.5 stroke-[1.5]" />
        Cambiar
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre o teléfono"
        className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {q.length >= 2 && (
        <ul className="space-y-0.5">
          {buscando && (
            <li className="px-1 py-1 text-xs text-muted-foreground">
              Buscando…
            </li>
          )}
          {!buscando && resultados.rows.length === 0 && (
            <li className="px-1 py-1 text-xs text-muted-foreground">
              Ninguno en esta sucursal.
            </li>
          )}
          {!buscando && resultados.rows.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => asignar(c.id, c.nombre)}
                className="w-full rounded px-1 py-1 text-left text-sm transition-colors hover:bg-cream disabled:opacity-50"
              >
                {c.nombre}
                {c.telefono && (
                  <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                    {c.telefono}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {clienteActualNombre && (
        <LoadingButton
          type="button"
          onClick={() => asignar(null, "Consumidor Final")}
          pending={pending}
          pendingLabel="Guardando..."
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Dejarla en Consumidor Final
        </LoadingButton>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        type="button"
        onClick={() => {
          setAbierto(false);
          setQuery("");
          setError(null);
        }}
        className="block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Cancelar
      </button>
    </div>
  );
}
