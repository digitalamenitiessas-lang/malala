"use client";

import { useRef, useState } from "react";
import { formatARS } from "@/lib/utils";
import { parseMontoArs, textoMontoTipeado } from "@/lib/monto-ars";

interface Props {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  name?: string;
  id?: string;
  min?: number;
  max?: number;
}

export function CurrencyInput({
  value,
  onChange,
  className,
  disabled,
  required,
  placeholder,
  name,
  id,
  min,
  max,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  // Fuera de foco el texto sale del valor → "$ 150.000". Mientras se escribe
  // manda lo tipeado, para que la coma de los centavos sobreviva a cada tecla.
  const [tipeando, setTipeando] = useState<string | null>(null);
  const display = tipeando ?? (value ? formatARS(value) : "");

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={display}
      name={name}
      id={id}
      disabled={disabled}
      required={required}
      placeholder={placeholder ?? "$ 0"}
      onFocus={(e) => {
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onBlur={() => setTipeando(null)}
      onChange={(e) => {
        const el = e.currentTarget;
        const crudo = e.target.value;
        let n = parseMontoArs(crudo);
        const fueraDeRango =
          (typeof min === "number" && n < min) ||
          (typeof max === "number" && n > max);
        if (typeof min === "number" && n < min) n = min;
        if (typeof max === "number" && n > max) n = max;
        // Si hubo que recortar, lo que se muestra es el valor recortado y no lo
        // tipeado: si no, el campo diría un número y valdría otro.
        setTipeando(fueraDeRango ? null : textoMontoTipeado(crudo));
        onChange(n);
        // Mantener el cursor al final (campo alineado a la derecha).
        requestAnimationFrame(() => {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        });
      }}
      className={className}
    />
  );
}
