/**
 * Solo lectura: los egresos de un dia en una sucursal, con su rubro.
 *
 * Uso: npx tsx scripts/ver-egresos-dia.ts 2026-10-10 seed-000002
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const ymd = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const sucursalId = process.argv[3] ?? "seed-000002";
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const rows = await sql`
    select
      to_char(g.fecha at time zone 'America/Argentina/Buenos_Aires','HH24:MI') as hora,
      g.valor, g.observacion, concat_ws(' / ', r.rubro, r.subrubro) as rubro, mp.codigo as medio
    from egresos g
    left join rubros_gasto r on r.id = g.rubro_id
    left join medios_pago mp on mp.id = g.mp_id
    where g.sucursal_id = ${sucursalId}
      and to_char(g.fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') = ${ymd}
    order by g.fecha
  `;
  console.log(`Egresos ${ymd} · ${sucursalId}: ${rows.length}\n`);
  let total = 0;
  for (const r of rows) {
    total += Number(r.valor);
    console.log(
      `  ${r.hora} · $${Number(r.valor).toLocaleString("es-AR")} · ${r.rubro ?? "-"}` +
        ` · ${r.medio ?? "-"} · ${r.observacion ?? ""}`,
    );
  }
  console.log(`\n  TOTAL $${total.toLocaleString("es-AR")}`);
  await sql.end();
}

main();
