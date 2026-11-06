"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Search } from "lucide-react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { aplicarConteo, type FilaConteo } from "@/lib/data/stock-control";
import { calcularConteo, type EntradaConteo } from "@/lib/stock-control";
import { aEnvases, compararProveedor, envaseDe, fmtEnvases } from "@/lib/stock-planillas";
import { formatARS } from "@/lib/utils";

type Valores = { envases?: string; deposito?: string; exhibicion?: string };

interface Borrador {
  valores: Record<string, Valores>;
  contadoPor: string;
  nota: string;
  /** Contra qué momento se estaba comparando. Ver el efecto que lo restaura. */
  momento?: string;
}

/** "0,5" → 0.5; vacío → null; basura → NaN. */
function leer(s: string | undefined): number | null {
  if (s === undefined || s.trim() === "") return null;
  return Number(s.trim().replace(",", "."));
}

function entradaDe(v: Valores | undefined): EntradaConteo {
  return { envases: leer(v?.envases), deposito: leer(v?.deposito), exhibicion: leer(v?.exhibicion) };
}

function invalido(s: string | undefined): boolean {
  const n = leer(s);
  return n !== null && (!Number.isFinite(n) || n < 0);
}

/**
 * La carga masiva de un conteo: toda la lista en una pantalla, la diferencia
 * en envases y en pesos mientras se escribe, y se aplica de una vez.
 *
 * Lo escrito se guarda en este dispositivo mientras tanto: contar 240
 * productos lleva rato, y una recarga o un corte no puede borrar la mitad.
 */
