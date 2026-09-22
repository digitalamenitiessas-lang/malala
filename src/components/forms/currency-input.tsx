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
      // Un clic sobre el campo selecciona todo, no solo el primero que le da
      // foco. Sin esto, volver a tocar un importe ya cargado deja el cursor al
      // final y lo tipeado se PEGA al número anterior: escribir 50000 sobre un
      // campo que dice "$ 50.000" da "$ 5.000.050.000". Es un error de cien mil
      // veces el monto y pasa en el gesto más natural, el de corregir.
      // En un campo de plata se reescribe el importe entero, no se lo edita
      // letra por letra, así que perder el posicionamiento del cursor no cuesta
      // nada y evita esto.
      onMouseUp={(e) => e.currentTarget.select()}
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
