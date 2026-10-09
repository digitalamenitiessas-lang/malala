/**
 * Lleva cada ajuste de apertura al dia de SU caja.
 *
 * Abrir un dia pasado emitia el ajuste con la fecha del momento, asi que la
 * correccion de un dia viejo caia en la caja de hoy. Centro abrio el 07/10
 * durante el 08/10 y su ajuste de -$146.700 se fue al efectivo del 08, que
 * quedo esperando -$27.100.
 *
 * Uso: npx tsx scripts/corregir-ajustes-apertura.ts [--aplicar]
 */
import "../envConfig";
import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client/postgres";

async function main() {
  const db = getDb();
  const aplicar = process.argv.includes("--aplicar");

  const malos = (await db.execute(sql`
    select mb.id, mb.monto, a.fecha as dia_caja, s.nombre as suc, c.nombre as cuenta,
           to_char(mb.fecha at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI') as esta_en
    from movimientos_bancarios mb
    join aperturas_caja a on a.id = mb.ref_id
    join sucursales s on s.id = a.sucursal_id
    join cuentas_bancarias c on c.id = mb.cuenta_id
    where mb.ref_tipo = 'apertura'
      and (mb.fecha at time zone 'America/Argentina/Buenos_Aires')::date <> a.fecha::date
    order by a.fecha
  `)) as any[];

  if (malos.length === 0) { console.log("✔ Todos los ajustes estan en el dia de su caja."); return; }

  console.log(`=== ${malos.length} ajuste(s) en el dia equivocado ===`);
  for (const m of malos) {
    console.log(`  ${String(m.suc).padEnd(20)} ${String(m.cuenta).padEnd(16)} ${String(Number(m.monto)).padStart(11)}  esta en ${m.esta_en}  -> deberia estar en ${m.dia_caja}`);
  }

  if (!aplicar) { console.log("\n(simulacion, nada se escribio. Agregar --aplicar)"); return; }

  for (const m of malos) {
    await db.execute(sql`
      update movimientos_bancarios
         set fecha = (${m.dia_caja} || ' 12:00:00-03:00')::timestamptz
       where id = ${m.id}
    `);
  }
  console.log(`\n✔ ${malos.length} ajuste(s) movido(s) al dia de su caja.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
