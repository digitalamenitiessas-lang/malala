/**
 * Asigna la vendedora y el porcentaje a una linea de venta que quedo sin
 * vendedora, y recalcula su comision.
 *
 * Cuando se carga una venta sin vendedora el sistema pone la comision en 0 a
 * proposito —"la comision es de alguien o no es"—, asi que no alcanza con
 * asignar a la persona: hay que poner tambien el porcentaje y rehacer el
 * monto con el mismo criterio que usa la venta.
 *
 * NO toca la caja: no cambia el total, ni el medio de pago, ni el stock. El
 * arqueo de ese dia da igual antes y despues.
 *
 * Uso:
 *   npx tsx scripts/asignar-vendedora-linea.ts <lineaId> <empleadoId> <pct>
 *   npx tsx scripts/asignar-vendedora-linea.ts <lineaId> <empleadoId> <pct> --aplicar
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const [lineaId, empleadoId, pctRaw] = process.argv.slice(2);
const pct = Number(pctRaw);
const aplicar = process.argv.includes("--aplicar");
if (!lineaId || !empleadoId || !Number.isFinite(pct)) {
  throw new Error("uso: asignar-vendedora-linea.ts <lineaId> <empleadoId> <pct> [--aplicar]");
}

const sql = postgres(url, { max: 1, prepare: false });
const $ = (n: unknown) => `$${Number(n).toLocaleString("es-AR")}`;

async function main() {
  await sql
    .begin(async (tx) => {
      const [l] = await tx`
        select il.*, i.subtotal as ticket_subtotal, i.descuento_monto, i.anulado,
               i.sucursal_id,
               coalesce(sv.nombre, ins.nombre) as item,
               ins.precio_venta_efectivo,
               (select ll.id from liquidacion_lineas ll
                 where ll.ingreso_linea_id = il.id limit 1) as ya_liquidada
        from ingreso_lineas il
        join ingresos i on i.id = il.ingreso_id
        left join servicios sv on sv.id = il.servicio_id
        left join insumos ins on ins.id = il.insumo_id
        where il.id = ${lineaId}
      `;
      if (!l) throw new Error("no encontre esa linea");
      if (l.anulado) throw new Error("esa venta esta anulada");
      if (l.ya_liquidada) {
        throw new Error(
          "esa linea ya entro en una liquidacion: su comision esta pagada y no se toca",
        );
      }

      const [emp] = await tx`select nombre from empleados where id = ${empleadoId}`;
      if (!emp) throw new Error("no encontre a esa empleada");

      // El mismo criterio que la venta: la comision sale del precio EN
      // EFECTIVO, y el recargo de tarjeta queda para el local.
      const subtotal = Number(l.subtotal);
      const base =
        l.precio_venta_efectivo != null
          ? Math.min(subtotal, Number(l.precio_venta_efectivo) * Number(l.cantidad))
          : subtotal;
      const monto = Math.round(base * (pct / 100) * 100) / 100;

      console.log(`${l.item}  ${$(subtotal)}`);
      console.log(`  vendedora:  (ninguna)  ->  ${emp.nombre}`);
      console.log(`  comision:   ${l.comision_pct}% ${$(l.comision_monto)}  ->  ${pct}% ${$(monto)}`);

      await tx`
        update ingreso_lineas
        set empleado_id = ${empleadoId}, comision_pct = ${pct}, comision_monto = ${monto}
        where id = ${lineaId}
      `;

      if (!aplicar) {
        console.log("\nSIMULACION: se cancela. Corré con --aplicar para que quede.");
        throw new Error("ROLLBACK");
      }
      console.log("\nAPLICADO.");
    })
    .catch((e) => {
      if (!(e instanceof Error && e.message === "ROLLBACK")) throw e;
    });
  await sql.end();
}

main();
