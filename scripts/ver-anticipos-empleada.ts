/**
 * Solo lectura: todos los anticipos de una empleada, descontados o no.
 *
 * Uso: npx tsx scripts/ver-anticipos-empleada.ts Carolina
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const nombre = process.argv[2] ?? "Carolina";
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const rows = await sql`
    select
      a.id,
      e.nombre,
      s.nombre as sucursal,
      to_char(a.fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD HH24:MI') as entrega,
      a.fecha_descuento::text as acordado,
      a.monto,
      a.observacion,
      a.liquidacion_id,
      l.periodo_desde::text as liq_desde,
      l.periodo_hasta::text as liq_hasta,
      l.estado as liq_estado
    from anticipos a
    join empleados e on e.id = a.empleado_id
    join sucursales s on s.id = a.sucursal_id
    left join liquidaciones l on l.id = a.liquidacion_id
    where e.nombre ilike ${"%" + nombre + "%"}
    order by a.fecha
  `;

  console.log(`Anticipos de ${nombre}: ${rows.length}\n`);
  for (const r of rows) {
    const estado = r.liquidacion_id
      ? `DESCONTADO en liq ${r.liq_desde}..${r.liq_hasta} (${r.liq_estado})`
      : "pendiente";
    console.log(
      `$${Number(r.monto).toLocaleString("es-AR")} · ${r.sucursal} · entregado ${r.entrega}` +
        ` · se descuenta ${r.acordado ?? "(en su fecha)"} · ${estado}` +
        (r.observacion ? ` · ${r.observacion}` : "") +
        `\n    id=${r.id}`,
    );
  }

  await sql.end();
}

main();
