/**
 * Solo lectura: viaticos cargados en el MODULO para un rango y sucursal.
 *
 * Importa para no pagar dos veces: si el viatico ya se pago como gasto suelto
 * y ademas figura sin pagar en el modulo, la liquidacion lo vuelve a sumar.
 *
 * Uso: npx tsx scripts/ver-viaticos-semana.ts 2026-10-04 2026-10-10 seed-000002
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const desde = process.argv[2] ?? "2026-10-04";
const hasta = process.argv[3] ?? "2026-10-10";
const sucursalId = process.argv[4] ?? "seed-000002";
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const rows = await sql`
    select e.nombre, v.fecha::text as fecha, v.monto, v.pagado,
           v.liquidacion_id, v.observacion
    from viaticos v
    join empleados e on e.id = v.empleado_id
    where v.sucursal_id = ${sucursalId}
      and v.fecha between ${desde}::date and ${hasta}::date
    order by e.nombre, v.fecha
  `;

  console.log(`Viaticos en el modulo ${desde} a ${hasta}: ${rows.length}\n`);
  let aPagar = 0;
  for (const r of rows) {
    const estado = r.liquidacion_id
      ? "ya en una liquidacion"
      : r.pagado
        ? "pagado aparte"
        : "SIN PAGAR -> la liquidacion lo va a sumar";
    if (!r.liquidacion_id && !r.pagado) aPagar += Number(r.monto);
    console.log(
      `  ${r.nombre.padEnd(24)} ${r.fecha} $${Number(r.monto).toLocaleString("es-AR")} · ${estado}`,
    );
  }
  console.log(`\n  Sumaria a las liquidaciones: $${aPagar.toLocaleString("es-AR")}`);
  await sql.end();
}

main();
