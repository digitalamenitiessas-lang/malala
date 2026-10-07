import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Red de seguridad contra interpolaciones comidas.
 *
 * Editando estos archivos con herramientas de shell se me comieron cinco veces
 * los `${...}` de un template literal. Una llegó a producción como
 * `new Date(\`T12:00:00Z\`)` y tiró abajo liquidaciones; otra salió como
 * "La caja del  ya esta cerrada" y dejó a Yerba Buena sin poder cargar una
 * venta del 29/09, porque el mensaje no decía de qué día hablaba.
 *
 * Cuando se come un `${expr}` quedan pegados los dos espacios que lo rodeaban.
 * Ese doble espacio adentro de un backtick es la firma del daño, y hoy no hay
 * ni un caso legítimo en todo src/ — así que sirve de alarma.
 */

const RAIZ = join(process.cwd(), "src");
const EXT = /\.(ts|tsx)$/;
// Un template literal completo, sin backticks adentro.
const TEMPLATE = /`[^`\\]*`/g;

function archivosFuente(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivosFuente(ruta);
    return EXT.test(e.name) ? [ruta] : [];
  });
}

describe("template literals", () => {
  it("no tienen dobles espacios, que delatan un ${...} comido", () => {
    const sospechosos: string[] = [];

    for (const ruta of archivosFuente(RAIZ)) {
      if (ruta.endsWith("mensajes-interpolados.test.ts")) continue;
      const fuente = readFileSync(ruta, "utf8");

      fuente.split("\n").forEach((linea, i) => {
        for (const lit of linea.match(TEMPLATE) ?? []) {
          // Sólo texto para leer: un literal de clases CSS o de SQL puede
          // alinearse con espacios a propósito.
          if (lit.includes("  ") && !lit.includes("\n")) {
            sospechosos.push(`${ruta}:${i + 1} → ${lit}`);
          }
        }
      });
    }

    expect(sospechosos).toEqual([]);
  });
});
