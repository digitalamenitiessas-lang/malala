/**
 * Corrige la fecha de un pago de cuenta corriente cargado con el mes
 * equivocado: 2026-11-07 en vez de 2026-10-07.
 *
 * QUE PASO
 * El pago de $144.000 de Carolina Prieto se reviro y se volvio a cargar tres
 * veces el 08/10 (ver movimientos_cc). En la ultima quedo tipeado noviembre.
 * Desde entonces el efectivo de Yerba Buena muestra $144.000 de menos, y el
 * salon lo noto sin poder explicarlo: "Jo cuando me dejo la caja despues de su
 * turno ya tenia la diferencia y no supo a que se debia".
 *
 * POR QUE SE PUEDE AFIRMAR QUE LA PLATA ESTA
 * Con la caja en -$129.750 (imposible en un cajon) se predijo que el conteo
 * fisico daria $14.250, que es la diferencia. Conto $14.250 exactos.
 *
 * QUE TOCA
 * Solo la FECHA de dos filas: el movimiento de cuenta corriente y el
 * movimiento de caja que genero. Ni el monto, ni el signo, ni el cliente. El
 * saldo del cliente no cambia: ya estaba en cero.
 *
 * Uso:
 *   npx tsx scripts/corregir-fecha-pago-cc-144000.ts          (simula)
 *   npx tsx scripts/corregir-fecha-pago-cc-144000.ts --aplicar
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const aplicar = process.argv.includes("--aplicar");
const CC_ID = "e244cbbc-4caa-4962-8da7-0ffb79571f58";
const FECHA_MALA = "2026-11-07";
const FECHA_BUENA = "2026-10-07T12:00:00-03:00";

const sql = postgres(url, { max: 1, prepare: false });
const $ = (n: unknown) =>
  (Number(n) < 0 ? "-$" : "$") + Math.abs(Number(n)).toLocaleString("es-AR");

async function saldoEfectivoYb(tx: postgres.TransactionSql) {
  const [r] = await tx`
    select coalesce(sum(mb.monto), 0) as saldo
    from movimientos_bancarios mb
    join cuentas_bancarias cu on cu.id = mb.cuenta_id
    where cu.sucursal_id = 'seed-000002' and cu.tipo = 'efectivo'
      and to_char(mb.fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD')
          <= '2026-10-10'
  `;
  return Number(r.saldo);
}

async function main() {
  await sql.begin(async (tx) => {
    const cc = await tx`
      select id, to_char(fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') as f,
             tipo, monto
      from movimientos_cc where id = ${CC_ID}
    `;
    if (cc.length !== 1) throw new Error("no encontre el movimiento de cuenta corriente");
    if (cc[0].f !== FECHA_MALA) {
      throw new Error(`la fecha ya no es ${FECHA_MALA}, es ${cc[0].f}. No toco nada.`);
    }

    const mb = await tx`
      select id, to_char(fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') as f, monto
      from movimientos_bancarios
      where ref_tipo = 'cc_pago' and monto = 144000
        and to_char(fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') = ${FECHA_MALA}
    `;
    if (mb.length !== 1) {
      throw new Error(`esperaba 1 movimiento de caja en ${FECHA_MALA}, encontre ${mb.length}`);
    }

    console.log(`cuenta corriente ${cc[0].f} -> 2026-10-07   ${$(cc[0].monto)} (${cc[0].tipo})`);
    console.log(`caja             ${mb[0].f} -> 2026-10-07   ${$(mb[0].monto)}`);

    const antes = await saldoEfectivoYb(tx);
    await tx`update movimientos_cc set fecha = ${FECHA_BUENA}::timestamptz where id = ${CC_ID}`;
    await tx`update movimientos_bancarios set fecha = ${FECHA_BUENA}::timestamptz where id = ${mb[0].id}`;
    const despues = await saldoEfectivoYb(tx);

    console.log(`\nefectivo YB al 10/10:  ${$(antes)}  ->  ${$(despues)}`);
    console.log(`contado por el salon:  $14.250`);

    if (Math.abs(despues - 14250) > 0.01) {
      throw new Error(
        `el resultado no da el conteo fisico ($14.250), da ${$(despues)}. No aplico.`,
      );
    }
    console.log("coincide con el conteo fisico.");

    if (!aplicar) {
      console.log("\nSIMULACION: se cancela. Corré con --aplicar para que quede.");
      throw new Error("ROLLBACK");
    }
    console.log("\nAPLICADO.");
  }).catch((e) => {
    if (!(e instanceof Error && e.message === "ROLLBACK")) throw e;
  });

  await sql.end();
}

main();
