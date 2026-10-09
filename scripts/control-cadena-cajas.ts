/**
 * Control: lo contado al cerrar un dia tiene que ser lo declarado al abrir el
 * siguiente, salvo que haya movimientos en el medio.
 *
 * Es la cadena que el salon verifica a mano con el cajon. Se rompio dos veces
 * en una semana —una por cifras de hoy cargadas en el cierre de ayer, otra por
 * un ajuste de apertura parado en el dia equivocado— y en las dos el salon lo
 * noto antes que nosotros.
 *
 * Uso: npx tsx scripts/control-cadena-cajas.ts
 */
import "../envConfig";
import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client/postgres";

async function main() {
  const db = getDb();
  const filas = (await db.execute(sql`
    with cuentas_ef as (
      select id, sucursal_id, nombre from cuentas_bancarias where tipo = 'efectivo'
    ),
    cierres as (
      select ci.sucursal_id, ci.fecha, cc.cuenta_id, cc.saldo_contado
      from cierres_caja ci
      join cierre_caja_cuentas cc on cc.cierre_id = ci.id
      join cuentas_ef e on e.id = cc.cuenta_id
      where ci.fecha >= '2026-09-25'
    ),
    aperturas as (
      select a.sucursal_id, a.fecha, ac.cuenta_id, ac.saldo_declarado
      from aperturas_caja a
      join apertura_caja_cuentas ac on ac.apertura_id = a.id
      join cuentas_ef e on e.id = ac.cuenta_id
      where a.fecha >= '2026-09-25'
    )
    select s.nombre as suc, e.nombre as cuenta,
           c.fecha as cerro, a.fecha as abrio,
           c.saldo_contado, a.saldo_declarado,
           (a.saldo_declarado - c.saldo_contado) as salto
    from cierres c
    join aperturas a
      on a.sucursal_id = c.sucursal_id and a.cuenta_id = c.cuenta_id
     and a.fecha = (
       select min(a2.fecha) from aperturas a2
       where a2.sucursal_id = c.sucursal_id and a2.cuenta_id = c.cuenta_id
         and a2.fecha > c.fecha
     )
    join sucursales s on s.id = c.sucursal_id
    join cuentas_ef e on e.id = c.cuenta_id
    where abs(a.saldo_declarado - c.saldo_contado) > 0.01
    order by s.nombre, c.fecha
  `)) as any[];

  if (filas.length === 0) {
    console.log("✔ La cadena cierra: lo contado al cerrar es lo declarado al abrir.");
    return;
  }
  console.log(`${filas.length} salto(s) para revisar entre el cierre de un dia y la apertura del siguiente.`);
  console.log("No todos son errores: la plata puede salir del cajon de noche. Lo");
  console.log("que no puede es un contado negativo, que es el calculo del sistema");
  console.log("cargado como si fuera lo que habia en el cajon.
");
  for (const f of filas) {
    console.log(`  ${String(f.suc).padEnd(20)} ${f.cuenta}: cerro ${f.cerro} con ${Number(f.saldo_contado)}, abrio ${f.abrio} con ${Number(f.saldo_declarado)}  -> salto ${Number(f.salto)}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
