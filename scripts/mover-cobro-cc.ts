/**
 * Mueve un cobro de cuenta corriente al dia en que la plata entro de verdad.
 *
 * El cobro de $144.000 de Carolina Prieto se registro el 07/10, se revirtio de
 * madrugada y se volvio a cargar el 08/10, cuando el formulario todavia no
 * tenia campo de fecha. La plata quedo contada en el dia equivocado: el 07/10
 * cerro con sobrante y el 08/10 espera de mas.
 *
 * Mueve el asiento de cuenta corriente y su movimiento bancario a la fecha
 * real. No toca los cierres ya firmados, que son una foto de lo que se conto
 * esa noche: lo que cambia es el calculo de los dias que siguen.
 *
 * Uso: npx tsx scripts/mover-cobro-cc.ts <movimientoId> <YYYY-MM-DD> [--aplicar]
 */
import "../envConfig";
import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client/postgres";

async function main() {
  const db = getDb();
  const movId = process.argv[2];
  const ymd = process.argv[3];
  const aplicar = process.argv.includes("--aplicar");

  if (!movId || !/^\d{4}-\d{2}-\d{2}$/.test(ymd ?? "")) {
    console.log("Uso: npx tsx scripts/mover-cobro-cc.ts <movimientoId> <YYYY-MM-DD> [--aplicar]");
    process.exit(1);
  }

  const [mov] = (await db.execute(sql`
    select m.id, m.cliente_id, m.fecha, m.tipo, m.monto, m.sucursal_id, c.nombre
    from movimientos_cc m join clientes c on c.id = m.cliente_id
    where m.id = ${movId}
  `)) as any[];
  if (!mov) { console.log("No existe ese movimiento."); process.exit(1); }

  console.log(`Movimiento: ${mov.nombre}  ${mov.tipo}  $${Number(mov.monto)}`);
  console.log(`  fecha actual: ${mov.fecha}`);

  const bancarios = (await db.execute(sql`
    select id, monto, tipo, ref_tipo, fecha from movimientos_bancarios
    where ref_tipo in ('cc_pago','impuesto') and ref_id = ${mov.cliente_id}
      and fecha = ${mov.fecha}
  `)) as any[];
  console.log(`  movimientos bancarios en ese instante: ${bancarios.length}`);
  for (const b of bancarios) console.log(`     ${b.ref_tipo} ${b.tipo} ${Number(b.monto)}`);

  if (bancarios.length === 0) {
    console.log("\nSin movimiento bancario asociado: no hay nada que mover en caja. Freno.");
    process.exit(1);
  }

  const nueva = `${ymd} 12:00:00-03:00`;
  console.log(`\n  fecha nueva:  ${nueva}  (mediodia argentino)`);

  if (!aplicar) {
    console.log("(simulacion, nada se escribio. Agregar --aplicar)");
    process.exit(0);
  }

  await db.execute(sql`update movimientos_cc set fecha = ${nueva}::timestamptz where id = ${mov.id}`);
  for (const b of bancarios) {
    await db.execute(sql`update movimientos_bancarios set fecha = ${nueva}::timestamptz where id = ${b.id}`);
  }
  console.log("✔ Movido.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
