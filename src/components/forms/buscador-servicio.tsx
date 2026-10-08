"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

/**
 * Elegir un servicio escribiendo, en vez de buscarlo a ojo en una lista larga.
 *
 * El salón pidió esto mirando el desplegable de Centro: "podemos buscar el
 * servicio tipeando y que lo vaya encontrando por coincidencia". Son 133
 * servicios en una lista nativa, ordenada por rubro y no alfabéticamente, y
 * encontrar "Lifting de pestañas coreano" ahí es desplazarse y leer.
 *
 * Busca sin acentos y por palabras sueltas: "lift coreano" encuentra "Lifting
 * de pestañas (coreano)". En el mostrador nadie escribe la ñ ni respeta el
 * orden de las palabras.
 */

export interface OpcionServicio {
  id: string;
  nombre: string;
}

/** minúsculas y sin acentos, para que "pestanas" encuentre "pestañas". */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function coincide(nombre: string, consulta: string): boolean {
  const n = normalizar(nombre);
  // Cada palabra por separado: el orden en que se escriben no importa.
  return normalizar(consulta)
    .split(/\s+/)
    .filter(Boolean)
    .every((palabra) => n.includes(palabra));
}

export function BuscadorServicio({
  servicios,
  value,
  onChange,
  placeholder = "— Servicio —",
}: {
  servicios: OpcionServicio[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const elegido = servicios.find((s) => s.id === value);
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [resaltado, setResaltado] = useState(0);
  const caja = useRef<HTMLDivElement>(null);

  const filtrados = useMemo(() => {
    if (!consulta.trim()) return servicios;
    return servicios.filter((s) => coincide(s.nombre, consulta));
  }, [servicios, consulta]);

  useEffect(() => setResaltado(0), [consulta]);

  // Cerrar al tocar afuera: en el mostrador se salta de campo con el mouse y
  // un desplegable abierto encima del ticket tapa el total.
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node)) {
        setAbierto(false);
        setConsulta("");
      }
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  function elegir(id: string) {
    onChange(id);
    setAbierto(false);
    setConsulta("");
  }

  return (
    <div ref={caja} className="relative">
      <div className="flex items-center gap-1 w-full px-2 py-1.5 border border-border rounded-md bg-card focus-within:ring-2 focus-within:ring-ring">
        <input
          type="text"
          value={abierto ? consulta : (elegido?.nombre ?? "")}
          placeholder={elegido ? elegido.nombre : placeholder}
          onFocus={() => setAbierto(true)}
          onChange={(e) => {
            setConsulta(e.currentTarget.value);
            setAbierto(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAbierto(true);
              setResaltado((i) => Math.min(i + 1, filtrados.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setResaltado((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              // Sin preventDefault, el Enter manda el formulario y guarda la
              // venta a medio cargar.
              e.preventDefault();
              const s = filtrados[resaltado];
              if (s) elegir(s.id);
            } else if (e.key === "Escape") {
              setAbierto(false);
              setConsulta("");
            }
          }}
          className="w-full bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
        />
        {elegido && !abierto ? (
          <button
            type="button"
            onClick={() => elegir("")}
            aria-label="Quitar servicio"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5 stroke-[1.5]" />
          </button>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-muted-foreground" />
        )}
      </div>

      {abierto && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
          {filtrados.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Ningún servicio con “{consulta}”.
            </li>
          ) : (
            filtrados.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onMouseEnter={() => setResaltado(i)}
                  onClick={() => elegir(s.id)}
                  className={`block w-full px-3 py-1.5 text-left text-sm ${
                    i === resaltado ? "bg-cream" : ""
                  } ${s.id === value ? "font-medium" : ""}`}
                >
                  {s.nombre}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
