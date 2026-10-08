/**
 * Corrige lo CONTADO de una cuenta en un cierre ya firmado.
 *
 * El cierre del 07/10 de Yerba Buena se rehizo el 08/10 18:42 y quedo con las
 * cifras de hoy en lugar de las de ayer: $587.900 de efectivo, que es lo que
 * el sistema mostraba hoy. Elu confirmo que en el cajon habia $271.200, que
 * ademas coincide exacto con lo declarado al abrir el 08/10.
 *
 * Toca solo saldo_contado: el esperado es el calculo del sistema y no se
 * reescribe, asi la diferencia del arqueo sigue contando lo que paso.
 *
 * Uso: npx tsx scripts/corregir-contado-cierre.ts <fecha> <cuenta> <monto> [--aplicar]
 */
import "../envConfig";
import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client/postgres";

async function main() {
  const db = getDb();
  const [fecha, cuentaLike, montoRaw] = process.argv.slice(2);
  const aplicar = process.argv.includes("--aplicar");
  const monto = Number(montoRaw);

  if (!fecha || !cuentaLike || !Number.isFinite(monto)) {
    console.log('Uso: npx tsx scripts/corregir-contado-cierre.ts 2026-10-07 efectivo 271200 [--aplicar]');
    process.exit(1);
  }

  const filas = (await db.execute(sql`
    select cc.id, c.nombre as cuenta, cc.saldo_esperado, cc.saldo_contado
    from cierres_caja ci
    join cierre_caja_cuentas cc on cc.cierre_id = ci.id
    join cuentas_bancarias c on c.id = cc.cuenta_id
    where ci.sucursal_id = 'seed-000002' and ci.fecha = ${fecha}
      and c.nombre ilike ${"%" + cuentaLike + "%"}
  `)) as any[];

  if (filas.length !== 1) {
    console.log(`Esperaba una sola cuenta y encontre ${filas.length}. Freno.`);
    for (const f of filas) console.log(`   ${f.cuenta}`);
    process.exit(1);
  }

  const f = filas[0];
  console.log(`Cierre ${fecha} · ${f.cuenta}`);
  console.log(`  esperado (calculo del sistema): ${Number(f.saldo_esperado)}`);
  console.log(`  contado actual:                 ${Number(f.saldo_contado)}`);
  console.log(`  contado nuevo:                  ${monto}`);
  console.log(`  diferencia del arqueo pasa a:   ${monto - Number(f.saldo_esperado)}`);

  if (!aplicar) { console.log("\n(simulacion, nada se escribio. Agregar --aplicar)"); process.exit(0); }

  await db.execute(sql`update cierre_caja_cuentas set saldo_contado = ${monto} where id = ${f.id}`);
  console.log("\n✔ Corregido.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
