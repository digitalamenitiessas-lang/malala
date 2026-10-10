/**
 * Solo lectura: los movimientos de cuenta corriente de un cliente, con su
 * reverso si lo tiene y el movimiento de caja que genero cada uno.
 *
 * Uso: npx tsx scripts/ver-cc-cliente.ts "Carolina Prieto"
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const nombre = process.argv[2] ?? "Carolina Prieto";
const sql = postgres(url, { max: 1, prepare: false });

const $ = (n: unknown) =>
  (Number(n) < 0 ? "-$" : "$") + Math.abs(Number(n)).toLocaleString("es-AR");

async function main() {
  const rows = await sql`
    select
      m.id, m.tipo, m.monto, m.descripcion, m.ref_tipo, m.ref_id,
      to_char(m.fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD HH24:MI') as fecha,
      mp.codigo as medio,
      c.nombre as cliente
    from movimientos_cc m
    join clientes c on c.id = m.cliente_id
    left join medios_pago mp on mp.id = m.mp_id
    where c.nombre ilike ${"%" + nombre + "%"}
    order by m.fecha, m.id
  `;

  console.log(`\nCuenta corriente · ${nombre}\n`);
  let saldo = 0;
  for (const r of rows) {
    saldo += Number(r.monto);
    console.log(
      `  ${r.fecha}  ${r.tipo.padEnd(6)} ${$(r.monto).padStart(11)}` +
        `  saldo ${$(saldo).padStart(11)}  ${r.medio ?? "-"}` +
        `  ${r.descripcion ?? ""}`,
    );
    console.log(`      id=${r.id}  ref=${r.ref_tipo ?? "-"}/${r.ref_id ?? "-"}`);
  }
  console.log(`\n  SALDO FINAL: ${$(saldo)}  (positivo = debe)`);

  // El movimiento de caja que genero cada pago, para ver en que dia cayo.
  console.log(`\nMovimientos de caja atados a estos pagos:`);
  const caja = await sql`
    select
      to_char(mb.fecha at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD HH24:MI') as fecha,
      mb.monto, mb.descripcion, cu.nombre as cuenta, mb.ref_id
    from movimientos_bancarios mb
    join cuentas_bancarias cu on cu.id = mb.cuenta_id
    where mb.ref_id in ${sql(rows.map((r) => r.id as string))}
    order by mb.fecha
  `;
  if (caja.length === 0) console.log("  (ninguno)");
  for (const r of caja) {
    console.log(
      `  ${r.fecha}  ${$(r.monto).padStart(11)}  ${r.cuenta}  ${r.descripcion ?? ""}`,
    );
  }

  await sql.end();
}

main();
