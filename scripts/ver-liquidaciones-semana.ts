/**
 * Solo lectura: quien tiene liquidacion hecha en un rango y quien no.
 *
 * Sirve para contestar la pregunta cara: si a alguien se le pago el sueldo
 * pero no se le genero la liquidacion, sus comisiones siguen figurando como
 * pendientes y la semana que viene se las vuelve a mostrar para pagar.
 *
 * Uso: npx tsx scripts/ver-liquidaciones-semana.ts 2026-10-04 2026-10-10 seed-000002
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
    select
      e.nombre,
      count(distinct l.id) as liquidaciones,
      coalesce(sum(distinct l.total_pagar), 0) as total_liquidado,
      (
        select coalesce(sum(il.comision_monto), 0)
        from ingreso_lineas il
        join ingresos i on i.id = il.ingreso_id
        left join liquidacion_lineas ll on ll.ingreso_linea_id = il.id
        where il.empleado_id = e.id
          and i.sucursal_id = ${sucursalId}
          and i.anulado = false
          and ll.id is null
          and to_char(i.fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD')
              between ${desde} and ${hasta}
      ) as comision_sin_liquidar
    from empleados e
    left join liquidaciones l
      on l.empleado_id = e.id
     and l.sucursal_id = ${sucursalId}
     and l.periodo_desde >= ${desde}::date
     and l.periodo_hasta <= ${hasta}::date
    where e.sucursal_principal_id = ${sucursalId}
      and e.activo = true
    group by e.id, e.nombre
    order by e.nombre
  `;

  console.log(`Semana ${desde} a ${hasta} · ${sucursalId}\n`);
  for (const r of rows) {
    const sin = Number(r.comision_sin_liquidar);
    const marca = Number(r.liquidaciones) === 0 && sin > 0 ? "  <-- SIN LIQUIDAR" : "";
    console.log(
      `  ${r.nombre.padEnd(26)} liq=${r.liquidaciones}` +
        ` · liquidado $${Number(r.total_liquidado).toLocaleString("es-AR")}` +
        ` · comision pendiente $${sin.toLocaleString("es-AR")}${marca}`,
    );
  }

  await sql.end();
}

main();
