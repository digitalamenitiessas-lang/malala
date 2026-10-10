/**
 * Solo lectura: que anticipos pendientes hay y en que semana caen ahora.
 *
 * Uso: npx tsx scripts/ver-anticipos-diferidos.ts
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const rows = await sql`
    select
      e.nombre,
      s.nombre as sucursal,
      to_char(a.fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') as entrega,
      a.fecha_descuento::text as acordado,
      a.monto,
      a.observacion,
      coalesce(
        a.fecha_descuento::text,
        to_char(a.fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD')
      ) as descuenta_en
    from anticipos a
    join empleados e on e.id = a.empleado_id
    join sucursales s on s.id = a.sucursal_id
    where a.liquidacion_id is null
    order by s.nombre, e.nombre, a.fecha
  `;

  console.log(`Anticipos pendientes de descontar: ${rows.length}\n`);
  for (const r of rows) {
    const diferido = r.acordado && r.acordado !== r.entrega;
    console.log(
      `${r.sucursal} · ${r.nombre} · $${Number(r.monto).toLocaleString("es-AR")}` +
        ` · entregado ${r.entrega} · se descuenta ${r.descuenta_en}` +
        (diferido ? "  <-- DIFERIDO" : "") +
        (r.observacion ? ` · ${r.observacion}` : ""),
    );
  }

  await sql.end();
}

main();
