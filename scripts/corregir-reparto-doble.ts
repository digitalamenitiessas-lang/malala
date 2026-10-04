/**
 * Corrige las ventas que el reparto de comisión guardó mal.
 *
 * La primera versión de "Lo hicieron dos" partía el PRECIO y dejaba dos líneas
 * de cantidad 1. El cobro quedaba bien, pero el sistema creía que el servicio
 * se había hecho dos veces: descontó el doble de stock y reporta el doble de
 * costo de insumos. Apareció en producción como un ticket de $216.000 con
 * $83.188 de insumos, que era la receta contada dos veces.
 *
 * Ya corregido en expandirLineas, que ahora parte la cantidad. Esto arregla lo
 * que se guardó en el medio.
 *
 * Qué hace, por cada par de líneas del mismo servicio con empleadas distintas:
 *   - reparte la cantidad entre las dos (0,5 y 0,5) y les devuelve el precio
 *     y el porcentaje enteros. El subtotal y la comisión NO cambian: eso ya
 *     estaba bien y tocarlo seria cambiarle la plata a alguien.
 *   - devuelve al stock la mitad que salió de más, con su propio movimiento
 *     para que quede el rastro.
 *
 * No toca las ventas donde el mismo servicio aparece varias veces de verdad
 * (cuatro peinados de un casamiento, por ejemplo): esas se reconocen porque
 * cada línea tiene su precio completo, no la mitad.
 *
 * Uso:
 *   npx tsx scripts/corregir-reparto-doble.ts
 *   npx tsx scripts/corregir-reparto-doble.ts --aplicar
 */
import "../envConfig";
import { getSqlClient } from "../src/lib/db/client/postgres";

const APLICAR = process.argv.includes("--aplicar");

interface Grupo {
  ingresoId: string;
  servicioId: string;
  servicio: string;
  sucursalId: string;
  fecha: Date;
  lineas: { id: string; cantidad: number; precio: number; pct: number }[];
  /** Precio de lista del catalogo. */
  precioCatalogo: number;
  /** Precio en efectivo. La venta pudo cobrarse a cualquiera de los dos. */
  precioEfectivo: number;
}

