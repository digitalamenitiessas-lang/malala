/**
 * Solo lectura: el efectivo de un dia, movimiento por movimiento, con saldo
 * corriendo. Es el mismo recorrido que hace una encargada con el cajon.
 *
 * Sirve para encontrar DONDE aparece una diferencia, no solo cuanta es: el
 * salon la nota al final del turno y para entonces ya hay cincuenta
 * movimientos encima.
 *
 * Uso: npx tsx scripts/ver-efectivo-dia.ts 2026-10-10 seed-000002
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const ymd = process.argv[2] ?? "2026-10-10";
const sucursalId = process.argv[3] ?? "seed-000002";
const sql = postgres(url, { max: 1, prepare: false });

const $ = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("es-AR");

async function main() {
  // La cuenta de efectivo de la sucursal.
  const cuentas = await sql`
    select id, nombre from cuentas_bancarias
    where sucursal_id = ${sucursalId} and tipo = 'efectivo'
  `;
  if (cuentas.length === 0) {
    console.log("No hay cuenta de efectivo en esa sucursal.");
    await sql.end();
    return;
  }

  for (const cuenta of cuentas) {
    console.log(`\n=== ${cuenta.nombre} · ${ymd} ===\n`);

    const [prev] = await sql`
      select coalesce(sum(monto), 0) as saldo
      from movimientos_bancarios
      where cuenta_id = ${cuenta.id}
        and to_char(fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') < ${ymd}
    `;
    let saldo = Number(prev.saldo);
    console.log(`  saldo al arrancar el dia: ${$(saldo)}\n`);

    const movs = await sql`
      select
        to_char(fecha at time zone 'America/Argentina/Buenos_Aires','HH24:MI') as hora,
        monto, tipo, descripcion, ref_tipo
      from movimientos_bancarios
      where cuenta_id = ${cuenta.id}
        and to_char(fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') = ${ymd}
      order by fecha, id
    `;

    for (const m of movs) {
      saldo += Number(m.monto);
      const signo = Number(m.monto) >= 0 ? "+" : "-";
      console.log(
        `  ${m.hora}  ${signo}${Math.abs(Number(m.monto)).toLocaleString("es-AR").padStart(11)}` +
          `  saldo ${$(saldo).padStart(12)}  ${m.tipo}/${m.ref_tipo ?? "-"}  ${m.descripcion ?? ""}`,
      );
    }

    console.log(`\n  ESPERADO EN EL CAJON AHORA: ${$(saldo)}`);
    console.log(`  movimientos del dia: ${movs.length}`);
  }

  // Que declararon al abrir y al cerrar, si ya cerraron.
  const cierres = await sql`
    select c.fecha, cc.saldo_esperado, cc.saldo_contado, cu.nombre
    from cierres_caja c
    join cierre_caja_cuentas cc on cc.cierre_id = c.id
    join cuentas_bancarias cu on cu.id = cc.cuenta_id
    where c.sucursal_id = ${sucursalId} and c.fecha = ${ymd}
  `;
  if (cierres.length > 0) {
    console.log(`\n  cierre cargado: ${JSON.stringify(cierres[0])}`);
  } else {
    console.log(`\n  (la caja del ${ymd} todavia no esta cerrada)`);
  }

  await sql.end();
}

main();
