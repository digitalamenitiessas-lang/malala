/**
 * Deja los viaticos de la semana del 05 al 10/10 en Yerba Buena como quedaron
 * en la realidad, para poder liquidar sin pagarlos dos veces.
 *
 * QUE PASO
 * El sabado se pagaron los viaticos en efectivo, cargados como gasto suelto en
 * el rubro Sueldos. Despues se cargaron ademas en el modulo de viaticos, donde
 * quedaron SIN PAGAR. Si se genera la liquidacion asi, se los vuelve a sumar y
 * se pagan dos veces.
 *
 * DOS COSAS
 * 1. Carolina tiene $8.000 cargados pero se le pagaron $12.000. Trabajo el 8,
 *    el 9 y el 10, y solo estan cargados el 9 y el 10: falta el del 8.
 *    Dicho por ella: "Viatico. son $12.000. Error mio seguramente cuando
 *    cargue el viatico de $8.000".
 * 2. Los viaticos de Celeste, Carolina y Priscila se marcan como pagados,
 *    porque ya salieron del cajon el sabado.
 *
 * No toca la caja: los egresos de esos viaticos ya existen y quedan como estan.
 *
 * Uso:
 *   npx tsx scripts/corregir-viaticos-semana-10-10.ts            (simula)
 *   npx tsx scripts/corregir-viaticos-semana-10-10.ts --aplicar
 */
import "../envConfig";
import postgres from "postgres";

const createId = () => crypto.randomUUID();

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const aplicar = process.argv.includes("--aplicar");
const SUC = "seed-000002";
const DESDE = "2026-10-04";
const HASTA = "2026-10-10";
/** Lo que se le pago en efectivo el sabado, por los gastos cargados ese dia. */
const PAGADO_EN_EFECTIVO: Record<string, number> = {
  Celeste: 16000,
  Carolina: 12000,
  Priscila: 20000,
};

const sql = postgres(url, { max: 1, prepare: false });
const $ = (n: unknown) => `$${Number(n).toLocaleString("es-AR")}`;

async function main() {
  await sql
    .begin(async (tx) => {
      const [u] = await tx`select user_id as id from profiles limit 1`;

      // 1. El viatico que falta de Carolina: el dia que trabajo y no tiene.
      const [caro] = await tx`
        select id from empleados
        where nombre ilike '%Carolina%' and sucursal_principal_id = ${SUC}
          and activo = true
      `;
      if (!caro) throw new Error("no encontre a Carolina");

      const yaTiene = await tx`
        select fecha::text as f from viaticos
        where empleado_id = ${caro.id} and sucursal_id = ${SUC}
          and fecha between ${DESDE}::date and ${HASTA}::date
      `;
      const fechas = new Set(yaTiene.map((r) => r.f as string));
      if (fechas.has("2026-10-08")) {
        console.log("Carolina ya tiene el viatico del 08/10, no agrego nada.");
      } else {
        console.log(`Carolina: agrego viatico 2026-10-08 ${$(4000)}`);
        await tx`
          insert into viaticos (id, empleado_id, sucursal_id, fecha, monto, pagado, observacion, usuario_id)
          values (${createId()}, ${caro.id}, ${SUC}, '2026-10-08'::date, 4000, false,
                  'Faltaba: se le pagaron $12.000 y estaban cargados $8.000', ${u.id})
        `;
      }

      // 2. Marcar como pagados los que ya salieron en efectivo el sabado.
      for (const [nombre, esperado] of Object.entries(PAGADO_EN_EFECTIVO)) {
        const [emp] = await tx`
          select id from empleados
          where nombre ilike ${"%" + nombre + "%"} and sucursal_principal_id = ${SUC}
            and activo = true
        `;
        if (!emp) throw new Error(`no encontre a ${nombre}`);

        const [suma] = await tx`
          select coalesce(sum(monto), 0) as total, count(*)::int as n
          from viaticos
          where empleado_id = ${emp.id} and sucursal_id = ${SUC}
            and fecha between ${DESDE}::date and ${HASTA}::date
            and liquidacion_id is null and pagado = false
        `;
        if (Number(suma.total) !== esperado) {
          throw new Error(
            `${nombre}: tiene ${$(suma.total)} sin pagar pero se le pagaron ${$(esperado)}. No toco nada.`,
          );
        }

        await tx`
          update viaticos set pagado = true
          where empleado_id = ${emp.id} and sucursal_id = ${SUC}
            and fecha between ${DESDE}::date and ${HASTA}::date
            and liquidacion_id is null and pagado = false
        `;
        console.log(`${nombre}: ${suma.n} viaticos por ${$(suma.total)} marcados como pagados`);
      }

      // Control: no tiene que quedar nada sin pagar en esa semana.
      const [queda] = await tx`
        select coalesce(sum(v.monto), 0) as total
        from viaticos v
        join empleados e on e.id = v.empleado_id
        where v.sucursal_id = ${SUC}
          and v.fecha between ${DESDE}::date and ${HASTA}::date
          and v.liquidacion_id is null and v.pagado = false
      `;
      console.log(`\nViaticos sin pagar que quedan en la semana: ${$(queda.total)}`);
      if (Number(queda.total) !== 0) {
        throw new Error("quedaron viaticos sin pagar, reviso antes de aplicar");
      }

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
