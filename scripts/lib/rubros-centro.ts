/**
 * El subrubro de las planillas de Malala Centro ES el rubro de Yerba Buena, con
 * otra grafia. Se mapea a la cadena exacta que ya usa YB para que el comparativo
 * por rubro ponga las dos sucursales en la misma fila: "Coloracion" y
 * "COLORACION" serian dos rubros distintos para el reporte.
 *
 * Vive en su propio modulo porque lo usan los dos scripts de carga del catalogo
 * (el de la planilla de costos y el de la lista de precios) y tienen que estar
 * de acuerdo: si cada uno tuviera su copia, un servicio cargado por uno y
 * actualizado por el otro podria terminar en dos rubros distintos.
 */
export const norm = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const RUBRO: Record<string, string> = {
  "Corte y peinado": "CORTE Y PEINADO",
  Lavados: "LAVADOS",
  "Tratamientos capilares": "TRATAMIENTOS CAPILARES",
  "Trabajos tecnicos": "TRABAJOS TECNICOS",
  Coloracion: "COLORACION",
  Combos: "COMBOS",
  Adicionales: "ADICIONALES",
  Nails: "NAILS",
  "Cejas y pestanas": "CEJAS Y PESTAÑAS",
  Facial: "FACIAL",
  Masajes: "MASAJES",
  // Sin equivalente en YB: rubro nuevo de Centro.
  "Alquiler de Gabinete": "ALQUILER DE GABINETE",
  "Gift Cards": "GIFT CARDS",
};

/** Indexado normalizado para no depender de tildes ni mayusculas. */
export const RUBRO_NORM = new Map(
  Object.entries(RUBRO).map(([k, v]) => [norm(k), v]),
);

/** Lanza si el subrubro no esta mapeado: es preferible a inventar un rubro. */
export function rubroDeSubrubro(subrubro: string, ref = ""): string {
  const r = RUBRO_NORM.get(norm(subrubro));
  if (!r) throw new Error(`Subrubro sin mapear: "${subrubro}"${ref ? ` (${ref})` : ""}`);
  return r;
}
