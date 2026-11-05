"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { guardarUmbrales, type FilaCompra } from "@/lib/data/stock-control";
import { aEnvases, compararProveedor, envaseDe, fmtEnvases } from "@/lib/stock-planillas";
import { formatARS } from "@/lib/utils";

/**
 * La lista para comprar, agrupada por proveedor para armar cada pedido, y los
 * umbrales sugeridos. Guardar un umbral es elegirlo: el sistema no los cambia
 * solo, porque un producto que se compra por única vez no tiene que avisar.
 */
export function ComprasTabla({
  filas,
  sucursalId,
  puedeGuardarUmbrales,
  frecuenciaDias,
  margenDias,
}: {
  filas: FilaCompra[];
  sucursalId: string;
  puedeGuardarUmbrales: boolean;
  frecuenciaDias: number;
  margenDias: number;
}) {
  const { pending, run } = useTransitionFeedback();
  const [vista, setVista] = useState<"comprar" | "todos">("comprar");
  const [tipo, setTipo] = useState<"todos" | "bacha" | "venta">("todos");
  const [q, setQ] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());

  const visibles = useMemo(() => {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
    const needle = norm(q.trim());
    return filas
      .filter((f) => {
        if (tipo !== "todos" && f.insumo.tipo !== tipo) return false;
        if (vista === "comprar" && f.sugerencia.comprarEnvases === 0) return false;
        if (vista === "todos" && f.sugerencia.consumoDiario === 0) return false;
        if (needle && !norm(`${f.insumo.nombre} ${f.insumo.proveedor ?? ""}`).includes(needle)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          compararProveedor(a.insumo.proveedor, b.insumo.proveedor) ||
          a.insumo.nombre.localeCompare(b.insumo.nombre, "es"),
      );
  }, [filas, tipo, vista, q]);

  const grupos = useMemo(() => {
    const out: { proveedor: string; filas: FilaCompra[]; costo: number }[] = [];
    for (const f of visibles) {
      const proveedor = f.insumo.proveedor ?? "Sin proveedor";
      let g = out[out.length - 1];
      if (!g || g.proveedor !== proveedor) {
        g = { proveedor, filas: [], costo: 0 };
        out.push(g);
      }
      g.filas.push(f);
      g.costo += f.sugerencia.comprarEnvases * f.insumo.precio_envase;
    }
    return out;
  }, [visibles]);

  const costoTotal = grupos.reduce((a, g) => a + g.costo, 0);
  const sinConsumo = filas.filter((f) => f.sugerencia.consumoDiario === 0).length;

  // Sólo vale la pena guardar los que cambian.
  const cambia = (f: FilaCompra) => f.sugerencia.umbral !== f.insumo.umbral_stock_bajo;
  const elegibles = visibles.filter(cambia);

  function alternar(id: string) {
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function guardar() {
    const umbrales = filas
      .filter((f) => elegidos.has(f.insumo.id))
      .map((f) => ({ insumo_id: f.insumo.id, umbral: f.sugerencia.umbral }));
    if (umbrales.length === 0) return;
    if (!window.confirm(`¿Guardar el umbral sugerido de ${umbrales.length} productos?`)) return;
    run(() => guardarUmbrales({ sucursal_id: sucursalId, umbrales }), {
      refreshOnSuccess: true,
      onSuccess: () => setElegidos(new Set()),
    });
  }

  const chip = (activo: boolean, onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
        activo ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-cream"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {chip(vista === "comprar", () => setVista("comprar"), "Hay que comprar")}
        {chip(vista === "todos", () => setVista("todos"), "Todo lo que se usa")}
        <span className="mx-1 h-5 w-px bg-border" />
        {chip(tipo === "todos", () => setTipo("todos"), "Todo")}
        {chip(tipo === "bacha", () => setTipo("bacha"), "Uso del salón")}
        {chip(tipo === "venta", () => setTipo("venta"), "Reventa")}
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
      </div>

      <p className="text-xs text-muted-foreground">
        {visibles.length} productos
        {vista === "comprar" && <> · costo estimado {formatARS(costoTotal)} a precio de la última compra</>}
        {sinConsumo > 0 && <> · {sinConsumo} productos sin consumo en el período no se listan</>}
        {" · "}cubre {frecuenciaDias} días hasta la próxima compra más {margenDias} de margen
      </p>

      {puedeGuardarUmbrales && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setElegidos(new Set(elegibles.map((f) => f.insumo.id)))}
            disabled={elegibles.length === 0}
            className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-cream disabled:opacity-50"
          >
            Elegir los {elegibles.length} que cambian
          </button>
          {elegidos.size > 0 && (
            <button
              type="button"
              onClick={() => setElegidos(new Set())}
              className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-cream"
            >
              Ninguno
            </button>
          )}
          <button
            type="button"
            onClick={guardar}
            disabled={pending || elegidos.size === 0}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700 disabled:opacity-50"
          >
            {pending ? "Guardando..." : `Guardar umbral sugerido (${elegidos.size})`}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              {puedeGuardarUmbrales && <th className="w-8 px-3 py-3" />}
              <th className="px-3 py-3 text-left font-medium">Producto</th>
              <th className="px-3 py-3 text-right font-medium">Stock</th>
              <th className="px-3 py-3 text-right font-medium">Uso por semana</th>
              <th className="px-3 py-3 text-right font-medium">Alcanza</th>
              <th className="px-3 py-3 text-right font-medium">Umbral actual → sugerido</th>
              <th className="px-3 py-3 text-right font-medium">Comprar</th>
              <th className="px-3 py-3 text-right font-medium">Costo est.</th>
            </tr>
          </thead>
          <tbody>
            {grupos.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  {vista === "comprar" ? "No hace falta comprar nada por ahora." : "No hay consumo en el período."}
                </td>
              </tr>
            )}
            {grupos.map((g) => (
              <Grupo
                key={g.proveedor}
                proveedor={g.proveedor}
                costo={g.costo}
                filas={g.filas}
                columnas={puedeGuardarUmbrales ? 8 : 7}
                elegidos={puedeGuardarUmbrales ? elegidos : null}
                alternar={alternar}
                cambia={cambia}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Grupo({
  proveedor,
  costo,
  filas,
  columnas,
  elegidos,
  alternar,
  cambia,
}: {
  proveedor: string;
  costo: number;
  filas: FilaCompra[];
  columnas: number;
  elegidos: Set<string> | null;
  alternar: (id: string) => void;
  cambia: (f: FilaCompra) => boolean;
}) {
  return (
    <>
      <tr className="border-t border-border bg-cream/40">
        <td colSpan={columnas} className="px-3 py-2 text-xs font-medium uppercase tracking-wider">
          {proveedor}
          {costo > 0 && <span className="ml-2 font-normal normal-case text-muted-foreground">{formatARS(costo)}</span>}
        </td>
      </tr>
      {filas.map((f) => {
        const i = f.insumo;
        const s = f.sugerencia;
        const e = (n: number) => fmtEnvases(aEnvases(n, i));
        const alcanza = s.diasQueAlcanza;
        return (
          <tr key={i.id} className="border-t border-border hover:bg-cream/30">
            {elegidos && (
              <td className="px-3 py-2">
                {cambia(f) && (
                  <input
                    type="checkbox"
                    aria-label={`Guardar umbral de ${i.nombre}`}
                    checked={elegidos.has(i.id)}
                    onChange={() => alternar(i.id)}
                  />
                )}
              </td>
            )}
            <td className="px-3 py-2">
              <div className="font-medium">{i.nombre}</div>
              <div className="text-[11px] text-muted-foreground">envase {envaseDe(i)}</div>
            </td>
            <td className={`px-3 py-2 text-right tabular-nums ${f.stock < 0 ? "text-destructive" : ""}`}>
              {e(f.stock)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{e(s.consumoDiario * 7)}</td>
            <td
              className={`px-3 py-2 text-right tabular-nums ${
                alcanza != null && alcanza < 7 ? "font-medium text-destructive" : ""
              }`}
            >
              {alcanza == null ? "—" : alcanza > 365 ? "+1 año" : `${Math.floor(alcanza)} días`}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              <span className="text-muted-foreground">{e(i.umbral_stock_bajo)}</span>
              {cambia(f) && <> → {e(s.umbral)}</>}
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-medium">
              {s.comprarEnvases > 0 ? s.comprarEnvases : "—"}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {s.comprarEnvases > 0 ? formatARS(s.comprarEnvases * i.precio_envase) : "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}
