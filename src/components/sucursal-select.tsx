"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

/**
 * El desplegable de sucursal, que cambia al elegir.
 *
 * Antes era un select suelto con un botón "Cambiar" al lado, en letra chica y
 * sin fondo. Elegir la sucursal y no tocar el botón no hacía nada, y la
 * pantalla seguía mostrando la sucursal anterior: se ve igual que si el
 * cambio estuviera roto. Reportado como "cambian de sucursal desde un
 * superadmin y no se cambia, sigue reflejando lo mismo de la primera".
 *
 * Elegir ES la acción. El botón queda para quien navega con el teclado y para
 * el caso sin JavaScript, pero ya no hace falta pasar por él.
 */
export function SucursalSelect({
  value,
  opciones,
}: {
  value: string;
  opciones: { id: string; nombre: string }[];
}) {
  const form = useRef<HTMLSelectElement>(null);
  const { pending } = useFormStatus();

  return (
    <select
      id="sucursal"
      name="sucursal_id"
      ref={form}
      defaultValue={value}
      disabled={pending}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="text-sm border border-border rounded-md px-3 py-1.5 bg-card disabled:opacity-60"
    >
      {opciones.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nombre}
        </option>
      ))}
    </select>
  );
}
