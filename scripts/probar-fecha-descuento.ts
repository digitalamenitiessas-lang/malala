/**
 * Prueba que un anticipo se descuente en la semana ACORDADA, no en la de
 * entrega. SIN dejar nada: todo adentro de una transaccion que se cancela.
 *
 * "Carolina pide $250.000... despues pide que sea recien el 24/10. La plata
 * sale pero se les descuenta mas adelante. SON TODO EL TIEMPO."
 *
 * Uso: npx tsx scripts/probar-fecha-descuento.ts
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const sql = postgres(url, { max: 1, prepare: false });

/** El mismo filtro que usa la liquidacion. */
async function anticiposDelPeriodo(
  tx: postgres.TransactionSql,
  empleadoId: string,
  desde: string,
  hasta: string,
) {
  const rows = await tx`
    select id, monto
    from anticipos
    where empleado_id = ${empleadoId}
      and liquidacion_id is null
      and coalesce(
            fecha_descuento::text,
            to_char(fecha at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')
          ) between ${desde} and ${hasta}
  `;
  return rows.reduce((s, r) => s + Number(r.monto), 0);
}

const fallas: string[] = [];
function chequear(que: string, dio: number, esperado: number) {
  const ok = Math.abs(dio - esperado) < 0.01;
  console.log(`${ok ? "OK  " : "MAL "} ${que}: dio ${dio}, esperaba ${esperado}`);
  if (!ok) fallas.push(que);
}

async function main() {
  try {
    await sql.begin(async (tx) => {
      const [emp] = await tx`
        select id, nombre, sucursal_principal_id as sucursal_id
        from empleados where activo = true limit 1
      `;
      const [u] = await tx`select user_id as id from profiles limit 1`;
      console.log(`Empleada de prueba: ${emp.nombre}\n`);

      const base = await anticiposDelPeriodo(tx, emp.id, "2020-03-02", "2020-03-08");
      chequear("la semana arranca limpia", base, 0);

      // Se lo da el 2020-03-03 (semana del 2 al 8) pero acuerdan descontarlo
      // el 2020-03-24, que cae tres semanas despues.
      await tx`
        insert into anticipos
          (id, empleado_id, sucursal_id, fecha, fecha_descuento, monto, usuario_id)
        values
          ('TEST-FD-1', ${emp.id}, ${emp.sucursal_id},
           '2020-03-03T15:00:00-03:00', '2020-03-24', 250000, ${u.id})
      `;

      chequear(
        "NO se descuenta en la semana en que se lo dieron",
        await anticiposDelPeriodo(tx, emp.id, "2020-03-02", "2020-03-08"),
        0,
      );
      chequear(
        "SI se descuenta en la semana del 24/03",
        await anticiposDelPeriodo(tx, emp.id, "2020-03-23", "2020-03-29"),
        250000,
      );

      // Uno normal, sin fecha acordada: se descuenta donde se entrego.
      await tx`
        insert into anticipos
          (id, empleado_id, sucursal_id, fecha, fecha_descuento, monto, usuario_id)
        values
          ('TEST-FD-2', ${emp.id}, ${emp.sucursal_id},
           '2020-03-04T15:00:00-03:00', null, 30000, ${u.id})
      `;
      chequear(
        "el normal sigue cayendo en su propia semana",
        await anticiposDelPeriodo(tx, emp.id, "2020-03-02", "2020-03-08"),
        30000,
      );

      // Un anticipo de las 22:00 AR es del mismo dia, no del siguiente: en UTC
      // ya cambio la fecha y ahi se escapaba de la semana.
      await tx`
        insert into anticipos
          (id, empleado_id, sucursal_id, fecha, fecha_descuento, monto, usuario_id)
        values
          ('TEST-FD-3', ${emp.id}, ${emp.sucursal_id},
           '2020-03-08T22:00:00-03:00', null, 5000, ${u.id})
      `;
      chequear(
        "el de las 22:00 del domingo queda en esa semana",
        await anticiposDelPeriodo(tx, emp.id, "2020-03-02", "2020-03-08"),
        35000,
      );

      throw new Error("ROLLBACK");
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === "ROLLBACK")) throw e;
    console.log("\nTransaccion cancelada: no quedo nada en la base.");
  }

  const [{ n }] = await sql`
    select count(*)::int as n from anticipos where id like 'TEST-FD-%'
  `;
  console.log(`Filas de prueba que quedaron: ${n}`);
  if (n !== 0) fallas.push("quedaron filas de prueba");

  await sql.end();
  console.log(fallas.length === 0 ? "\nTodo bien." : `\nFALLO: ${fallas.join(", ")}`);
  process.exit(fallas.length === 0 ? 0 : 1);
}

main();
