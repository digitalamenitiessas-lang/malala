/**
 * Repara las gift cards emitidas con "lo que pagan" en cero.
 *
 * El campo es un CurrencyField y arranca en 0: no puede mandar vacio. El alta
 * tomaba ese 0 como cobro real y registraba $0 entrando a la caja. Pasa a ser
 * NULL ("se cobro el importe") y el movimiento bancario va al monto real.
 *
 * Solo toca las de origen 'venta' con cobrado = 0: una cortesia no se cobra y
 * tiene su propio origen.
 *
 * Uso: npx tsx scripts/corregir-gift-cards-cobrado-cero.ts [--aplicar]
 */
import "../envConfig";
import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client/postgres";

async function main() {
  const db = getDb();
  const aplicar = process.argv.includes("--aplicar");

  const gcs = (await db.execute(sql`
    select g.id, g.codigo, g.importe, s.nombre as sucursal,
           to_char(g.fecha_emision at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI') as emitida
    from gift_cards g join sucursales s on s.id = g.sucursal_id
    where g.origen = 'venta' and g.cobrado = 0
    order by g.fecha_emision
  `)) as any[];

  if (gcs.length === 0) { console.log("No hay gift cards con cobrado = 0."); process.exit(0); }

  console.log(`=== ${gcs.length} gift card(s) con cobrado = 0 ===`);
  let totalFaltante = 0;
  for (const g of gcs) {
    const movs = (await db.execute(sql`
      select mb.id, mb.monto, c.nombre as cuenta, c.tipo as tipo_cuenta
      from movimientos_bancarios mb join cuentas_bancarias c on c.id = mb.cuenta_id
      where mb.ref_tipo = 'gift_card_venta' and mb.ref_id = ${g.id}
    `)) as any[];
    const destino = movs.map((m) => `${m.cuenta} (${Number(m.monto)})`).join(", ") || "sin movimiento";
    console.log(`  ${g.emitida}  ${String(g.codigo).padEnd(14)} ${String(g.sucursal).padEnd(20)} importe=${Number(g.importe)}  -> ${destino}`);
    if (movs.length === 1 && Number(movs[0].monto) === 0) totalFaltante += Number(g.importe);
  }
  console.log(`\n  plata que no se conto: ${totalFaltante}`);

  if (!aplicar) { console.log("\n(simulacion, nada se escribio. Agregar --aplicar)"); process.exit(0); }

  for (const g of gcs) {
    const movs = (await db.execute(sql`
      select id, monto, cuenta_id from movimientos_bancarios
      where ref_tipo = 'gift_card_venta' and ref_id = ${g.id}
    `)) as any[];

    const [imp] = (await db.execute(sql`
      select count(*) as n from cuenta_impuestos
      where activo = true and cuenta_id in (
        select cuenta_id from movimientos_bancarios
        where ref_tipo='gift_card_venta' and ref_id=${g.id})
    `)) as any[];
    if (Number(imp.n) > 0) { console.log(`  ! ${g.codigo}: la cuenta tiene impuestos, se saltea`); continue; }

    await db.execute(sql`update gift_cards set cobrado = null where id = ${g.id}`);
    for (const m of movs) {
      if (Number(m.monto) !== 0) continue;
      await db.execute(sql`update movimientos_bancarios set monto = ${Number(g.importe)} where id = ${m.id}`);
    }
    console.log(`  ✔ ${g.codigo} corregida`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
