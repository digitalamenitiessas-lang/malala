import { tryNormalizarTelefonoAR } from "@/lib/phone";

/**
 * Qué clientas repetidas se pueden unir sin preguntar.
 *
 * Pedido de Yerba Buena el 19/11/2026: "se están duplicando los clientes. En
 * un cliente se pone +549 y en el otro no y te deja sumarlo". Muchas venían
 * repetidas de AppSheet. Las une scripts/unir-clientes-duplicadas.ts.
 *
 * El mismo teléfono NO alcanza: hay familias que comparten número (Delfina y
 * Emilia Leal Reyes, Ana Inés y Faustina Terán), y unirlas mezcla ventas y
 * cuenta corriente de personas distintas. Se une solo cuando además el nombre
 * es el mismo escrito de otra forma:
 *
 * - Mismo teléfono (normalizado: "381 15 4154820" = "+5493814154820") y cada
 *   palabra del nombre más corto aparece en el otro, con tolerancia a
 *   acentos, orden, diminutivos por prefijo y una letra de diferencia:
 *   "Meli Tré" = "Meli Tre", "Agus Cejas" = "Agustina Cejas",
 *   "Lourdes" = "Lourdes Perez Morales".
 * - Sin teléfono en común: exactamente el mismo nombre (dos palabras o más) y
 *   sin teléfonos que se contradigan.
 *
 * Lo demás queda como "dudoso", para preguntarle al salón.
 */

export interface ClienteParaUnir {
  id: string;
  nombre: string;
  telefono?: string | null;
  telefono_e164?: string | null;
  ventas: number;
}

export interface GrupoAUnir<T extends ClienteParaUnir> {
  motivo: "telefono" | "nombre";
  /** La que queda: la de más ventas. */
  queda: T;
  unir: T[];
}

export interface PlanDuplicadas<T extends ClienteParaUnir> {
  unir: GrupoAUnir<T>[];
  /** Mismo teléfono y nombres distintos: no se tocan. */
  dudosos: Array<{ telefono: string; clientes: T[] }>;
}

export function claveTelefono(c: Pick<ClienteParaUnir, "telefono" | "telefono_e164">): string | null {
  return tryNormalizarTelefonoAR(c.telefono) ?? c.telefono_e164 ?? null;
}

export function palabras(nombre: string): string[] {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Distancia de edición contando el cambio de dos letras vecinas como una. */
function distancia(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
  // "Elisa H" = "Elisa Hauad": una inicial cuenta como la palabra.
  if ((corta.length === 1 || corta.length >= 3) && larga.startsWith(corta)) return true;
  return corta.length >= 3 && a[0] === b[0] && distancia(a, b) <= 1;
}

/** Cada palabra del nombre más corto está en el otro. */
export function nombresCompatibles(a: string, b: string): boolean {
  const pa = palabras(a);
  const pb = palabras(b);
  if (pa.length === 0 || pb.length === 0) return false;
  const [corto, largo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const usadas = new Set<number>();
  return corto.every((p) => {
    const i = largo.findIndex((q, idx) => !usadas.has(idx) && mismaPalabra(p, q));
    if (i < 0) return false;
    usadas.add(i);
    return true;
  });
}

function nombreExacto(nombre: string): string | null {
  const p = palabras(nombre);
  return p.length >= 2 ? [...p].sort().join(" ") : null;
}

function elegirQueda<T extends ClienteParaUnir>(grupo: T[]): GrupoAUnir<T>["queda"] {
  return [...grupo].sort(
    (a, b) =>
      b.ventas - a.ventas ||
      Number(!!b.telefono_e164) - Number(!!a.telefono_e164) ||
      b.nombre.length - a.nombre.length ||
      a.id.localeCompare(b.id),
  )[0];
}

/** Junta en grupos a los que están conectados por `iguales` (transitivo). */
function agrupar<T>(items: T[], iguales: (a: T, b: T) => boolean): T[][] {
  const padre = items.map((_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (iguales(items[i], items[j])) padre[raiz(i)] = raiz(j);
    }
  }
  const grupos = new Map<number, T[]>();
  items.forEach((it, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), it]));
  return [...grupos.values()];
}

export function planDuplicadas<T extends ClienteParaUnir>(clientes: T[]): PlanDuplicadas<T> {
  const plan: PlanDuplicadas<T> = { unir: [], dudosos: [] };
  // Las que se van (absorbidas) y el grupo de cada una que queda.
  const absorbidas = new Set<string>();
  const grupoDe = new Map<string, GrupoAUnir<T>>();
  const agregar = (motivo: GrupoAUnir<T>["motivo"], grupo: T[]) => {
    const queda = elegirQueda(grupo);
    const nuevo = { motivo, queda, unir: grupo.filter((c) => c.id !== queda.id) };
    plan.unir.push(nuevo);
    grupoDe.set(queda.id, nuevo);
    nuevo.unir.forEach((c) => absorbidas.add(c.id));
  };

  const porTelefono = new Map<string, T[]>();
  for (const c of clientes) {
    const tel = claveTelefono(c);
    if (tel) porTelefono.set(tel, [...(porTelefono.get(tel) ?? []), c]);
  }
  for (const [telefono, lista] of porTelefono) {
    if (lista.length < 2) continue;
    const grupos = agrupar(lista, (a, b) => nombresCompatibles(a.nombre, b.nombre));
    for (const g of grupos) if (g.length > 1) agregar("telefono", g);
    if (grupos.length > 1) plan.dudosos.push({ telefono, clientes: lista });
  }

  // Mismo nombre exacto, sin teléfonos que se contradigan. La que ya queda de
  // un grupo por teléfono participa: si aparece otra ficha suya sin número
  // ("Jo Viscido" sin teléfono), se suma a ese grupo en vez de quedar suelta.
  const porNombre = new Map<string, T[]>();
  for (const c of clientes) {
    if (absorbidas.has(c.id)) continue;
    const n = nombreExacto(c.nombre);
    if (n) porNombre.set(n, [...(porNombre.get(n) ?? []), c]);
  }
  for (const lista of porNombre.values()) {
    if (lista.length < 2) continue;
    const telefonos = new Set(lista.map(claveTelefono).filter(Boolean));
    if (telefonos.size > 1) continue;
    const existentes = lista.filter((c) => grupoDe.has(c.id));
    if (existentes.length === 0) agregar("nombre", lista);
    else if (existentes.length === 1) {
      const grupo = grupoDe.get(existentes[0].id)!;
      for (const c of lista) {
        if (c.id !== grupo.queda.id) {
          grupo.unir.push(c);
          absorbidas.add(c.id);
        }
      }
    }
  }
  return plan;
}
