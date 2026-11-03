/**
 * Elegir la tintura que se usó al cobrar un servicio.
 *
 * Cada receta descuenta un insumo fijo: "Color Raiz Loreal" gasta 30 g de
 * Majirel. Pero Yerba Buena hace los colores L'Oréal también con Igora ("todo
 * Igora, incluso Color 10, se usa en servicios L'Oréal"), y el sistema le
 * restaba a Majirel lo que salía de un pomo de Igora: Majirel bajaba de más e
 * Igora no bajaba nunca.
 *
 * Los insumos con el mismo `grupo_reemplazo` (misma sucursal, misma unidad) son
 * intercambiables: al cobrar se elige cuál se usó y se gastan los MISMOS gramos
 * de la receta, pero de ese. El servicio, el precio y la comisión no cambian.
 *
 * Una línea guarda solo lo que cambió: {insumo de la receta: insumo usado}.
 */

export type Reemplazos = Record<string, string>;

interface InsumoReemplazable {
  id: string;
  sucursal_id: string;
  nombre: string;
  unidad_medida: string;
  activo: boolean;
  grupo_reemplazo?: string | null;
  precio_unitario?: number | null;
}

interface RecetaLinea {
  servicio_id: string;
  sucursal_id: string;
  insumo_id: string;
  cantidad: number;
}

export interface TinturaElegible {
  /** El insumo que dice la receta: es la clave del reemplazo. */
  insumo_receta_id: string;
  /** Las que se pueden elegir, la de la receta primero. */
  opciones: { id: string; nombre: string }[];
}

/** El insumo que se gastó: el elegido, o el de la receta si no se cambió. */
export function insumoUsado(insumoRecetaId: string, reemplazos?: Reemplazos | null): string {
  return reemplazos?.[insumoRecetaId] ?? insumoRecetaId;
}

function mismoGrupo(a: InsumoReemplazable, b: InsumoReemplazable): boolean {
  return (
    !!a.grupo_reemplazo &&
    a.grupo_reemplazo === b.grupo_reemplazo &&
    a.sucursal_id === b.sucursal_id &&
    a.unidad_medida === b.unidad_medida
  );
}

/**
 * Por servicio, qué insumos de su receta se pueden cambiar al cobrar y por
 * cuáles. Un servicio sin tinturas reemplazables no aparece.
 */
export function tinturasElegiblesPorServicio(
  recetas: RecetaLinea[],
  insumos: InsumoReemplazable[],
  sucursalId: string,
): Record<string, TinturaElegible[]> {
  const insumosById = new Map(insumos.map((i) => [i.id, i]));
  const out: Record<string, TinturaElegible[]> = {};
  for (const receta of recetas) {
    if (receta.sucursal_id !== sucursalId) continue;
    const original = insumosById.get(receta.insumo_id);
    if (!original?.grupo_reemplazo) continue;
    const otras = insumos
      .filter((i) => i.id !== original.id && i.activo && mismoGrupo(original, i))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    if (otras.length === 0) continue;
    (out[receta.servicio_id] ??= []).push({
      insumo_receta_id: original.id,
      opciones: [original, ...otras].map((i) => ({ id: i.id, nombre: i.nombre })),
    });
  }
  return out;
}

/**
 * Revisa lo que mandó el formulario y deja solo los cambios válidos.
 *
 * Tira con un mensaje para la operadora si algo no corresponde: el insumo no
 * está en la receta, es de otro grupo o de otra sucursal, o está inactivo. Más
 * vale frenar la venta que descontar stock de lo que no se usó.
 */
export function limpiarReemplazos(args: {
  reemplazos: Reemplazos | null | undefined;
  insumosReceta: string[];
  insumosById: Map<string, InsumoReemplazable>;
  sucursalId: string;
}): Reemplazos | null {
  const limpio: Reemplazos = {};
  for (const [recetaId, usadoId] of Object.entries(args.reemplazos ?? {})) {
    if (!usadoId || usadoId === recetaId) continue;
    if (!args.insumosReceta.includes(recetaId)) {
      throw new Error("La tintura elegida no corresponde a la receta de ese servicio");
    }
    const original = args.insumosById.get(recetaId);
    const usado = args.insumosById.get(usadoId);
    if (!original || !usado || !mismoGrupo(original, usado) || usado.sucursal_id !== args.sucursalId) {
      throw new Error(
        `${usado?.nombre ?? "Esa tintura"} no se puede usar en lugar de ${original?.nombre ?? "la de la receta"}`,
      );
    }
    if (!usado.activo) throw new Error(`${usado.nombre} está desactivada`);
    limpio[recetaId] = usadoId;
  }
  return Object.keys(limpio).length > 0 ? limpio : null;
}

/**
 * Cuánto cambia el costo de UNA vez el servicio por las tinturas cambiadas:
 * los gramos de la receta a precio de la usada, menos a precio de la original.
 */
export function ajusteCostoPorReemplazos(
  recetas: Array<{ insumo_id: string; cantidad: number }>,
  reemplazos: Reemplazos | null | undefined,
  precioUnitario: (insumoId: string) => number | null | undefined,
): number {
  if (!reemplazos) return 0;
  let ajuste = 0;
  for (const receta of recetas) {
    const usado = reemplazos[receta.insumo_id];
    if (!usado || usado === receta.insumo_id) continue;
    ajuste +=
      receta.cantidad *
      ((precioUnitario(usado) ?? 0) - (precioUnitario(receta.insumo_id) ?? 0));
  }
  return ajuste;
}
