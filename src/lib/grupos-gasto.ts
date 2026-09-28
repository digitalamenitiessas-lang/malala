/**
 * Los seis grupos en los que se ordena un gasto.
 *
 * La distinción que importa es la última: del 1 al 5 son costos del salón, el 6
 * NO. Un retiro de socios o la compra de una máquina no son un costo de operar,
 * son reparto de ganancia e inversión; mezclarlos hace que el salón se vea más
 * caro de lo que es. Con los datos de septiembre la diferencia era del 23%:
 * $1.528.165 de "egresos" cuando lo operativo real eran $1.178.165.
 *
 * Por eso el tipo no se carga a mano: sale del grupo. Un gasto del grupo 6 es
 * no operativo siempre, y no hay forma de que alguien lo marque distinto sin
 * querer.
 */
export const GRUPOS_GASTO = [
  { id: 1, nombre: "Costos variables" },
  { id: 2, nombre: "Fijos operativos" },
  { id: 3, nombre: "Impuestos y bancarios" },
  { id: 4, nombre: "Marketing" },
  { id: 5, nombre: "Gastos varios" },
  { id: 6, nombre: "No operativo (bajo la línea)" },
] as const;

export type GrupoGastoId = (typeof GRUPOS_GASTO)[number]["id"];

export const GRUPO_NOMBRE: Record<number, string> = Object.fromEntries(
  GRUPOS_GASTO.map((g) => [g.id, g.nombre]),
);

/** Del 1 al 5 son costos de operar el salón. El 6 va bajo la línea. */
export function esOperativo(grupo: number | null | undefined): boolean {
  return grupo != null && grupo >= 1 && grupo <= 5;
}

export function etiquetaGrupo(grupo: number | null | undefined): string {
  if (grupo == null) return "Sin clasificar";
  return `${grupo} · ${GRUPO_NOMBRE[grupo] ?? "Sin clasificar"}`;
}
