/**
 * Repara la gift card GC-0193, emitida con "lo que pagan" vacio.
 *
 * El schema convertia el string vacio en 0, asi que la venta de $40.000
 * registro $0 entrando a Caja Efectivo. El salon conto $40.000 de menos en el
 * arqueo del 08/10 sin que nada lo avisara.
 *
 * Deja cobrado en NULL (que es "se cobro el importe") y lleva el movimiento
 * bancario al monto real. No crea un movimiento nuevo: corrige el que existe,
 * para no duplicar el ingreso.
 *
 * Uso: npx tsx scripts/corregir-gc0193.ts [--aplicar]
 */
import "../envConfig";
import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client/postgres";

async function main() {
  const db = getDb();
  const aplicar = process.argv.includes("--aplicar");

  const [gc] = (await db.execute(sql`
    select id, codigo, importe, cobrado, sucursal_id
    from gift_cards where codigo = 'GC-0193'
  `)) as any[];
  if (!gc) {
    console.log("No existe GC-0193.");
    process.exit(1);
  }
  console.log(`GC-0193  importe=${Number(gc.importe)}  cobrado=${gc.cobrado === null ? "NULL" : Number(gc.cobrado)}`);

  const movs = (await db.execute(sql`
    select id, monto, cuenta_id, tipo, ref_tipo
    from movimientos_bancarios
    where ref_tipo = 'gift_card_venta' and ref_id = ${gc.id}
  `)) as any[];
  console.log(`movimientos asociados: ${movs.length}`);
  for (const m of movs) console.log(`   ${m.tipo} ${Number(m.monto)}  cuenta=${m.cuenta_id}`);

  // Un impuesto automatico se habria calculado sobre 0; si la cuenta tuviera
  // impuestos, corregir el monto a mano los dejaria mal.
  const imp = (await db.execute(sql`
    select count(*) as n from cuenta_impuestos ci
    where ci.activo = true and ci.cuenta_id in (
      select cuenta_id from movimientos_bancarios
      where ref_tipo='gift_card_venta' and ref_id=${gc.id}
    )
  `)) as any[];
  console.log(`impuestos activos en esa cuenta: ${imp[0].n}`);
  if (Number(imp[0].n) > 0) {
    console.log("La cuenta tiene impuestos: hay que recalcularlos a mano. Freno.");
    process.exit(1);
  }

  if (Number(gc.cobrado) !== 0 || movs.length !== 1 || Number(movs[0].monto) !== 0) {
    console.log("\nEl estado no es el esperado (cobrado=0 y un movimiento en 0). Freno.");
    process.exit(1);
  }

  console.log(`\nCorreccion: cobrado 0 -> NULL, movimiento 0 -> ${Number(gc.importe)}`);
  if (!aplicar) {
    console.log("(simulacion, nada se escribio. Agregar --aplicar)");
    process.exit(0);
  }

  await db.execute(sql`update gift_cards set cobrado = null where id = ${gc.id}`);
  await db.execute(sql`
    update movimientos_bancarios set monto = ${Number(gc.importe)}
    where id = ${movs[0].id}
  `);
  console.log("✔ Corregido.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