export function ConteoStockForm({
  sucursalId,
  momento,
  momentoElegido,
  filas,
  puedeCargar,
}: {
  sucursalId: string;
  /** "YYYY-MM-DDTHH:mm" en hora argentina. */
  momento: string;
  /** El momento vino en la URL; si no, es "ahora" y puede ceder al del borrador. */
  momentoElegido: boolean;
  filas: FilaConteo[];
  puedeCargar: boolean;
}) {
  const router = useRouter();
  const { pending, run } = useTransitionFeedback<Awaited<ReturnType<typeof aplicarConteo>>>();
  const clave = `malala:conteo:${sucursalId}`;
  const [valores, setValores] = useState<Record<string, Valores>>({});
  const [contadoPor, setContadoPor] = useState("");
  const [nota, setNota] = useState("");
  const [cargado, setCargado] = useState(false);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<"bacha" | "venta" | "todos">("bacha");
  const [proveedor, setProveedor] = useState("");
  const [soloCargados, setSoloCargados] = useState(false);
  const tablaRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem(clave) ?? "null") as Borrador | null;
      if (b) {
        setValores(b.valores ?? {});
        setContadoPor(b.contadoPor ?? "");
        setNota(b.nota ?? "");
        // Un borrador se compara contra el momento en que se empezó, no
        // contra el de la última vez que se abrió la pantalla. Yerba Buena,
        // 06/11: contando la reventa durante el día, la pantalla se recargó y
        // el "sistema" pasó a ser el de ese momento, con una venta de suero de
        // argán ya descontada. La diferencia que había visto desapareció y
        // nadie entendía por qué.
        if (!momentoElegido && b.momento && b.momento !== momento && Object.keys(b.valores ?? {}).length > 0) {
          router.replace(`/stock/conteo?fecha=${b.momento}`);
        }
      }
    } catch {
      // Sin almacenamiento (modo privado): se carga igual, sin borrador.
    }
    setCargado(true);
    // Sólo al abrir: después el momento cambia únicamente desde su campo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  useEffect(() => {
    if (!cargado) return;
    try {
      localStorage.setItem(
        clave,
        JSON.stringify({ valores, contadoPor, nota, momento } satisfies Borrador),
      );
    } catch {
      // Idem.
    }
  }, [cargado, clave, valores, contadoPor, nota, momento]);

  const resultados = useMemo(() => {
    const out = new Map<string, NonNullable<ReturnType<typeof calcularConteo>>>();
    for (const f of filas) {
      const r = calcularConteo(f, f.sistema, entradaDe(valores[f.id]));
      if (r) out.set(f.id, r);
    }
    return out;
  }, [filas, valores]);

  const proveedores = useMemo(
    () =>
      [...new Set(filas.filter((f) => tipo === "todos" || f.tipo === tipo).map((f) => f.proveedor ?? ""))]
        .sort(compararProveedor),
    [filas, tipo],
  );

  const visibles = useMemo(() => {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
    const needle = norm(q.trim());
    return filas
      .filter((f) => {
        if (tipo !== "todos" && f.tipo !== tipo) return false;
        if (proveedor && (f.proveedor ?? "") !== proveedor) return false;
        if (soloCargados && !resultados.has(f.id)) return false;
        if (needle && !norm(`${f.nombre} ${f.codigo ?? ""}`).includes(needle)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          compararProveedor(a.proveedor, b.proveedor) ||
          a.nombre.localeCompare(b.nombre, "es"),
      );
  }, [filas, tipo, proveedor, soloCargados, q, resultados]);

  const resumen = useMemo(() => {
    let conDiferencia = 0;
    let faltante = 0;
    let sobrante = 0;
    for (const r of resultados.values()) {
      if (r.diferencia !== 0 || r.diferenciaDeposito !== 0) conDiferencia++;
      if (r.valor < 0) faltante += r.valor;
      else sobrante += r.valor;
    }
    return { cargados: resultados.size, conDiferencia, faltante, sobrante };
  }, [resultados]);

  const hayInvalidos = Object.values(valores).some(
    (v) => invalido(v.envases) || invalido(v.deposito) || invalido(v.exhibicion),
  );

  function set(id: string, campo: keyof Valores, valor: string) {
    setValores((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  }

  // Enter pasa al siguiente casillero, como en una planilla.
  function siguiente(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = Array.from(tablaRef.current?.querySelectorAll<HTMLInputElement>("input") ?? []);
    const i = inputs.indexOf(e.currentTarget);
    inputs[i + 1]?.focus();
    inputs[i + 1]?.select();
  }

  function borrarTodo() {
    if (!window.confirm("¿Borrar todo lo cargado en este conteo?")) return;
    setValores({});
    setContadoPor("");
    setNota("");
  }

  function aplicar() {
    const items = filas
      .filter((f) => resultados.has(f.id))
      .map((f) => ({ insumo_id: f.id, ...entradaDe(valores[f.id]) }));
    const total = resumen.faltante + resumen.sobrante;
    const ok = window.confirm(
      `Se va a corregir el stock de ${resumen.conDiferencia} de ${items.length} productos contados. ` +
        `Diferencia: ${formatARS(total)} (faltante ${formatARS(resumen.faltante)}, sobrante ${formatARS(resumen.sobrante)}). ¿Aplicar el conteo?`,
    );
    if (!ok) return;
    const [ymd, hm] = momento.split("T");
    run(
      () =>
        aplicarConteo({
          sucursal_id: sucursalId,
          fecha: new Date(`${ymd}T${hm}:00.000-03:00`).toISOString(),
          contado_por: contadoPor.trim() || undefined,
          nota: nota.trim() || undefined,
          items,
        }),
      {
        successMessage: "Conteo aplicado",
        redirectTo: (r) => (r.id ? `/stock/conteos/${r.id}` : "/stock/conteos"),
        onSuccess: () => {
          try {
            localStorage.removeItem(clave);
          } catch {}
        },
      },
    );
  }

  const chip = (valor: typeof tipo, label: string) => (
    <button
      type="button"
      onClick={() => {
        setTipo(valor);
        setProveedor("");
      }}
      className={`rounded-md border px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
        tipo === valor ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-cream"
      }`}
    >
      {label}
    </button>
  );

  const input = (id: string, campo: keyof Valores, label: string) => (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      placeholder="—"
      value={valores[id]?.[campo] ?? ""}
      onChange={(e) => set(id, campo, e.target.value)}
      onKeyDown={siguiente}
      disabled={!puedeCargar}
      className={`w-20 rounded-md border bg-card px-2 py-1 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring ${
        invalido(valores[id]?.[campo]) ? "border-destructive" : "border-border"
      }`}
    />
  );

  return (
    <div className="space-y-4 pb-24">
      <div className="grid gap-3 rounded-[1.5rem] border border-border bg-card p-4 md:grid-cols-[auto_1fr_1fr]">
        <label className="space-y-1.5 text-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">¿Cuándo se contó?</span>
          <input
            type="datetime-local"
            value={momento}
            max={new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 16)}
            onChange={(e) => {
              if (e.target.value) router.replace(`/stock/conteo?fecha=${e.target.value}`);
            }}
            className="w-full rounded-xl border border-border bg-card px-3 py-2"
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Contado por</span>
          <input
            value={contadoPor}
            onChange={(e) => setContadoPor(e.target.value)}
            placeholder="Ej. Elu"
            maxLength={80}
            className="w-full rounded-xl border border-border bg-card px-3 py-2"
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Nota</span>
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Opcional"
            maxLength={500}
            className="w-full rounded-xl border border-border bg-card px-3 py-2"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chip("bacha", "Uso del salón")}
        {chip("venta", "Reventa")}
        {chip("todos", "Todo")}
        <select
          value={proveedor}
          onChange={(e) => setProveedor(e.target.value)}
          aria-label="Proveedor"
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p || "-"} value={p}>
              {p || "Sin proveedor"}
            </option>
          ))}
        </select>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.5] text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloCargados} onChange={(e) => setSoloCargados(e.target.checked)} />
          Sólo cargados
        </label>
        <a
          href={`/stock/conteo/planilla?fecha=${momento}`}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-cream"
        >
          <Download className="h-4 w-4 stroke-[1.5]" />
          Planilla Excel
        </a>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-3 text-left font-medium">Producto</th>
              <th className="px-3 py-3 text-right font-medium">Sistema</th>
              <th className="px-3 py-3 text-right font-medium">Contado (env.)</th>
              <th className="px-3 py-3 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody ref={tablaRef} className="divide-y divide-border">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No hay productos que coincidan.
                </td>
              </tr>
            )}
            {visibles.map((f) => {
              const r = resultados.get(f.id);
              const venta = f.tipo === "venta";
              const exhib = f.sistema.cantidad - f.sistema.deposito;
              return (
                <tr key={f.id} className={r ? "bg-cream/20" : undefined}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{f.nombre}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {[f.codigo, f.proveedor, `envase ${envaseDe(f)}`].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {venta ? (
                      <div className="text-[12px] leading-5">
                        <div>dep. {fmtEnvases(aEnvases(f.sistema.deposito, f))}</div>
                        <div>exh. {fmtEnvases(aEnvases(exhib, f))}</div>
                      </div>
                    ) : (
                      <span className={f.sistema.cantidad < 0 ? "text-destructive" : undefined}>
                        {fmtEnvases(aEnvases(f.sistema.cantidad, f))}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {venta ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          dep. {input(f.id, "deposito", `${f.nombre}: depósito`)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          exh. {input(f.id, "exhibicion", `${f.nombre}: exhibición`)}
                        </span>
                      </div>
                    ) : (
                      input(f.id, "envases", f.nombre)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r && (
                      <>
                        <div
                          className={
                            r.diferencia < 0
                              ? "text-destructive"
                              : r.diferencia > 0
                                ? "text-sage-700"
                                : "text-muted-foreground"
                          }
                        >
                          {r.diferencia > 0 ? "+" : ""}
                          {fmtEnvases(aEnvases(r.diferencia, f))} env.
                        </div>
                        {/* El reparto también se corrige, aunque el total
                            coincida. Sin esto la fila decía "0 env." y el
                            resumen la contaba igual como "con diferencia":
                            "se iban a ajustar 3 productos pero se veían 2". */}
                        {venta && r.diferenciaDeposito !== 0 && (
                          <div className="text-[11px] text-brown-700">
                            dep. {r.diferenciaDeposito > 0 ? "+" : ""}
                            {fmtEnvases(aEnvases(r.diferenciaDeposito, f))} · exh.{" "}
                            {r.diferenciaExhibicion > 0 ? "+" : ""}
                            {fmtEnvases(aEnvases(r.diferenciaExhibicion, f))}
                          </div>
                        )}
                        <div className="text-[11px] text-muted-foreground">{formatARS(r.valor)}</div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <strong className="tabular-nums">{resumen.cargados}</strong> contados ·{" "}
            <strong className="tabular-nums">{resumen.conDiferencia}</strong> con diferencia ·{" "}
            <span className="text-destructive tabular-nums">{formatARS(resumen.faltante)}</span> /{" "}
            <span className="text-sage-700 tabular-nums">+{formatARS(resumen.sobrante)}</span>
          </p>
          <div className="flex items-center gap-2">
            {resumen.cargados > 0 && (
              <button
                type="button"
                onClick={borrarTodo}
                className="rounded-md border border-border px-3 py-2 text-xs uppercase tracking-wider hover:bg-cream"
              >
                Borrar todo
              </button>
            )}
            {puedeCargar ? (
              <button
                type="button"
                onClick={aplicar}
                disabled={pending || resumen.cargados === 0 || hayInvalidos}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700 disabled:opacity-50"
              >
                {pending ? "Aplicando..." : "Aplicar conteo"}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">
                Solo la encargada o un administrador pueden aplicar el conteo.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
