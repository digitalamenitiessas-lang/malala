/**
 * Solo lectura: busca un monto en las tablas donde puede estar una plata que
 * alguien recuerda pero no aparece donde la busca.
 *
 * Uso: npx tsx scripts/buscar-monto.ts 97500
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const monto = Number(process.argv[2]);
if (!Number.isFinite(monto)) throw new Error("pasa un monto: buscar-monto.ts 97500");

const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  console.log(`Buscando $${monto.toLocaleString("es-AR")}\n`);

  const anticipos = await sql`
    select e.nombre, s.nombre as sucursal, a.monto, a.observacion,
           to_char(a.fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') as fecha,
           a.fecha_descuento::text as acordado, a.liquidacion_id
    from anticipos a
    join empleados e on e.id = a.empleado_id
    join sucursales s on s.id = a.sucursal_id
    where abs(a.monto - ${monto}) < 0.01
  `;
  console.log(`ANTICIPOS: ${anticipos.length}`);
  for (const r of anticipos) {
    console.log(
      `  ${r.nombre} · ${r.sucursal} · ${r.fecha} · descuenta ${r.acordado ?? "(su fecha)"}` +
        ` · ${r.liquidacion_id ? "descontado" : "pendiente"} · ${r.observacion ?? ""}`,
    );
  }

  const egresos = await sql`
    select g.valor, g.observacion, s.nombre as sucursal,
           to_char(g.fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD HH24:MI') as fecha
    from egresos g
    join sucursales s on s.id = g.sucursal_id
    where abs(g.valor - ${monto}) < 0.01
    order by g.fecha desc
    limit 20
  `;
  console.log(`\nEGRESOS: ${egresos.length}`);
  for (const r of egresos) {
    console.log(`  ${r.sucursal} · ${r.fecha} · ${r.observacion ?? ""}`);
  }

  const cc = await sql`
    select m.monto, m.tipo, m.descripcion as observacion, c.nombre as cliente,
           to_char(m.fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') as fecha
    from movimientos_cc m
    join clientes c on c.id = m.cliente_id
    where abs(abs(m.monto) - ${monto}) < 0.01
    order by m.fecha desc
    limit 20
  `;
  console.log(`\nCUENTA CORRIENTE: ${cc.length}`);
  for (const r of cc) {
    console.log(`  ${r.cliente} · ${r.fecha} · ${r.tipo} · ${r.observacion ?? ""}`);
  }

  const viaticos = await sql`
    select v.monto, v.observacion, e.nombre, v.fecha::text as fecha, v.pagado
    from viaticos v
    join empleados e on e.id = v.empleado_id
    where abs(v.monto - ${monto}) < 0.01
    limit 20
  `;
  console.log(`\nVIATICOS: ${viaticos.length}`);
  for (const r of viaticos) {
    console.log(`  ${r.nombre} · ${r.fecha} · ${r.pagado ? "pagado" : "pendiente"}`);
  }

  await sql.end();
}

main();
