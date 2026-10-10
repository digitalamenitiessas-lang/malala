/**
 * Corre el dia en que se descuenta un anticipo, sin tocar cuando salio la plata.
 *
 * Para los casos que el salon acuerda con la chica: "Carolina pide $250.000...
 * despues pide que sea recien el 24/10".
 *
 * Uso: npx tsx scripts/diferir-descuento-anticipo.ts <anticipoId> <YYYY-MM-DD> [--aplicar]
 */
import "../envConfig";
import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client/postgres";

async function main() {
  const db = getDb();
  const [id, ymd] = process.argv.slice(2);
  const aplicar = process.argv.includes("--aplicar");
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(ymd ?? "")) {
    console.log("Uso: npx tsx scripts/diferir-descuento-anticipo.ts <id> 2026-10-24 [--aplicar]");
    process.exit(1);
  }

  const [a] = (await db.execute(sql`
    select a.id, e.nombre, a.monto, a.fecha_descuento, a.liquidacion_id,
           to_char(a.fecha at time zone 'America/Argentina/Buenos_Aires','DD/MM') as entregado
    from anticipos a join empleados e on e.id = a.empleado_id
    where a.id = ${id}
  `)) as any[];
  if (!a) { console.log("No existe ese anticipo."); process.exit(1); }
  if (a.liquidacion_id) { console.log("Ya se descontó en una liquidación. Freno."); process.exit(1); }

  console.log(`${a.nombre}  $${Number(a.monto)}  entregado el ${a.entregado}`);
  console.log(`  se descuenta: ${a.fecha_descuento ?? "en su propia fecha"} -> ${ymd}`);

  if (!aplicar) { console.log("\n(simulacion, nada se escribio. Agregar --aplicar)"); process.exit(0); }
  await db.execute(sql`update anticipos set fecha_descuento = ${ymd}::date where id = ${id}`);
  console.log("\n✔ Listo.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
