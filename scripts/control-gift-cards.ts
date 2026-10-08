/**
 * Control: toda gift card vendida tiene que haber hecho entrar su plata.
 *
 * Compara lo que la tarjeta dice que se cobro contra lo que entro de verdad a
 * la cuenta. Nacio de que cinco tarjetas de un dia registraron $0 y el salon
 * cerro con $312.000 de sobrante sin saber por que.
 *
 * Uso: npx tsx scripts/control-gift-cards.ts
 */
import "../envConfig";
import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client/postgres";

async function main() {
  const db = getDb();
  const filas = (await db.execute(sql`
    select g.codigo, s.nombre as sucursal, g.importe, g.cobrado, g.origen,
           to_char(g.fecha_emision at time zone 'America/Argentina/Buenos_Aires','DD/MM/YY') as emitida,
           coalesce(sum(mb.monto), 0) as entro,
           count(mb.id) as movimientos
    from gift_cards g
    join sucursales s on s.id = g.sucursal_id
    left join movimientos_bancarios mb
      on mb.ref_tipo = 'gift_card_venta' and mb.ref_id = g.id
    where g.origen = 'venta'
    group by g.id, g.codigo, s.nombre, g.importe, g.cobrado, g.origen, g.fecha_emision
    order by g.fecha_emision desc
  `)) as any[];

  const malas = filas.filter((f) => {
    const debioEntrar = f.cobrado === null ? Number(f.importe) : Number(f.cobrado);
    // Sin movimiento puede ser un medio sin cuenta asignada, que ya se avisa
    // aparte; lo que no puede pasar es que haya movimiento y no coincida.
    return Number(f.movimientos) > 0 && Math.abs(Number(f.entro) - debioEntrar) > 0.01;
  });

  console.log(`Gift cards vendidas: ${filas.length}`);
  if (malas.length === 0) {
    console.log("✔ Todas hicieron entrar exactamente lo que dicen haber cobrado.");
    return;
  }
  console.log(`\n✘ ${malas.length} con la plata mal registrada:`);
  for (const f of malas) {
    const debio = f.cobrado === null ? Number(f.importe) : Number(f.cobrado);
    console.log(`  ${f.emitida}  ${String(f.codigo).padEnd(14)} ${String(f.sucursal).padEnd(20)} debio entrar ${debio}, entro ${Number(f.entro)}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
