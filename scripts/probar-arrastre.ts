/**
 * Prueba el arrastre contra la base de verdad, SIN dejar nada.
 *
 * Todo pasa dentro de una transaccion que al final se cancela a proposito.
 * Lo que se prueba es la cuenta: que una liquidacion pagada de menos deje
 * saldo a favor, que la siguiente se lo lleve una sola vez, y que despues
 * quede en cero. Si eso falla, alguien cobra de menos o cobra dos veces.
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const sql = postgres(url, { max: 1, prepare: false });

async function pendiente(
  tx: postgres.TransactionSql,
  empleadoId: string,
  sucursalId: string,
) {
  const [row] = await tx`
    select
      coalesce(sum(
        case when estado = 'pagada'
             then total_pagar - coalesce(total_pagado, total_pagar)
             else 0 end
      ), 0) as debido,
      coalesce(sum(arrastre), 0) as ya_arrastrado
    from liquidaciones
    where empleado_id = ${empleadoId}
      and sucursal_id = ${sucursalId}
      and estado <> 'anulada'
  `;
  const p = Number(row.debido) - Number(row.ya_arrastrado);
  return Math.abs(p) < 0.01 ? 0 : p;
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
      select e.id, e.nombre, e.sucursal_principal_id as sucursal_id
      from empleados e
      where e.activo = true
      limit 1
    `;
    const empleadoId = emp.id as string;
    const sucursalId = emp.sucursal_id as string;
    const [u] = await tx`select user_id as id from profiles limit 1`;
    const usuarioId = u.id as string;
    console.log(`Empleada de prueba: ${emp.nombre}\n`);

    const arranque = await pendiente(tx, empleadoId, sucursalId);
    chequear("arranca sin deuda", arranque, 0);

    // Semana 1: cobra 237.340 y le pagan 237.000.
    await tx`
      insert into liquidaciones
        (id, sucursal_id, empleado_id, periodo_desde, periodo_hasta,
         total_pagar, total_pagado, arrastre, estado, usuario_id)
      values
        ('TEST-ARRASTRE-1', ${sucursalId}, ${empleadoId},
         '2020-01-01', '2020-01-07', 237340, 237000, 0, 'pagada', ${usuarioId})
    `;
    chequear("quedan 340 a favor", await pendiente(tx, empleadoId, sucursalId), 340);

    // Semana 2: se los lleva.
    await tx`
      insert into liquidaciones
        (id, sucursal_id, empleado_id, periodo_desde, periodo_hasta,
         total_pagar, total_pagado, arrastre, estado, usuario_id)
      values
        ('TEST-ARRASTRE-2', ${sucursalId}, ${empleadoId},
         '2020-01-08', '2020-01-14', 180340, null, 340, 'pendiente', ${usuarioId})
    `;
    chequear(
      "ya no quedan: no se cobran dos veces",
      await pendiente(tx, empleadoId, sucursalId),
      0,
    );

    // Y si esa segunda tambien se paga redondeada, vuelve a quedar la nueva
    // diferencia y no la vieja.
    await tx`
      update liquidaciones
      set estado = 'pagada', total_pagado = 180000
      where id = 'TEST-ARRASTRE-2'
    `;
    chequear(
      "la nueva diferencia es 340, no 680",
      await pendiente(tx, empleadoId, sucursalId),
      340,
    );

    // Borrar la primera (que es lo que hace anular) dejaria la cuenta en -340.
    await tx`delete from liquidaciones where id = 'TEST-ARRASTRE-1'`;
    const roto = await pendiente(tx, empleadoId, sucursalId);
    console.log(`\nSin el tope daria ${roto} (negativo = le descuenta del sueldo)`);
    chequear("con el tope queda en cero", Math.max(roto, 0), 0);

    throw new Error("ROLLBACK");
  });
} catch (e) {
  if (!(e instanceof Error && e.message === "ROLLBACK")) throw e;
  console.log("\nTransaccion cancelada: no quedo nada en la base.");
}

const [{ n }] = await sql`
  select count(*)::int as n from liquidaciones where id like 'TEST-ARRASTRE-%'
`;
console.log(`Filas de prueba que quedaron: ${n}`);
if (n !== 0) fallas.push("quedaron filas de prueba");

await sql.end();
console.log(fallas.length === 0 ? "\nTodo bien." : `\nFALLO: ${fallas.join(", ")}`);
  process.exit(fallas.length === 0 ? 0 : 1);
}

main();