async function main() {
  const sql = getSqlClient();

  const filas = await sql<
    {
      ingreso_id: string; sucursal_id: string; fecha: Date; servicio_id: string;
      servicio: string; precio_lista: number; precio_efectivo: number;
      linea_id: string; cantidad: number; precio: number; pct: number;
    }[]
  >`
    select i.id ingreso_id, i.sucursal_id, i.fecha, sv.id servicio_id, sv.nombre servicio,
           sv.precio_lista, sv.precio_efectivo,
           il.id linea_id, il.cantidad, il.precio_efectivo precio, il.comision_pct pct
      from ingreso_lineas il
      join ingresos i on i.id = il.ingreso_id
      join servicios sv on sv.id = il.servicio_id
     where not i.anulado
       and (i.id, il.servicio_id) in (
         select i2.id, il2.servicio_id
           from ingreso_lineas il2 join ingresos i2 on i2.id = il2.ingreso_id
          where not i2.anulado
          group by 1, 2
         having count(*) > 1 and count(distinct il2.empleado_id) > 1
       )
     order by i.fecha desc, sv.nombre`;

  const grupos = new Map<string, Grupo>();
  for (const f of filas) {
    const k = `${f.ingreso_id}|${f.servicio_id}`;
    const g = grupos.get(k) ?? {
      ingresoId: f.ingreso_id,
      servicioId: f.servicio_id,
      servicio: f.servicio,
      sucursalId: f.sucursal_id,
      fecha: f.fecha,
      lineas: [] as Grupo["lineas"],
      precioCatalogo: 0,
      precioEfectivo: 0,
    };
    g.lineas.push({
      id: f.linea_id,
      cantidad: Number(f.cantidad),
      precio: Number(f.precio),
      pct: Number(f.pct),
    });
    g.precioCatalogo = Number(f.precio_lista);
    g.precioEfectivo = Number(f.precio_efectivo);
    grupos.set(k, g);
  }

  // Un reparto se reconoce porque las líneas suman UN servicio a precio entero:
  // la suma de los subtotales es el precio de catálogo, no un múltiplo. Cuatro
  // peinados de verdad suman cuatro veces el precio y quedan afuera.
  const aCorregir = [...grupos.values()].filter((g) => {
    const suma = g.lineas.reduce((a, l) => a + l.precio * l.cantidad, 0);
    const unitarios = g.lineas.reduce((a, l) => a + l.cantidad, 0);
    // Vale contra cualquiera de los dos precios: la venta pudo cobrarse al de
    // lista o al de efectivo, y un reparto suma UNA unidad a precio entero.
    return (
      unitarios > 1 &&
      (Math.abs(suma - g.precioCatalogo) < 1 || Math.abs(suma - g.precioEfectivo) < 1)
    );
  });

  console.log(`Grupos con el mismo servicio y dos empleadas: ${grupos.size}`);
  console.log(`De esos, repartos mal guardados: ${aCorregir.length}\n`);

  for (const g of [...grupos.values()]) {
    const suma = g.lineas.reduce((a, l) => a + l.precio * l.cantidad, 0);
    const esReparto = aCorregir.includes(g);
    console.log(
      `  ${esReparto ? "CORREGIR" : "        "} ${String(g.fecha?.toISOString?.().slice(0, 10))} ${String(g.servicio).slice(0, 30).padEnd(32)} ${g.lineas.length} lineas, cobrado $${suma}, catalogo $${g.precioCatalogo}`,
    );
  }

  if (!aCorregir.length) {
    console.log(`\nNo hay nada que corregir.`);
    process.exit(0);
  }

  // Cuánto insumo volver: por cada grupo sobra (cantidadActual − 1) servicios.
  const devoluciones = new Map<string, { sucursalId: string; cantidad: number }>();
  for (const g of aCorregir) {
    const sobrante = g.lineas.reduce((a, l) => a + l.cantidad, 0) - 1;
    const recetas = await sql<{ insumo_id: string; cantidad: number }[]>`
      select insumo_id, cantidad from recetas
       where servicio_id =  and sucursal_id = `;
    for (const r of recetas) {
      const k = `${g.sucursalId}|${r.insumo_id}`;
      const cur = devoluciones.get(k) ?? { sucursalId: g.sucursalId, cantidad: 0 };
      cur.cantidad += Number(r.cantidad) * sobrante;
      devoluciones.set(k, cur);
    }
  }

  console.log(`\nStock a devolver (${devoluciones.size} insumos):`);
  for (const [k, v] of devoluciones) {
    const [, insumoId] = k.split("|");
    const [ins] = await sql<{ nombre: string }[]>`select nombre from insumos where id = `;
    console.log(`  +${String(v.cantidad).padStart(6)}  ${ins?.nombre ?? insumoId}`);
  }

  if (!APLICAR) {
    console.log(`\n(simulacion, nada se escribio. Agregar --aplicar)`);
    process.exit(0);
  }

  const [usuario] = await sql<{ user_id: string }[]>`
    select user_id from profiles where rol in ('admin','superadmin') order by email limit 1`;

  for (const g of aCorregir) {
    const n = g.lineas.length;
    for (const l of g.lineas) {
      // Precio y porcentaje enteros, cantidad repartida: el subtotal y la
      // comision quedan igual que ahora, que es lo que ya estaba bien.
      await sql`
        update ingreso_lineas
           set cantidad = ${1 / n},
               precio_efectivo = ${l.precio * l.cantidad * n},
               comision_pct = ${l.pct * n}
         where id = ${l.id}`;
    }
  }

  for (const [k, v] of devoluciones) {
    const [, insumoId] = k.split("|");
    await sql`
      update stock_sucursal set cantidad = cantidad + ${v.cantidad}
       where insumo_id = ${insumoId} and sucursal_id = ${v.sucursalId}`;
    await sql`
      insert into movimientos_stock (id, fecha, insumo_id, sucursal_id, tipo, cantidad, motivo, usuario_id)
      values (gen_random_uuid()::text, now(), ${insumoId}, ${v.sucursalId}, 'ajuste_manual',
              ${v.cantidad}, 'Devolucion: receta contada dos veces por el reparto de comision', ${usuario.user_id})`;
  }

  console.log(`\nListo: ${aCorregir.length} servicios corregidos y stock devuelto.`);
  process.exit(0);
}

main();
