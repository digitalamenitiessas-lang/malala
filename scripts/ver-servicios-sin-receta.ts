/**
 * Solo lectura: que servicios se venden pero no tienen receta cargada.
 *
 * Sin receta el costo de insumos da 0 y el reporte de rentabilidad los muestra
 * al 100% de margen. Reportado asi: "en los reportes hay servicios que figuran
 * con insumos 0, da la rentabilidad alta por eso como por ejemplo las semi de
 * uñas".
 *
 * Se ordena por facturacion: lo que mas distorsiona el reporte es lo que mas
 * se vende, no lo que mas servicios sueltos tiene.
 *
 * Uso: npx tsx scripts/ver-servicios-sin-receta.ts seed-000002 2026-09-01
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const sucursalId = process.argv[2] ?? "seed-000002";
const desde = process.argv[3] ?? "2026-09-01";
const sql = postgres(url, { max: 1, prepare: false });

const $ = (n: unknown) => `$${Math.round(Number(n)).toLocaleString("es-AR")}`;

async function main() {
  const rows = await sql`
    select
      s.id,
      s.nombre,
      count(il.id)::int as veces,
      coalesce(sum(il.precio_efectivo), 0) as facturado,
      (select count(*)::int from recetas r
        where r.servicio_id = s.id and r.sucursal_id = ${sucursalId}) as lineas_receta
    from ingreso_lineas il
    join ingresos i on i.id = il.ingreso_id
    join servicios s on s.id = il.servicio_id
    where i.sucursal_id = ${sucursalId}
      and i.anulado = false
      and to_char(i.fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') >= ${desde}
    group by s.id, s.nombre
    order by facturado desc
  `;

  const sin = rows.filter((r) => Number(r.lineas_receta) === 0);
  const con = rows.filter((r) => Number(r.lineas_receta) > 0);

  const totalFacturado = rows.reduce((a, r) => a + Number(r.facturado), 0);
  const sinFacturado = sin.reduce((a, r) => a + Number(r.facturado), 0);

  console.log(`\nServicios vendidos desde ${desde} · ${sucursalId}`);
  console.log(`  con receta:  ${con.length}`);
  console.log(`  SIN receta:  ${sin.length}`);
  console.log(
    `\n  facturado sin receta: ${$(sinFacturado)} de ${$(totalFacturado)}` +
      ` (${((sinFacturado / (totalFacturado || 1)) * 100).toFixed(1)}% del total)`,
  );

  console.log(`\n  Los 20 que mas distorsionan el reporte:`);
  for (const r of sin.slice(0, 20)) {
    console.log(
      `    ${$(r.facturado).padStart(12)}  ${String(r.veces).padStart(4)}x  ${r.nombre}`,
    );
  }

  await sql.end();
}

main();
