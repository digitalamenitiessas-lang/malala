"use client";

import { useState, useTransition } from "react";

/**
 * Editar cuánto consume un servicio de un insumo.
 *
 * El botón decía "↻" y nada más: ni texto, ni tooltip, ni aviso al guardar.
 * El salón lo leyó como "recargar" y dio por hecho que no se podía guardar
 * —"quiero agregar datos a recetas y no se guardó", "¿en dónde se pone para
 * guardar?"—, cuando en realidad guardaba y no lo decía.
 */
export function CantidadRecetaForm({
  insumoId,
  cantidad,
  unidad,
  action,
}: {
  insumoId: string;
  cantidad: number;
  unidad: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [valor, setValor] = useState(String(cantidad));
  const [guardado, setGuardado] = useState(false);
  const [pending, startTransition] = useTransition();

  // Sólo se ofrece guardar si cambió algo: un botón siempre activo al lado de
  // cada fila invita a tocarlo sin necesidad, y después nadie sabe qué cambió.
  const cambio = valor !== String(cantidad);

  return (
    <form
      className="flex items-center justify-end gap-1"
      action={(formData) => {
        setGuardado(false);
        startTransition(async () => {
          await action(formData);
          setGuardado(true);
        });
      }}
    >
      <input type="hidden" name="insumo_id" value={insumoId} />
      <input
        type="number"
        name="cantidad"
        step="0.01"
        min="0.01"
        value={valor}
        onChange={(e) => {
          setValor(e.currentTarget.value);
          setGuardado(false);
        }}
        className="w-20 rounded-md border border-border bg-card px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <span className="text-xs text-muted-foreground">{unidad}</span>
      {cambio ? (
        <button
          type="submit"
          disabled={pending}
          className="ml-1 rounded-md bg-sage-700 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-white transition-colors hover:bg-sage-900 disabled:opacity-60"
        >
          {pending ? "Guardando..." : "Guardar"}
        </button>
      ) : (
        <span className="ml-1 w-16 text-[10px] uppercase tracking-wider text-sage-700">
          {guardado ? "Guardado" : ""}
        </span>
      )}
    </form>
  );
}
