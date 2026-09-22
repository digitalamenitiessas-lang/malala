/**
 * Carga los insumos de bacha y los productos de reventa de Malala Centro desde
 * la planilla que armo el salon (scripts/data/centro-planilla.json).
 *
 * Idempotente: identifica por el codigo de la planilla dentro de la sucursal,
 * asi que correrlo dos veces actualiza en vez de duplicar.
 *
 * NO carga stock (queda en 0, lo cargan ellas con el recuento) ni recetas (ver
 * scripts/import-centro-recetas.ts y la nota de catalogo en el informe).
 *
 * Uso: npx tsx scripts/import-centro-insumos.ts [--aplicar]
 */
import "../envConfig";
import { readFileSync } from "node:fs";
import { getSqlClient } from "../src/lib/db/client/postgres";

const CE = "seed-000001";
const APLICAR = process.argv.includes("--aplicar");

interface FilaInsumo {
  codigo: string;
  nombre: string;
  um: string;
  proveedor: string;
  contenido: string;
  precioFrasco: number | null;
  precioUnitario: number | null;
}

/**
 * La planilla usa unidades que el sistema no tiene como tales. El enum solo
 * acepta ud/ml/g/aplicacion, asi que se mapea a la mas cercana. El calculo del
 * costo no cambia (es cantidad x precio unitario); lo unico que cambia es la
 * etiqueta que se ve en pantalla.
 */
function unidad(um: string): "ud" | "ml" | "g" | "aplicacion" {
  const u = um.trim().toLowerCase();
  if (u === "ml") return "ml";
  if (u === "g" || u === "gr" || u === "grs") return "g";
  if (u === "disparos" || u === "aplicacion") return "aplicacion";
  // "m" (metros de papel film) y todo lo demas se cuenta por unidad.
  return "ud";
}

/** "900 ml", "60 gr", "100 ud", "1000 g (estimado, ...)" -> 900 */
function contenidoNumerico(texto: string): number | null {
  const m = String(texto ?? "").match(/([\d.,]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Envase y precio de envase a partir de lo que trae la planilla.
 *
 * Varios insumos vienen solo con el precio unitario (los compran sueltos o el
 * salon todavia no cargo el envase). Para esos el envase es 1: el precio
 * unitario sigue siendo el mismo y la receta calcula igual, en vez de quedar
 * el insumo afuera por no tener un dato que nadie tiene.
 */
function envase(f: FilaInsumo): { tamano: number; precio: number; unitario: number } | null {
  const cont = contenidoNumerico(f.contenido);
  if (cont && f.precioFrasco && f.precioFrasco > 0) {
    return { tamano: cont, precio: f.precioFrasco, unitario: f.precioFrasco / cont };
  }
  if (f.precioUnitario && f.precioUnitario > 0) {
    return { tamano: 1, precio: f.precioUnitario, unitario: f.precioUnitario };
  }
  return null;
}

async function main() {
  const sql = getSqlClient();
  const plan = JSON.parse(readFileSync("scripts/data/centro-planilla.json", "utf8"));

  const items: Array<{ f: FilaInsumo; tipo: "bacha" | "venta" }> = [
    ...plan.insumos.map((f: FilaInsumo) => ({ f, tipo: "bacha" as const })),
    ...plan.reventa.map((f: FilaInsumo) => ({ f, tipo: "venta" as const })),
  ];

  const sinPrecio: string[] = [];
  const preparados: Array<Record<string, unknown>> = [];
  for (const { f, tipo } of items) {
    const e = envase(f);
    if (!e) { sinPrecio.push(`${f.codigo} ${f.nombre}`); continue; }
    preparados.push({
      codigo: f.codigo,
      nombre: f.nombre,
      unidad: unidad(f.um),
      tamano: e.tamano,
      precioEnvase: Math.round(e.precio * 100) / 100,
      precioUnitario: Math.round(e.unitario * 100) / 100,
      tipo,
      proveedor: f.proveedor,
    });
  }

  console.log(`A cargar: ${preparados.length} (${preparados.filter((p) => p.tipo === "bacha").length} de bacha, ${preparados.filter((p) => p.tipo === "venta").length} de reventa)`);
  if (sinPrecio.length) {
    console.log(`\nSIN PRECIO, no se cargan (${sinPrecio.length}):`);
    for (const s of sinPrecio) console.log("   " + s);
  }

  if (!APLICAR) {
    console.log("\n-- SIMULACION. Muestra de lo que se cargaria: --");
    console.table(preparados.slice(0, 8));
    console.log("\nCorrer con --aplicar para escribir en la base.");
    process.exit(0);
  }

  let creados = 0, actualizados = 0;
  await sql.begin(async (tx) => {
    for (const p of preparados) {
      const [existe] = await tx`select id from insumos
        where sucursal_id=${CE} and codigo=${p.codigo as string}`;
      if (existe) {
        await tx`update insumos set
          nombre=${p.nombre as string}, unidad_medida=${p.unidad as string}::unidad_medida,
          tamano_envase=${p.tamano as number}, precio_envase=${p.precioEnvase as number},
          precio_unitario=${p.precioUnitario as number},
          tipo=${p.tipo as string}::insumo_tipo, vendible=${p.tipo === "venta"},
          activo=true
          where id=${(existe as any).id}`;
        actualizados++;
      } else {
        await tx`insert into insumos
          (id, sucursal_id, nombre, codigo, unidad_medida, tamano_envase, precio_envase,
           precio_unitario, umbral_stock_bajo, activo, tipo, vendible, precio_venta)
          values (${crypto.randomUUID()}, ${CE}, ${p.nombre as string}, ${p.codigo as string},
            ${p.unidad as string}::unidad_medida, ${p.tamano as number}, ${p.precioEnvase as number},
            ${p.precioUnitario as number}, 0, true, ${p.tipo as string}::insumo_tipo,
            ${p.tipo === "venta"}, null)`;
        creados++;
      }
    }
  });

  console.log(`\nCreados: ${creados} · Actualizados: ${actualizados}`);
  console.table(await sql`select tipo, count(*)::int as n from insumos
    where sucursal_id=${CE} group by tipo`);
  process.exit(0);
}
main();
