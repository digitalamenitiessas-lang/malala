"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "./field";
import { crearApertura } from "@/lib/data/apertura-caja";
import type { AperturaCuentaSugerida } from "@/lib/data/apertura-caja";
import { formatARS } from "@/lib/utils";
import { CurrencyInput } from "./currency-input";

/** "2026-09-10" → "10/09/2026". */
function fmtFecha(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

interface Props {
  sucursalId: string;
  fecha: string;
  cuentas: AperturaCuentaSugerida[];
}

export function AperturaCajaForm({ sucursalId, fecha, cuentas }: Props) {
  const { pending, run } = useTransitionFeedback();
  const [error, setError] = useState<string | null>(null);
  /** Fecha de la caja que quedó abierta y bloquea abrir otra, si es el caso. */
  const [cajaAbierta, setCajaAbierta] = useState<string | null>(null);
  const [observacion, setObservacion] = useState("");
  const [declarado, setDeclarado] = useState<Record<string, number>>(() =>
    Object.fromEntries(cuentas.map((cuenta) => [cuenta.cuenta.id, cuenta.esperado])),
  );

  const totales = useMemo(() => {
    let esperado = 0;
    let decl = 0;
    for (const cuenta of cuentas) {
      esperado += cuenta.esperado;
      decl += declarado[cuenta.cuenta.id] ?? cuenta.esperado;
    }
    return { esperado, declarado: decl, diferencia: decl - esperado };
  }, [cuentas, declarado]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCajaAbierta(null);
    const fd = new FormData();
    fd.set("sucursal_id", sucursalId);
    fd.set("fecha", fecha);
    fd.set("observacion", observacion);
    for (const cuenta of cuentas) {
      fd.set(
        `declarado_${cuenta.cuenta.id}`,
        String(declarado[cuenta.cuenta.id] ?? cuenta.esperado),
      );
    }

    run(
      async () => {
        const result = await crearApertura(null, fd);
        if (!result.ok) {
          const bloqueante = result.errors.caja_abierta?.[0] ?? null;
          setCajaAbierta(bloqueante);
          setError(
            bloqueante
              ? null
              : Object.values(result.errors).flat().join(", ") || "Error",
          );
        }
        return result;
      },
      {
        redirectTo: "/caja",
        successMessage: "Caja abierta",
      },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-md border border-border bg-card p-5"
    >
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Cuenta</th>
              <th className="px-4 py-3 text-right font-medium">Esperado</th>
              <th className="px-4 py-3 text-right font-medium">Lo que tenes</th>
              <th className="px-4 py-3 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cuentas.map((cuenta) => {
              const decl = declarado[cuenta.cuenta.id] ?? cuenta.esperado;
              const diff = decl - cuenta.esperado;
              return (
                <tr key={cuenta.cuenta.id}>
                  <td className="px-4 py-3 font-medium">
                    {cuenta.cuenta.nombre}
                    <span className="ml-1 text-xs uppercase text-muted-foreground">
                      ({cuenta.cuenta.tipo})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatARS(cuenta.esperado)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <CurrencyInput
                      value={decl}
                      min={0}
                      onChange={(value) =>
                        setDeclarado((prev) => ({
                          ...prev,
                          [cuenta.cuenta.id]: value,
                        }))
                      }
                      className="w-32 rounded-md border border-border bg-card px-3 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    style={{
                      color:
                        Math.abs(diff) < 0.005
                          ? "var(--muted-foreground)"
                          : diff > 0
                            ? "var(--sage-700)"
                            : "var(--danger)",
                    }}
                  >
                    {diff > 0 ? "+" : ""}
                    {formatARS(diff)}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-cream/40 font-medium">
              <td className="px-4 py-3">Totales</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatARS(totales.esperado)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatARS(totales.declarado)}
              </td>
              <td
                className="px-4 py-3 text-right tabular-nums"
                style={{
                  color:
                    Math.abs(totales.diferencia) < 0.005
                      ? "var(--ink)"
                      : totales.diferencia > 0
                        ? "var(--sage-700)"
                        : "var(--danger)",
                }}
              >
                {totales.diferencia > 0 ? "+" : ""}
                {formatARS(totales.diferencia)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        El <strong>esperado</strong> es lo que la app calcula que deberia haber.
        Carga en <strong>&ldquo;Lo que tenes&rdquo;</strong> la plata real con la
        que arrancas. Si hay diferencia, el saldo de la cuenta se ajusta a lo que
        cargues.
      </p>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Observacion (opcional)
        </label>
        <textarea
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Notas de la apertura..."
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Un "cerrala antes de abrir otra" sin decir dónde deja a la encargada
          sin salida. Acá el aviso trae el botón que lleva directo a cerrarla. */}
      {cajaAbierta && (
        <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-medium text-brown-900">
            Quedó abierta la caja del {fmtFecha(cajaAbierta)}
          </p>
          <p className="text-xs text-brown-700">
            Hay que cerrarla antes de abrir una nueva. Cerrar es declarar con
            cuánto terminó ese día; después podés abrir la de hoy.
          </p>
          <Link
            href={`/caja/nuevo?fecha=${cajaAbierta}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-warning px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-brown-900 transition-colors hover:bg-warning/90"
          >
            Cerrar la caja del {fmtFecha(cajaAbierta)}
          </Link>
        </div>
      )}

      <div className="flex items-center gap-3">
        <LoadingButton
          type="submit"
          pending={pending}
          pendingLabel="Abriendo..."
          className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
        >
          Abrir caja
        </LoadingButton>
        <Link
          href="/caja"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-cream"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
