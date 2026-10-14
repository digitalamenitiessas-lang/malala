"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatARS } from "@/lib/utils";

const UNIDAD_LABEL: Record<string, string> = {
  ud: "ud",
  ml: "ml",
  g: "g",
  aplicacion: "apl.",
};

export interface StockFila {
  insumo: {
    id: string;
    nombre: string;
    unidad_medida: string;
    tamano_envase: number;
    umbral_stock_bajo: number;
    precio_unitario?: number | null;
  };
  cantidad: number;
  estado: "ok" | "bajo" | "negativo";
}

/**
 * La lista de stock, con buscador.
 *
 * Son cientos de insumos y hasta ahora había que bajar scrolleando: "¿podemos
 * poner un buscador para filtrar?". Filtra mientras se escribe, sin recargar,
 * porque la lista ya está entera en la pantalla.
 *
 * Los botones de estado son el mismo pedido por otro lado: con 75 insumos en
 * negativo, poder ver sólo esos es la diferencia entre revisarlos y no.
 */
export function StockTabla({ filas }: { filas: StockFila[] }) {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<"todos" | "bajo" | "negativo">("todos");

  const visibles = useMemo(() => {
    // Sin acentos y en minúscula: "algodon" tiene que encontrar "Algodón".
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
    const needle = norm(q.trim());
    return filas.filter((f) => {
      if (estado !== "todos" && f.estado !== estado) return false;
      if (!needle) return true;
      return norm(f.insumo.nombre).includes(needle);
    });
  }, [filas, q, estado]);

  const chip = (valor: typeof estado, label: string, n: number) => (
    <button
      type="button"
      onClick={() => setEstado(valor)}
      className={`rounded-md border px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
        estado === valor
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border hover:bg-cream"
      }`}
    >
      {label} {n > 0 && <span className="tabular-nums">({n})</span>}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.5] text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar insumo..."
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {chip("todos", "Todos", filas.length)}
        {chip("bajo", "Bajo", filas.filter((f) => f.estado === "bajo").length)}
        {chip(
          "negativo",
          "Negativo",
          filas.filter((f) => f.estado === "negativo").length,
        )}
      </div>

      {(q || estado !== "todos") && (
        <p className="text-xs text-muted-foreground">
          {visibles.length} de {filas.length} insumos
        </p>
      )}

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Insumo</th>
              <th className="px-4 py-3 text-right font-medium">Stock</th>
              <th className="px-4 py-3 text-right font-medium">Umbral</th>
              <th className="px-4 py-3 text-right font-medium">$ unitario</th>
              <th className="px-4 py-3 text-right font-medium">Valor en stock</th>
              <th className="w-28 px-4 py-3 text-center font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibles.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No hay insumos que coincidan.
                </td>
              </tr>
            )}
            {visibles.map(({ insumo, cantidad, estado: est }) => {
              const valor =
                insumo.precio_unitario != null
                  ? cantidad * insumo.precio_unitario
                  : null;
              return (
                <tr key={insumo.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 font-medium">{insumo.nombre}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div>
                      {cantidad.toLocaleString("es-AR")}{" "}
                      {UNIDAD_LABEL[insumo.unidad_medida]}
                    </div>
                    {insumo.tamano_envase !== 1 && (
                      <div className="text-[11px] text-muted-foreground">
                        ≈{" "}
                        {(cantidad / insumo.tamano_envase).toLocaleString(
                          "es-AR",
                          { maximumFractionDigits: 2 },
                        )}{" "}
                        env. de {insumo.tamano_envase}{" "}
                        {UNIDAD_LABEL[insumo.unidad_medida]}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {insumo.umbral_stock_bajo}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {insumo.precio_unitario != null
                      ? formatARS(insumo.precio_unitario)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {valor != null ? formatARS(valor) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {est === "negativo" && (
                      <span
                        className="rounded px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: "rgb(168 74 61 / 0.12)",
                          color: "var(--danger)",
                        }}
                      >
                        Negativo
                      </span>
                    )}
                    {est === "bajo" && (
                      <span
                        className="rounded px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: "rgb(201 169 97 / 0.15)",
                          color: "var(--warning)",
                        }}
                      >
                        Bajo
                      </span>
                    )}
                    {est === "ok" && (
                      <span className="rounded bg-sage-100 px-2 py-0.5 text-xs font-medium text-sage-900">
                        OK
                      </span>
                    )}
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
