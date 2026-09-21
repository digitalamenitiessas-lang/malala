import type { BloqueCodigoInsumo, InsumoTipo } from "@/lib/types";

const FORMATO_CODIGO = /^([A-Za-z]+)(\d+)$/;

export interface InsumoNumerado {
  codigo: string | null;
  nombre: string;
  tipo: InsumoTipo;
}

/**
 * Parte la numeración de un catálogo de insumos en bloques y calcula, para
 * cada uno, el último código usado y el siguiente libre.
 *
 * Los insumos no tienen rubro donde agrupar, como sí lo tienen los servicios.
 * La planilla del salón resuelve eso con el bloque de centenas: INS1xx es
 * L'Oréal, INS3xx Bonacure, INS5xx Olaplex, VPC1xx la reventa. Así que el
 * bloque hace de rubro — dar el "siguiente código" del catálogo entero no
 * sirve, porque lo que sigue después de INS859 no es una tintura de la 100.
 *
 * Los códigos que no siguen el formato letras+dígitos se ignoran: no se puede
 * continuar una numeración que no existe.
 *
 * Es una función pura sobre las filas para poder probarla con los códigos
 * reales del salón; la parte que consulta la base vive en data/insumos.ts.
 */
export function bloquesDeCodigos(
  filas: InsumoNumerado[],
): BloqueCodigoInsumo[] {
  const ocupados = new Set(
    filas.map((f) => f.codigo?.trim().toUpperCase()).filter(Boolean) as string[],
  );

  type Acum = {
    prefijo: string;
    centenas: string;
    ancho: number;
    mayor: number;
    ejemplos: string[];
    cantidad: number;
    tipos: Record<string, number>;
  };
  const bloques = new Map<string, Acum>();

  // Por código ascendente para que los ejemplos sean los primeros del bloque.
  const ordenadas = [...filas].sort((a, b) =>
    (a.codigo ?? "").localeCompare(b.codigo ?? ""),
  );

  for (const fila of ordenadas) {
    const codigo = fila.codigo?.trim().toUpperCase();
    if (!codigo) continue;
    const m = FORMATO_CODIGO.exec(codigo);
    if (!m) continue;
    const [, prefijo, digitos] = m;
    // Bloque = prefijo + todo menos las dos últimas cifras ("INS8", "VPC1").
    // Con menos de 3 dígitos no hay centenas y el bloque es el prefijo solo.
    const centenas = digitos.length >= 3 ? digitos.slice(0, -2) : "";
    const clave = `${prefijo}${centenas}`;
    const acum = bloques.get(clave) ?? {
      prefijo,
      centenas,
      ancho: digitos.length,
      mayor: -1,
      ejemplos: [],
      cantidad: 0,
      tipos: {},
    };
    acum.ancho = Math.max(acum.ancho, digitos.length);
    acum.mayor = Math.max(acum.mayor, Number(digitos));
    acum.cantidad += 1;
    acum.tipos[fila.tipo] = (acum.tipos[fila.tipo] ?? 0) + 1;
    if (acum.ejemplos.length < 2) acum.ejemplos.push(fila.nombre);
    bloques.set(clave, acum);
  }

  const salida: BloqueCodigoInsumo[] = [];
  for (const [clave, acum] of bloques) {
    const arma = (n: number) =>
      `${acum.prefijo}${String(n).padStart(acum.ancho, "0")}`;
    let n = acum.mayor + 1;
    // Saltea los que ya existen: los bloques se tocan cuando uno se llena.
    while (ocupados.has(arma(n))) n += 1;
    const tipo = (Object.entries(acum.tipos).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "bacha") as InsumoTipo;
    salida.push({
      bloque: acum.centenas ? `${clave}xx` : clave,
      tipo,
      ultimo: arma(acum.mayor),
      siguiente: arma(n),
      ejemplos: acum.ejemplos,
      cantidad: acum.cantidad,
    });
  }

  return salida.sort((a, b) => a.bloque.localeCompare(b.bloque));
}
