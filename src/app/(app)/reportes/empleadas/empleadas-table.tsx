"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatARS, formatDateShort } from "@/lib/utils";

export interface EmpleadaFila {
  empleadoId: string;
  nombre: string;
  servicios: number;
  facturado: number;
  comisiones: number;
  netoNegocio: number;
}

export interface DetalleLinea {
  fecha: string; // ISO
  servicio: string;
  cantidad: number;
  precio: number;
  comision: number;
}

interface Props {
  filas: EmpleadaFila[];
  detalle: Record<string, DetalleLinea[]>;
  totales: {
    servicios: number;
    facturado: number;
    comisiones: number;
    netoNegocio: number;
  };
}

function fmtFecha(iso: string): string {
  return formatDateShort(iso);
}

export function EmpleadasReportTable({ filas, detalle, totales }: Props) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-card border border-border rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-3 py-3">Empleada</th>
            <th className="text-right font-medium px-3 py-3 w-24">Servicios</th>
            <th className="text-right font-medium px-3 py-3 w-28">Facturado</th>
            <th className="text-right font-medium px-3 py-3 w-28">Comisiones</th>
            <th className="text-right font-medium px-3 py-3 w-28">Neto negocio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="px-3 py-8 text-center text-sm text-muted-foreground"
              >
                Sin servicios cargados a empleadas en el período.
              </td>
            </tr>
          ) : (
            filas.map((f) => {
              const abierta = abiertas.has(f.empleadoId);
              const lineas = detalle[f.empleadoId] ?? [];
              return (
                <FilaEmpleada
                  key={f.empleadoId}
                  fila={f}
                  abierta={abierta}
                  lineas={lineas}
                  onToggle={() => toggle(f.empleadoId)}
                />
              );
            })
          )}
        </tbody>
        {filas.length > 0 && (
          <tfoot className="bg-cream/30 text-xs uppercase tracking-wider">
            <tr className="border-t-2 border-border">
              <td className="px-3 py-3 font-semibold">Totales</td>
              <td className="px-3 py-3 text-right tabular-nums font-semibold">
                {totales.servicios}
              </td>
              <td className="px-3 py-3 text-right tabular-nums font-semibold">
                {formatARS(totales.facturado)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums font-semibold">
                {formatARS(totales.comisiones)}
              </td>
              <td
                className={`px-3 py-3 text-right tabular-nums font-semibold ${
                  totales.netoNegocio >= 0 ? "text-sage-700" : "text-destructive"
                }`}
              >
                {formatARS(totales.netoNegocio)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function FilaEmpleada({
  fila,
  abierta,
  lineas,
  onToggle,
}: {
  fila: EmpleadaFila;
  abierta: boolean;
  lineas: DetalleLinea[];
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="hover:bg-cream/30 cursor-pointer"
        onClick={onToggle}
        aria-expanded={abierta}
      >
        <td className="px-3 py-3 font-medium">
          <span className="flex items-center gap-1.5">
            <ChevronRight
              className={`h-4 w-4 stroke-[1.5] text-muted-foreground transition-transform ${
                abierta ? "rotate-90" : ""
              }`}
            />
            {fila.nombre}
          </span>
        </td>
        <td className="px-3 py-3 text-right tabular-nums">{fila.servicios}</td>
        <td className="px-3 py-3 text-right tabular-nums">
          {formatARS(fila.facturado)}
        </td>
        <td className="px-3 py-3 text-right tabular-nums">
          {formatARS(fila.comisiones)}
        </td>
        <td
          className={`px-3 py-3 text-right tabular-nums font-medium ${
            fila.netoNegocio >= 0 ? "text-sage-700" : "text-destructive"
          }`}
        >
          {formatARS(fila.netoNegocio)}
        </td>
      </tr>
      {abierta && (
        <tr className="bg-cream/20">
          <td colSpan={5} className="px-3 py-3">
            {lineas.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sin servicios en el período.
              </p>
            ) : (
              <div className="rounded-md border border-border bg-card overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-cream/40">
                    <tr>
                      <th className="text-left font-medium px-3 py-2 w-24">Fecha</th>
                      <th className="text-left font-medium px-3 py-2">Servicio</th>
                      <th className="text-right font-medium px-3 py-2 w-16">Cant.</th>
                      <th className="text-right font-medium px-3 py-2 w-28">Precio</th>
                      <th className="text-right font-medium px-3 py-2 w-28">Comisión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lineas.map((l, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                          {fmtFecha(l.fecha)}
                        </td>
                        <td className="px-3 py-1.5">{l.servicio}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {l.cantidad}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatARS(l.precio)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-sage-700">
                          {formatARS(l.comision)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
