/**
 * Carga las recetas de Malala Centro desde la planilla del salon.
 *
 * Solo carga las prestaciones cuyo nombre coincide EXACTAMENTE con una del
 * catalogo de Centro. Las demas no se tocan: la planilla trae el catalogo
 * desagregado por nivel ("Color global 1/2/3/4") y la base tiene todavia la
 * version de la lista de precios ("Color Global", uno solo). Adivinar que nivel
 * corresponde seria inventar el costo de un servicio.
 *
 * Idempotente por (sucursal, servicio, insumo).
 *
 * Uso: npx tsx scripts/import-centro-recetas.ts [--aplicar]
 */
import "../envConfig";
import { readFileSync } from "node:fs";
import { getSqlClient } from "../src/lib/db/client/postgres";

const CE = "seed-000001";
const APLICAR = process.argv.includes("--aplicar");

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
   .replace(/[^a-z0-9]+/g, " ").trim();

/**
 * La planilla marca en "Estado" como se armo cada receta. Las que dicen
 * ESTIMADA o extrapolada no salen de una medicion real, asi que entran como
 * propuesta (confirmada=false): cuentan para el costo pero quedan marcadas en
 * pantalla para que el salon las revise.
 */
function esPropuesta(estado: string): boolean {
  return /estimada|extrapolada/i.test(estado ?? "");
}

async function main() {
  const sql = getSqlClient();
  const plan = JSON.parse(readFileSync("scripts/data/centro-planilla.json", "utf8"));

  const servicios = await sql`select sv.id, sv.nombre from servicios sv
    join servicio_sucursal ss on ss.servicio_id=sv.id where ss.sucursal_id=${CE}`;
  const servicioPorNombre = new Map((servicios as any[]).map((s) => [norm(s.nombre), s]));

  const insumos = await sql`select id, nombre from insumos where sucursal_id=${CE}`;
  const insumoPorNombre = new Map((insumos as any[]).map((i) => [norm(i.nombre), i]));

  const lineas: Array<{ servicioId: string; insumoId: string; cantidad: number; confirmada: boolean; ref: string }> = [];
  const porClave = new Map<string, { servicioId: string; insumoId: string; cantidad: number; confirmada: boolean; ref: string }>();
  const sinServicio: string[] = [];
  const sinInsumo = new Set<string>();

  for (const r of plan.recetas) {
    const sv = servicioPorNombre.get(norm(r.servicio));
    if (!sv) { sinServicio.push(`${r.codigo} ${r.servicio}`); continue; }
    for (const it of r.items) {
      const ins = insumoPorNombre.get(norm(it.insumo));
      if (!ins) { sinInsumo.add(it.insumo); continue; }
      if (!(it.cantidad > 0)) continue;
      // El mismo insumo puede aparecer dos veces en una receta: en los
      // combos, el oxidante va una vez con el decolorante y otra con la
      // tintura. Son dos usos del mismo frasco, asi que se suman. La receta
      // guarda una linea por insumo, y sin sumar se perdia el primer uso.
      const clave = `${sv.id}|${ins.id}`;
      const ya = porClave.get(clave);
      if (ya) {
        ya.cantidad += it.cantidad;
        continue;
      }
      const linea = {
        servicioId: sv.id, insumoId: ins.id, cantidad: it.cantidad,
        confirmada: !esPropuesta(r.estado), ref: `${r.servicio} -> ${it.insumo}`,
      };
      porClave.set(clave, linea);
      lineas.push(linea);
    }
  }

  console.log(`Prestaciones de la planilla que existen en Centro: ${plan.recetas.length - sinServicio.length} de ${plan.recetas.length}`);
  console.log(`Lineas de receta a cargar: ${lineas.length}`);
  console.log(`  (de las cuales ${lineas.filter((l) => !l.confirmada).length} entran como propuesta a revisar)`);
  if (sinInsumo.size) {
    console.log(`\nInsumos de receta que no existen en el catalogo de Centro (${sinInsumo.size}):`);
    for (const s of sinInsumo) console.log("   " + s);
  }
  console.log(`\nPrestaciones de la planilla que NO estan en el catalogo de Centro: ${sinServicio.length} (no se tocan)`);

  if (!APLICAR) {
    console.log("\n-- SIMULACION. Correr con --aplicar para escribir. --");
    process.exit(0);
  }

  let creadas = 0, actualizadas = 0;
  await sql.begin(async (tx) => {
    for (const l of lineas) {
      const [existe] = await tx`select id from recetas
        where sucursal_id=${CE} and servicio_id=${l.servicioId} and insumo_id=${l.insumoId}`;
      if (existe) {
        await tx`update recetas set cantidad=${l.cantidad}, confirmada=${l.confirmada}
          where id=${(existe as any).id}`;
        actualizadas++;
      } else {
        await tx`insert into recetas (id, sucursal_id, servicio_id, insumo_id, cantidad, confirmada)
          values (${crypto.randomUUID()}, ${CE}, ${l.servicioId}, ${l.insumoId}, ${l.cantidad}, ${l.confirmada})`;
        creadas++;
      }
    }
  });
  console.log(`\nCreadas: ${creadas} · Actualizadas: ${actualizadas}`);
  console.table(await sql`select count(distinct servicio_id)::int as servicios_con_receta,
    count(*)::int as lineas from recetas where sucursal_id=${CE}`);
  process.exit(0);
}
main();
