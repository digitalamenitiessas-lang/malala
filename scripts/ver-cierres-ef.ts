/**
 * Solo lectura: esperado vs contado en efectivo, cierre por cierre.
 *
 * La diferencia de un dia no siempre nace ese dia: se arrastra desde el
 * cierre en que alguien conto distinto de lo que el sistema esperaba y
 * nadie lo explico. Esto la busca hacia atras.
 *
 * Uso: npx tsx scripts/ver-cierres-ef.ts seed-000002 12
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const sucursalId = process.argv[2] ?? "seed-000002";
const limite = Number(process.argv[3] ?? 12);
const sql = postgres(url, { max: 1, prepare: false });

const $ = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("es-AR");

async function main() {
  const rows = await sql`
    select c.fecha, cc.saldo_esperado as esperado, cc.saldo_contado as contado
    from cierres_caja c
    join cierre_caja_cuentas cc on cc.cierre_id = c.id
    join cuentas_bancarias cu on cu.id = cc.cuenta_id
    where c.sucursal_id = ${sucursalId} and cu.tipo = 'efectivo'
    order by c.fecha desc
    limit ${limite}
  `;

  console.log(`\nCierres de efectivo · ${sucursalId}\n`);
  console.log(`  fecha        esperado        contado      diferencia`);
  console.log(`  ---------------------------------------------------`);
  for (const r of rows.reverse()) {
    const esp = Number(r.esperado);
    const con = Number(r.contado);
    const dif = con - esp;
    const marca = Math.abs(dif) < 0.01 ? "" : "  <--";
    console.log(
      `  ${r.fecha}  ${$(esp).padStart(13)}  ${$(con).padStart(13)}  ${$(dif).padStart(12)}${marca}`,
    );
  }
  await sql.end();
}

main();
