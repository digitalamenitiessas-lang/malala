/**
 * Solo lectura: el desglose guardado de una liquidacion.
 *
 * Uso: npx tsx scripts/ver-liquidacion-detalle.ts Camila 2026-10-04 2026-10-10
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const nombre = process.argv[2] ?? "Camila";
const desde = process.argv[3] ?? "2026-10-04";
const hasta = process.argv[4] ?? "2026-10-10";
const sql = postgres(url, { max: 1, prepare: false });

const $ = (n: unknown) => `$${Number(n ?? 0).toLocaleString("es-AR")}`;

async function main() {
  const rows = await sql`
    select l.*, e.nombre
    from liquidaciones l
    join empleados e on e.id = l.empleado_id
    where e.nombre ilike ${"%" + nombre + "%"}
      and l.periodo_desde >= ${desde}::date
      and l.periodo_hasta <= ${hasta}::date
    order by l.periodo_desde
  `;

  for (const r of rows) {
    console.log(`\n${r.nombre} · ${r.periodo_desde} a ${r.periodo_hasta} · ${r.estado}`);
    console.log(`  comisiones          ${$(r.total_comision)}`);
    console.log(`  horas ${r.horas_trabajadas} x ${$(r.valor_hora)}  = ${$(r.sueldo_horas)}`);
    console.log(`  sueldo basico       ${$(r.sueldo_basico)}`);
    console.log(`  viatico del periodo ${$(r.total_viatico)}`);
    console.log(`  anticipos          -${$(r.total_anticipos)}`);
    console.log(`  arrastre            ${$(r.arrastre)}`);
    console.log(`  --------------------------------`);
    console.log(`  TOTAL A PAGAR       ${$(r.total_pagar)}`);
    console.log(`  total pagado        ${r.total_pagado == null ? "(se pago todo)" : $(r.total_pagado)}`);
  }

  await sql.end();
}

main();
