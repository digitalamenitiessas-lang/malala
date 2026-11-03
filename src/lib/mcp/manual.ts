import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * El manual de uso que consulta la IA cuando preguntan "¿cómo hago…?".
 *
 * Vive en docs/manual/, un .md por tema, para que se pueda corregir sin tocar
 * código. Formato de cada archivo:
 *
 *   # Título
 *   palabras: clave, otra, sinónimo
 *   quién: encargada, dueño/admin
 *
 *   texto…
 *
 * Si un paso está mal acá, la IA lo va a repetir con toda seguridad: cualquier
 * cambio de pantalla que afecte un tema tiene que actualizar su archivo.
 */

export interface TemaManual {
  id: string;
  titulo: string;
  palabras: string[];
  quien: string;
  texto: string;
}

export function parsearTema(id: string, contenido: string): TemaManual {
  const lineas = contenido.replace(/\r\n/g, "\n").split("\n");
  let titulo = id;
  let palabras: string[] = [];
  let quien = "";
  const cuerpo: string[] = [];
  for (const linea of lineas) {
    if (titulo === id && /^#\s+/.test(linea)) {
      titulo = linea.replace(/^#\s+/, "").trim();
    } else if (!palabras.length && /^palabras:/i.test(linea)) {
      palabras = linea
        .replace(/^palabras:/i, "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
    } else if (!quien && /^qui[eé]n:/i.test(linea)) {
      quien = linea.replace(/^qui[eé]n:/i, "").trim();
    } else {
      cuerpo.push(linea);
    }
  }
  return { id, titulo, palabras, quien, texto: cuerpo.join("\n").trim() };
}

/** Sin tildes y en minúscula, para que "liquidación" encuentre "liquidacion". */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const VACIAS = new Set(
  "a al como con cual cuando de del el en es esta este hacer hago la las lo los me mi no para por que se si su un una y ya".split(
    " ",
  ),
);

function terminos(s: string): string[] {
  return normalizar(s)
    .split(/[^a-z0-9ñ]+/)
    .filter((t) => t.length > 2 && !VACIAS.has(t));
}

/**
 * Los temas que mejor responden una pregunta. Pesa más el título y las
 * palabras clave que el cuerpo; alcanza con que el término empiece igual
 * ("anul" encuentra "anular" y "anulada").
 */
export function buscarTemas(temas: TemaManual[], pregunta: string, max = 3): TemaManual[] {
  const buscados = terminos(pregunta);
  if (buscados.length === 0) return [];
  const puntaje = (tema: TemaManual) => {
    const titulo = terminos(tema.titulo);
    const claves = tema.palabras.flatMap(terminos);
    const cuerpo = terminos(tema.texto);
    const coincide = (lista: string[], t: string) =>
      lista.some((x) => x.startsWith(t.slice(0, 5)) || t.startsWith(x.slice(0, 5)));
    return buscados.reduce(
      (acc, t) =>
        acc +
        (coincide(titulo, t) ? 3 : 0) +
        (coincide(claves, t) ? 3 : 0) +
        (coincide(cuerpo, t) ? 1 : 0),
      0,
    );
  };
  // Hace falta pegarle al título o a las palabras clave (3 puntos): con una
  // palabra suelta del texto, "facturación electrónica AFIP" traía Reportes
  // por "Facturado" y la IA lo usaba para contestar algo que no existe.
  return temas
    .map((tema) => ({ tema, p: puntaje(tema) }))
    .filter((x) => x.p >= 3)
    .sort((a, b) => b.p - a.p)
    .slice(0, max)
    .map((x) => x.tema);
}

let cache: TemaManual[] | null = null;

export function cargarManual(): TemaManual[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const dir = path.join(process.cwd(), "docs", "manual");
  let archivos: string[] = [];
  try {
    archivos = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md");
  } catch {
    return [];
  }
  cache = archivos
    .sort()
    .map((f) => parsearTema(f.replace(/\.md$/, ""), readFileSync(path.join(dir, f), "utf8")));
  return cache;
}

/** Lo que devuelve la herramienta "ayuda". */
export function consultarManual(
  temas: TemaManual[],
  args: { tema?: string; buscar?: string },
): unknown {
  if (args.tema) {
    const tema = temas.find((t) => t.id === args.tema);
    if (tema) return tema;
    return { error: `No hay un tema "${args.tema}".`, temas: temas.map((t) => t.id) };
  }
  if (args.buscar) {
    const encontrados = buscarTemas(temas, args.buscar);
    // La búsqueda es por palabras: "factura electrónica" trae Gastos por las
    // facturas de proveedores. Quien decide si el tema responde es la IA.
    if (encontrados.length) {
      return {
        encontrados,
        aviso: "Son los temas más parecidos por palabras. Usalos solo si de verdad responden la pregunta; si ninguno la cubre, decilo y no inventes pasos.",
      };
    }
    return {
      encontrados: [],
      aviso: "El manual no tiene nada sobre eso. No inventes pasos: decilo, y si hace falta usá reportar_problema.",
      temas: temas.map((t) => ({ id: t.id, titulo: t.titulo })),
    };
  }
  return { temas: temas.map((t) => ({ id: t.id, titulo: t.titulo, palabras: t.palabras })) };
}
