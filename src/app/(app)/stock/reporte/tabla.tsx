"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { FilaReporte } from "@/lib/data/stock-control";
import { aEnvases, envaseDe, fmtEnvases } from "@/lib/stock-planillas";
import { formatARS } from "@/lib/utils";

function Num({ n, signo }: { n: number; signo?: boolean }) {
  if (n === 0) return <span className="text-muted-foreground/50">·</span>;
  return (
    <span className={signo && n < 0 ? "text-destructive" : undefined}>
      {signo && n > 0 ? "+" : ""}
      {fmtEnvases(n)}
    </span>
  );
}

/**
 * El reporte del período con filtros. Por defecto oculta lo que no se movió:
 * de 240 productos, en una semana se mueven la mitad.
 */
export function ReporteStockTabla({ filas }: { filas: FilaReporte[] }) {
  const [tipo, setTipo] = useState<"todos" | "bacha" | "venta">("todos");
  const [q, setQ] = useState("");
  const [todos, setTodos] = useState(false);

  const visibles = useMemo(() => {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
    const needle = norm(q.trim());
    return filas.filter((f) => {
      if (tipo !== "todos" && f.insumo.tipo !== tipo) return false;
      if (needle && !norm(`${f.insumo.nombre} ${f.insumo.proveedor ?? ""}`).includes(needle)) return false;
      if (!todos && Object.values(f.conceptos).every((v) => v === 0)) return false;
      return true;
    });
  }, [filas, tipo, q, todos]);

  const totales = useMemo(() => {
    const t = { inicial: 0, compras: 0, consumo: 0, conteo: 0, final: 0 };
    for (const f of filas) {
      if (tipo !== "todos" && f.insumo.tipo !== tipo) continue;
      const pu = f.insumo.precio_unitario ?? 0;
      const c = f.conceptos;
      t.inicial += Math.max(f.inicial.cantidad, 0) * pu;
      t.compras += c.compras * pu;
      t.consumo += -(c.consumo + c.ventas + c.uso_interno) * pu;
      t.conteo += c.conteo * pu;
      t.final += Math.max(f.final.cantidad, 0) * pu;
    }
    return t;
  }, [filas, tipo]);

  const chip = (valor: typeof tipo, label: string) => (
    <button
      type="button"
      onClick={() => setTipo(valor)}
      className={`rounded-md border px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
        tipo === valor ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-cream"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tarjeta label="Valor inicial" value={formatARS(totales.inicial)} />
        <Tarjeta label="Compras" value={formatARS(totales.compras)} />
        <Tarjeta label="Consumo y ventas" value={formatARS(totales.consumo)} hint="a costo" />
        <Tarjeta
          label="Diferencias de conteo"
          value={formatARS(totales.conteo)}
          tone={totales.conteo < 0 ? "danger" : undefined}
        />
        <Tarjeta label="Valor final" value={formatARS(totales.final)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chip("todos", "Todo")}
        {chip("bacha", "Uso del salón")}
        {chip("venta", "Reventa")}
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.5] text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar producto o proveedor..."
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
          Incluir los que no se movieron
        </label>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-3 text-left font-medium">Producto</th>
              <th className="px-3 py-3 text-right font-medium">Inicial</th>
              <th className="px-3 py-3 text-right font-medium">Compras</th>
              <th className="px-3 py-3 text-right font-medium">Consumo / ventas</th>
              <th className="px-3 py-3 text-right font-medium">Uso interno</th>
              <th className="px-3 py-3 text-right font-medium">Dif. conteo</th>
              <th className="px-3 py-3 text-right font-medium">Otros</th>
              <th className="px-3 py-3 text-right font-medium">Final</th>
              <th className="px-3 py-3 text-right font-medium">Valor final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No hubo movimientos en el período.
                </td>
              </tr>
            )}
            {visibles.map((f) => {
              const i = f.insumo;
              const c = f.conceptos;
              const e = (n: number) => aEnvases(n, i);
              const venta = i.tipo === "venta";
              return (
                <tr key={i.id} className="hover:bg-cream/30">
                  <td className="px-3 py-2">
                    <div className="font-medium">{i.nombre}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {[i.proveedor, `envase ${envaseDe(i)}`].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtEnvases(e(f.inicial.cantidad))}
                    {venta && (
                      <div className="text-[10px] text-muted-foreground">dep. {fmtEnvases(e(f.inicial.deposito))}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Num n={e(c.compras)} signo />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Num n={e(c.consumo + c.ventas)} signo />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Num n={e(c.uso_interno)} signo />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Num n={e(c.conteo)} signo />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Num n={e(c.otros)} signo />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    <span className={f.final.cantidad < 0 ? "text-destructive" : undefined}>
                      {fmtEnvases(e(f.final.cantidad))}
                    </span>
                    {venta && (
                      <div className="text-[10px] font-normal text-muted-foreground">
                        dep. {fmtEnvases(e(f.final.deposito))} · exh.{" "}
                        {fmtEnvases(e(f.final.cantidad - f.final.deposito))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {i.precio_unitario != null
                      ? formatARS(Math.max(f.final.cantidad, 0) * i.precio_unitario)
                      : "—"}
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

function Tarjeta({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger";
}) {
  return (
    <div
      className={`rounded-[1.4rem] border p-4 ${
        tone === "danger" ? "border-destructive/30 bg-destructive/10" : "border-border bg-card"
      }`}
    >
      <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-2xl tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
