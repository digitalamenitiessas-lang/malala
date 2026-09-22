/**
 * Recuento inicial de stock de Malala Centro (peluqueria/color), a partir del
 * conteo que paso el salon el 22-09-2026.
 *
 * Las tinturas empezadas se pesaron en bruto (con bowl, caja y pomo), asi que
 * el neto se calcula acá y queda a la vista de donde sale cada numero.
 *
 * Deja un movimiento de ajuste por insumo, no escribe el stock a mano: el
 * stock es un libro y tiene que poder explicarse.
 *
 * Uso: npx tsx scripts/import-centro-stock.ts [--aplicar]
 */
import "../envConfig";
import { getSqlClient } from "../src/lib/db/client/postgres";

const CE = "seed-000001";
const APLICAR = process.argv.includes("--aplicar");

// Taras del recuento del salon.
const BOWL = 184, CAJA = 10, POMO = 8;
const neto = (bruto: number, n: number, bowl = true, caja = true) =>
  bruto - (bowl ? BOWL : 0) - (caja ? n * CAJA : 0) - n * POMO;

/** Cada linea dice de donde sale el numero, para poder auditarlo despues. */
const RECUENTO: Array<{ insumo: string; cantidad: number; detalle: string }> = [
  {
    insumo: "Tintura con amoniaco Question",
    cantidad: 90 * 60 + neto(1369, 20) + neto(1277, 20) + neto(1482, 24),
    detalle: "90 u cerradas x 60 g + tres bowls de empezadas (825 + 733 + 866 g netos)",
  },
  {
    insumo: "Tintura Lumiplex sin amoniaco",
    cantidad: 28 * 60 + neto(56, 2, false, false) + neto(1337, 20),
    detalle: "28 u cerradas x 60 g + 2 u sueltas (40 g) + bowl de 20 u (793 g)",
  },
  { insumo: "Twelve (desenredante)", cantidad: 2 * 210, detalle: "2 u x 210 ml" },
  { insumo: "Colágeno Karseell", cantidad: 6 * 500, detalle: "6 mascaras x 500 ml" },
  { insumo: "Polvo decolorante SOW", cantidad: 4 * 500, detalle: "4 potes x 500 g" },
  { insumo: "Polvo decolorante Farmavita", cantidad: 381, detalle: "pote de 500 g empezado" },
  { insumo: "Alisado Luminoliss", cantidad: 669, detalle: "pote de 1 kg empezado" },
  {
    insumo: "Oxidante Lumiplex",
    cantidad: 900 + 900 + 865,
    detalle: "6 vol y 13 vol cerrados (900 ml c/u) + 13 vol empezado (865 ml)",
  },
  {
    // El catalogo tiene un solo "Oxidante" generico, asi que todas las marcas y
    // volumenes que no son Lumiplex entran al mismo pozo. Ver la nota del
    // informe: el sistema no distingue 10/20/30/40 vol.
    insumo: "Oxidante",
    cantidad: 900 + 2 * 900 + 2 * 1500 + 562 + 2829 + 1661 + 665 + 279 + 658,
    detalle:
      "10 vol 900 + 20 vol 2x900 + 30 vol exiline 2x1500 (deposito) + " +
      "30 vol exiline 562 + bidones exiline 20/6/40 vol 2829/1661/665 + " +
      "question 20 vol 279 + cadux 20 vol 658 (salon)",
  },
];

async function main() {
  const sql = getSqlClient();
  const [admin] = await sql`select user_id from profiles where rol='admin' order by email limit 1`;
  if (!admin) throw new Error("No hay un usuario admin para firmar el ajuste");

  const insumos = await sql`select id, nombre, unidad_medida from insumos where sucursal_id=${CE}`;
  const porNombre = new Map((insumos as any[]).map((i) => [i.nombre, i]));

  const plan: Array<{ id: string; nombre: string; unidad: string; cantidad: number; detalle: string }> = [];
  for (const r of RECUENTO) {
    const ins = porNombre.get(r.insumo);
    if (!ins) { console.log(`NO EXISTE en el catalogo: ${r.insumo}`); continue; }
    plan.push({ id: ins.id, nombre: ins.nombre, unidad: ins.unidad_medida, cantidad: r.cantidad, detalle: r.detalle });
  }

  console.log("Recuento a cargar:\n");
  for (const p of plan) {
    console.log(`  ${p.nombre.padEnd(32)} ${String(p.cantidad).padStart(7)} ${p.unidad}`);
    console.log(`     ${p.detalle}`);
  }

  if (!APLICAR) {
    console.log("\n-- SIMULACION. Correr con --aplicar. --");
    process.exit(0);
  }

  await sql.begin(async (tx) => {
    for (const p of plan) {
      const [actual] = await tx`select id, cantidad from stock_sucursal
        where insumo_id=${p.id} and sucursal_id=${CE}`;
      const previo = actual ? (actual as any).cantidad : 0;
      const delta = p.cantidad - previo;
      if (delta === 0) continue;
      if (actual) {
        await tx`update stock_sucursal set cantidad=${p.cantidad} where id=${(actual as any).id}`;
      } else {
        await tx`insert into stock_sucursal (id, insumo_id, sucursal_id, cantidad)
          values (${crypto.randomUUID()}, ${p.id}, ${CE}, ${p.cantidad})`;
      }
      await tx`insert into movimientos_stock
        (id, insumo_id, sucursal_id, cantidad, tipo, motivo, ref_tipo, ref_id, usuario_id, fecha)
        values (${crypto.randomUUID()}, ${p.id}, ${CE}, ${delta}, 'ajuste_manual',
          ${"Recuento inicial 22-09-2026 — " + p.detalle}, 'recuento', null,
          ${(admin as any).user_id}, now())`;
    }
  });

  console.log("\nCargado. Stock actual:");
  console.table(await sql`select i.nombre, s.cantidad, i.unidad_medida
    from stock_sucursal s join insumos i on i.id=s.insumo_id
    where s.sucursal_id=${CE} order by i.nombre`);
  process.exit(0);
}
main();
