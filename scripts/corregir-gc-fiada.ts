/**
 * Corrige el monto de una gift card fiada y el cargo que genero.
 *
 * GC-0183 se emitio por $84.000 a la cuenta de Belen Bobba, pero se vendio con
 * descuento y ella paga $63.000. El descuento no quedo guardado, asi que el
 * sistema cargo el importe completo.
 *
 * Uso: npx tsx scripts/corregir-gc-fiada.ts <codigo> <loQuePaga> [--aplicar]
 */
import "../envConfig";
import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client/postgres";

async function main() {
  const db = getDb();
  const [codigo, montoRaw] = process.argv.slice(2);
  const aplicar = process.argv.includes("--aplicar");
  const paga = Number(montoRaw);

  if (!codigo || !Number.isFinite(paga)) {
    console.log("Uso: npx tsx scripts/corregir-gc-fiada.ts GC-0183 63000 [--aplicar]");
    process.exit(1);
  }

  const [gc] = (await db.execute(sql`
    select id, codigo, importe, cobrado, compradora_cliente_id
    from gift_cards where codigo = ${codigo}
  `)) as any[];
  if (!gc) { console.log("No existe esa gift card."); process.exit(1); }

  const [mov] = (await db.execute(sql`
    select m.id, m.monto, c.nombre, c.saldo_cc, c.id as cliente_id
    from movimientos_cc m join clientes c on c.id = m.cliente_id
    where m.ref_tipo = 'gift_card' and m.ref_id = ${gc.id}
  `)) as any[];
  if (!mov) { console.log("Esa gift card no genero un cargo en cuenta corriente."); process.exit(1); }

  const delta = paga - Number(mov.monto);
  console.log(`Gift card ${gc.codigo}: vale ${Number(gc.importe)}, paga ${paga}`);
  console.log(`  cargo actual en la cuenta de ${mov.nombre}: ${Number(mov.monto)}`);
  console.log(`  pasa a:                                     ${paga}  (${delta})`);
  console.log(`  saldo de ${mov.nombre}: ${Number(mov.saldo_cc)} -> ${Number(mov.saldo_cc) + delta}`);

  if (!aplicar) { console.log("\n(simulacion, nada se escribio. Agregar --aplicar)"); process.exit(0); }

  await db.execute(sql`
    update gift_cards set cobrado = ${paga === Number(gc.importe) ? null : paga}
     where id = ${gc.id}
  `);
  await db.execute(sql`update movimientos_cc set monto = ${paga} where id = ${mov.id}`);
  await db.execute(sql`
    update clientes set saldo_cc = saldo_cc + ${delta} where id = ${mov.cliente_id}
  `);
  console.log("\n✔ Corregido.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
