/**
 * Une dos proveedores duplicados en uno.
 *
 * Pasa porque el alta de proveedor no chequea nombres parecidos: "Distri Look"
 * y "Distrilook" entraron como dos, y los gastos y los insumos quedaron
 * repartidos entre los dos, asi que ninguna de las dos fichas mostraba la
 * historia completa.
 *
 * Lo que se mueve: los gastos, los insumos vinculados, las sucursales y la
 * deuda pendiente. Despues se borra el duplicado.
 *
 * Los insumos van con ON CONFLICT: insumo_proveedores tiene un unico por
 * (insumo, proveedor), y los dos duplicados comparten casi todo el catalogo, asi
 * que insertar sin eso reventaria en el primer insumo repetido.
 *
 * Uso:
 *   npx tsx scripts/unificar-proveedores.ts <id-que-queda> <id-que-se-borra>
 *   npx tsx scripts/unificar-proveedores.ts <id-que-queda> <id-que-se-borra> --aplicar
 */
import "../envConfig";
import { getSqlClient } from "../src/lib/db/client/postgres";

async function main() {
  const sql = getSqlClient();
  const [queda, sale] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const aplicar = process.argv.includes("--aplicar");

  if (!queda || !sale) {
    console.log("Uso: npx tsx scripts/unificar-proveedores.ts <id-que-queda> <id-que-se-borra> [--aplicar]");
    process.exit(1);
  }
  if (queda === sale) {
    console.log("Son el mismo proveedor.");
    process.exit(1);
  }

  const filas = (await sql`
    select id, nombre, deuda_pendiente from proveedores where id in (${queda}, ${sale})`) as any[];
  const pQueda = filas.find((p) => p.id === queda);
  const pSale = filas.find((p) => p.id === sale);
  if (!pQueda || !pSale) {
    console.log("No existe alguno de los dos proveedores.");
    process.exit(1);
  }

  const [n] = (await sql`
    select
      (select count(*)::int from egresos where proveedor_id = ${sale}) egresos,
      (select count(*)::int from insumo_proveedores where proveedor_id = ${sale}) insumos,
      (select count(*)::int from proveedor_sucursal where proveedor_id = ${sale}) sucursales,
      (select count(*)::int from insumo_proveedores ip
        where ip.proveedor_id = ${sale}
          and exists (select 1 from insumo_proveedores q
                       where q.proveedor_id = ${queda} and q.insumo_id = ip.insumo_id)) insumos_repetidos`) as any[];

  console.log(`Queda:   ${pQueda.id}  "${pQueda.nombre}"  deuda $${pQueda.deuda_pendiente}`);
  console.log(`Se borra:${pSale.id}  "${pSale.nombre}"  deuda $${pSale.deuda_pendiente}`);
  console.log(`\nSe mueven ${n.egresos} gastos, ${n.insumos} insumos (${n.insumos_repetidos} ya estaban en los dos) y ${n.sucursales} sucursales.`);
  console.log(`Deuda final: $${Number(pQueda.deuda_pendiente) + Number(pSale.deuda_pendiente)}`);

  if (!aplicar) {
    console.log(`\n(simulacion, nada se escribio. Agregar --aplicar)`);
    process.exit(0);
  }

  await sql`update egresos set proveedor_id = ${queda} where proveedor_id = ${sale}`;
  await sql`
    insert into insumo_proveedores (id, insumo_id, proveedor_id)
    select gen_random_uuid()::text, ip.insumo_id, ${queda}
      from insumo_proveedores ip
     where ip.proveedor_id = ${sale}
    on conflict do nothing`;
  await sql`
    insert into proveedor_sucursal (id, proveedor_id, sucursal_id)
    select gen_random_uuid()::text, ${queda}, ps.sucursal_id
      from proveedor_sucursal ps
     where ps.proveedor_id = ${sale}
    on conflict do nothing`;
  await sql`
    update proveedores
       set deuda_pendiente = deuda_pendiente + ${Number(pSale.deuda_pendiente)}
     where id = ${queda}`;
  // Las filas hijas caen solas: insumo_proveedores y proveedor_sucursal
  // referencian con on delete cascade. egresos no, pero ya quedaron repuntados.
  await sql`delete from proveedores where id = ${sale}`;

  console.log(`\nListo. Quedo "${pQueda.nombre}".`);
  process.exit(0);
}

main();
