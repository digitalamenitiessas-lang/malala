/**
 * Carga el recuento de REVENTA de Malala Yerba Buena (seed-000002) con la
 * planilla "Stock inicial para sistema_by ELU.xlsx" (26/10/2026), ya separada
 * en depósito y salón (exhibición). Ver drizzle/0071.
 *
 * Lo que hace, y sólo esto (lo acordado con Elu):
 *
 * 1. NOMBRES: cada producto pasa a llamarse como en la planilla, que trae los
 *    ml — "se parecen mucho entre sí y es la mejor manera de encontrarlos
 *    rápido y vender con el precio correcto".
 * 2. CANTIDADES: fija depósito y exhibición a lo contado, con movimientos de
 *    ajuste (motivo "Recuento reventa…"), así queda en la bitácora.
 * 3. DUPLICADOS: dos productos del sistema que Elu confirmó que son el mismo se
 *    unifican: el que sobra queda en 0 y se da de baja (no se borra: tiene
 *    historial).
 * 4. SIN STOCK: lo de peluquería que está como reventa y no figura en la
 *    planilla queda en 0 ("los dejamos en cero porque no tenemos stock").
 *
 * NO toca precios de costo ni de venta: "tomemos los que tenemos en el sistema
 * hoy". Tampoco bijou, cepillos, esmaltes, aceite de cutículas ni Prolash: Elu
 * no llegó a contarlos y quedan como están.
 *
 * El mapeo planilla → sistema está abajo, explícito, con las dudas que Elu
 * respondió. Quedan PENDIENTES (sin cargar): "Serum loreal 50ml_vitamino
 * color" (en el sistema sólo hay el de la línea Spectrum, que no es el mismo),
 * "Oil Absolut Repair 90ml" y "Fixer paste" (no existen: hay que darlos de alta
 * con precio).
 *
 * Las cantidades de la planilla son POTES; el stock va en la unidad base del
 * producto, así que se multiplican por el tamaño del envase.
 *
 * Corre contra la base que diga el entorno: en la VPS (NODE_ENV=production) es
 * la de producción. Dry-run salvo --commit. Va por lotes (ver LOTES): el
 * "26oct" es la planilla; el "27oct", lo que Elu contó después.
 * Uso: NODE_ENV=production npx tsx scripts/import-stock-reventa-yb.ts --lote <lote> [--commit]
 */
import "../envConfig";
import { and, eq } from "drizzle-orm";
import { getDb, getSqlClient } from "../src/lib/db/client/postgres";
import {
  insumos as insumosTable,
  profiles as profilesTable,
  stockSucursal as stockSucursalTable,
} from "../src/lib/db/schema";
import { applyMovementTx } from "../src/lib/data/stock";

const YB_ID = "seed-000002";
const USUARIO_EMAIL = "admin.yb@malala.com";
const MOTIVO = "Recuento reventa 26/10/2026 (planilla de Elu)";

/** Planilla → producto del sistema. deposito/salon en potes. */
const CARGA: Array<{ id: string; nombre: string; deposito: number; salon: number }> = [
  // "Karseell" es el que se vende; "Maca Power" es el mismo (ver BAJAS).
  { id: "yb-VPC121", nombre: "Mascara Karseell 500ml", deposito: 6, salon: 0 },
  { id: "2ed8e65a-a3ac-4ec4-b32d-e673ebccd53e", nombre: "Shampoo loreal 300ml _Pro Longer", deposito: 2, salon: 1 },
  { id: "yb-VPC136", nombre: "Shampoo loreal 300ml _Absolut Repair", deposito: 4, salon: 1 },
  { id: "yb-VPC118", nombre: "Shampoo loreal 300ml _Absolut Repair molecular", deposito: 0, salon: 1 },
  { id: "yb-VPC128", nombre: "Shampoo loreal 300ml_vitamino color", deposito: 0, salon: 2 },
  { id: "yb-VPC137", nombre: "Acondicionador loreal 200ml_Absolut Repair", deposito: 3, salon: 1 },
  { id: "yb-VPC130", nombre: "Acondicionador loreal 200ml_vitamino color", deposito: 1, salon: 2 },
  // Era "Keratin Alpha Sleek Smooth Transformer 200 ml": es el acondicionador.
  { id: "yb-VPC145", nombre: "Acondicionador loreal 200ml_kerathin alpha", deposito: 2, salon: 2 },
  { id: "yb-VPC131", nombre: "Mascara Loreal 200ml_vitamino color", deposito: 2, salon: 2 },
  { id: "yb-VPC138", nombre: "Mascara Loreal 200ml_Absolut Repair", deposito: 2, salon: 1 },
  // La planilla dice 200ml; Elu confirmó que es de 250ml.
  { id: "2c4ceaf9-1c01-43b6-bbc0-ebb633d959aa", nombre: "Mascara Loreal 250ml_Metal Detox", deposito: 2, salon: 1 },
  // Marcado "no se usa para reventa", pero sigue a la venta (sólo en pack).
  { id: "yb-VPC148", nombre: "Serum loreal 50ml_Kerathin Alpha", deposito: 2, salon: 1 },
  { id: "d0fd155e-b48a-426c-8a1b-169c144d13f3", nombre: "Serum loreal 50ml_Metal detox", deposito: 0, salon: 1 },
  { id: "yb-VPC101", nombre: "Small Talk Tigi 240ml", deposito: 3, salon: 1 },
  // "Serum tratamiento 30ml" y "step 3" son el mismo (ver BAJAS).
  { id: "yb-VPC103", nombre: "Wella Ultimate Repair 30ml", deposito: 10, salon: 2 },
  { id: "yb-VPC122", nombre: "Pearl Suero Argan 30ml", deposito: 2, salon: 5 },
  { id: "yb-VPC112", nombre: "Twelve 12 Question 210ml", deposito: 3, salon: 2 },
  // Marcado "no se usa para reventa", pero sigue a la venta (sólo en pack).
  { id: "yb-VPC117", nombre: "Absolut Repair molecular 250ml", deposito: 5, salon: 0 },
  { id: "yb-VPC119", nombre: "Oil Absolut Repair molecular 90ml", deposito: 5, salon: 1 },
  { id: "yb-VPC120", nombre: "Masque Absolut Repair molecular 100ml_mascara para peinar", deposito: 1, salon: 1 },
  { id: "e6ef2f63-6221-4a91-bf61-2b66793da8a0", nombre: "Curl Expression 190ml_activador de rulos", deposito: 1, salon: 1 },
  { id: "766d307d-df12-4a9e-b6a3-777d658be48a", nombre: "Volume fix volumen y brillo question 190ml_rulos", deposito: 2, salon: 2 },
  { id: "yb-VPC114", nombre: "Shampoo silver question_matizador", deposito: 3, salon: 1 },
  { id: "yb-VPC127", nombre: "Keratin lift spray question 210ml_shock efecto lifting", deposito: 1, salon: 1 },
  { id: "yb-VPC150", nombre: "Keratin lift oleo tratante question 75ml_reparador capilar termo activo", deposito: 0, salon: 1 },
  { id: "yb-VPC126", nombre: "Protector termico question 240 ml", deposito: 1, salon: 1 },
  { id: "yb-VPC129", nombre: "Spray 10en1 vitamino color_190ml", deposito: 0, salon: 2 },
  // Es el "Ultimate Smooth - Serum 30 ml" (step 3 de esa línea).
  { id: "yb-VPC108", nombre: "Serum step3 oil 30ml", deposito: 0, salon: 1 },
  { id: "yb-VPC107", nombre: "Ultimate smooth wella step2 intense mask 150ml", deposito: 0, salon: 1 },
  { id: "yb-VPC115", nombre: "After party Tigi 50ml", deposito: 0, salon: 1 },
  // Es el "Serum Antifrizz TIGI".
  { id: "yb-VPC116", nombre: "Straighten out Tigi_Anti frizz 100ml", deposito: 0, salon: 1 },
  { id: "yb-VPC139", nombre: "Shampoo Exiline biocell repair 300ml", deposito: 0, salon: 1 },
  { id: "yb-VPC140", nombre: "Acondicionador active repair Exiline biocell repair 300ml", deposito: 0, salon: 1 },
  { id: "yb-VPC141", nombre: "Serum Exiline biocell repair 100ml", deposito: 0, salon: 2 },
];

/** Duplicados confirmados por Elu: quedan en 0 y se dan de baja. */
const BAJAS: Array<{ id: string; motivo: string }> = [
  { id: "yb-VPC111", motivo: "Es el mismo que Mascara Karseell 500ml" },
  { id: "yb-VPC113", motivo: "Es el mismo que Wella Ultimate Repair 30ml" },
];

/** Reventa de peluquería que no está en la planilla: no hay stock. */
const SIN_STOCK = [
  "yb-VPC124", // Aceite KARSELL
  "yb-VPC100", // Bed Head TIGI
  "yb-VPC142", // Dual EXILINE
  "yb-VPC143", // mascara EXILINE
  "yb-VPC144", // Mascara Keratin Alpha Sleek 250 ml
  "f0ca6ffd-fe58-4cd3-805e-cb40fe7dfe68", // Mascara Pro Longer
  "yb-VPC134", // Mascara Vitamino Spectrum
  "yb-VPC149", // Óleo Lumière con Argán Question 75 ml
  "yb-VPC102", // Protector Térmico TIGI
  "2df2e4ce-9ded-46ea-bf8a-c25197a1325d", // Q Style Curl Cream Question 190 ml
  "yb-VPC152", // Q Style Curl Cream Question 235 ml
  "yb-VPC151", // Q Style Oil Molecular Flex Question 75 ml
  "yb-VPC110", // QUESTION - Shampoo
  "yb-VPC146", // Shampoo Keratin Alpha Sleek 300 ml
  "yb-VPC133", // Shampoo Vitamino Spectrum
  "yb-VPC105", // ULTIMATE REPAIR Mascara de tratamiento 150 ml
  "yb-VPC104", // ULTIMATE REPAIR Shampoo 250 ml
  "yb-VPC109", // ULTIMATE SMOOTH - Acondicionador 200 ml
  "yb-VPC106", // ULTIMATE SMOOTH - Shampoo 250 ml
  "yb-VPC132", // Vitamino Spectrum Acond
  // "Serum Vitamina Spectrum" NO: puede ser el serum vitamino color pendiente.
];

/**
 * Segundo lote (27/10/2026): lo que Elu contó después por WhatsApp. Sin
 * renombrar. Elu no dijo dónde están el serum, el cepillo y la vincha: van a
 * salón (exhibición), que es donde se venden.
 *
 * "Serum vitamino color: no tenemos stock. Solo en existencia 1 serum de
 * vitamino color spectrum" — el de la planilla no existe; el Spectrum sí.
 */
const CARGA_27OCT: Array<{ id: string; deposito: number; salon: number }> = [
  { id: "yb-VPC135", deposito: 0, salon: 1 }, // Serum Vitamina Spectrum
  { id: "ebac043c-205c-40b8-bbf7-c68a1b4cbfcb", deposito: 0, salon: 1 }, // Cepillo Antifriz
  { id: "1e2bd824-aaff-4f45-942d-d7b3fa5a82be", deposito: 4, salon: 5 }, // PROLASH EASY GEL MELANIA
  { id: "yb-VPC125", deposito: 0, salon: 0 }, // Aceite de cuticulas: sin stock
  { id: "26ddab8a-0bbb-4209-ac05-fc5a3aa9de33", deposito: 0, salon: 2 }, // vincha + colero + traba
];

/**
 * Cada lote se aplica una sola vez: fija cantidades absolutas, así que volver a
 * correr uno viejo pisaría las ventas que hubo desde entonces.
 */
const LOTES = {
  "26oct": { motivo: MOTIVO, carga: CARGA, bajas: BAJAS, sinStock: SIN_STOCK },
  "27oct": {
    motivo: "Recuento reventa 27/10/2026 (WhatsApp de Elu)",
    carga: CARGA_27OCT,
    bajas: [] as typeof BAJAS,
    sinStock: [] as string[],
  },
};

class DryRun extends Error {}

function fmt(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

async function main() {
  const commit = process.argv.includes("--commit");
  const i = process.argv.indexOf("--lote");
  const nombreLote = i >= 0 ? process.argv[i + 1] : "";
  if (!(nombreLote in LOTES)) {
    throw new Error(`Indicá el lote: --lote ${Object.keys(LOTES).join(" | ")}`);
  }
  const lote = LOTES[nombreLote as keyof typeof LOTES];
  const { carga: CARGA_L, bajas: BAJAS_L, sinStock: SIN_STOCK_L, motivo: MOTIVO_L } = lote;
  const db = getDb();

  const [usuario] = await db
    .select({ id: profilesTable.userId })
    .from(profilesTable)
    .where(eq(profilesTable.email, USUARIO_EMAIL))
    .limit(1);
  if (!usuario) throw new Error(`No existe el perfil ${USUARIO_EMAIL}`);

  const ids = [...CARGA_L.map((c) => c.id), ...BAJAS_L.map((b) => b.id), ...SIN_STOCK_L];
  if (new Set(ids).size !== ids.length) throw new Error("Hay un producto repetido en el mapeo");

  const lineas: string[] = [];
  try {
    await db.transaction(async (tx) => {
      /** Lleva depósito y exhibición a lo indicado, en unidad base. */
      async function fijar(
        insumoId: string,
        objetivo: { deposito: number; exhibido: number },
        motivo: string,
      ) {
        const [s] = await tx
          .select()
          .from(stockSucursalTable)
          .where(
            and(
              eq(stockSucursalTable.insumoId, insumoId),
              eq(stockSucursalTable.sucursalId, YB_ID),
            ),
          )
          .limit(1);
        const total = s?.cantidad ?? 0;
        const deposito = s?.cantidadDeposito ?? 0;
        const exhibido = total - deposito;
        const dDep = objetivo.deposito - deposito;
        const dExh = objetivo.exhibido - exhibido;
        const base = { insumo_id: insumoId, sucursal_id: YB_ID, tipo: "ajuste_manual" as const, motivo, usuario_id: usuario.id };
        if (Math.abs(dDep) > 1e-9) await applyMovementTx(tx, { ...base, delta: dDep, ubicacion: "deposito" });
        if (Math.abs(dExh) > 1e-9) await applyMovementTx(tx, { ...base, delta: dExh, ubicacion: "exhibicion" });
        return { antes: { exhibido, deposito } };
      }

      async function leerInsumo(id: string) {
        const [row] = await tx.select().from(insumosTable).where(eq(insumosTable.id, id)).limit(1);
        if (!row) throw new Error(`No existe el producto ${id}`);
        if (row.sucursalId !== YB_ID) throw new Error(`${row.nombre} no es de Yerba Buena`);
        if (row.tipo !== "venta") throw new Error(`${row.nombre} no es de reventa`);
        if (!row.activo) throw new Error(`${row.nombre} está dado de baja`);
        return row;
      }

      lineas.push(`=== CARGA · lote ${nombreLote} (nombre + depósito/salón) ===`);
      for (const c of CARGA_L) {
        const row = await leerInsumo(c.id);
        const tam = row.tamanoEnvase > 0 ? row.tamanoEnvase : 1;
        const { antes } = await fijar(c.id, { deposito: c.deposito * tam, exhibido: c.salon * tam }, MOTIVO_L);
        // Sin nombre en el lote, queda el que tiene.
        const nombre = "nombre" in c ? c.nombre : row.nombre;
        if (row.nombre !== nombre) {
          await tx.update(insumosTable).set({ nombre }).where(eq(insumosTable.id, c.id));
        }
        lineas.push(
          `  ${row.nombre === nombre ? nombre : `${row.nombre}  →  ${nombre}`}\n` +
            `      exhib. ${fmt(antes.exhibido / tam)} → ${c.salon} · dep. ${fmt(antes.deposito / tam)} → ${c.deposito}`,
        );
      }

      lineas.push("\n=== BAJAS_L (duplicados) ===");
      for (const b of BAJAS_L) {
        const row = await leerInsumo(b.id);
        const tam = row.tamanoEnvase > 0 ? row.tamanoEnvase : 1;
        const { antes } = await fijar(b.id, { deposito: 0, exhibido: 0 }, `${MOTIVO_L}: ${b.motivo}`);
        await tx.update(insumosTable).set({ activo: false }).where(eq(insumosTable.id, b.id));
        lineas.push(`  ${row.nombre}: stock ${fmt((antes.exhibido + antes.deposito) / tam)} → 0 y baja (${b.motivo})`);
      }

      lineas.push("\n=== SIN STOCK (quedan en 0) ===");
      for (const id of SIN_STOCK_L) {
        const row = await leerInsumo(id);
        const tam = row.tamanoEnvase > 0 ? row.tamanoEnvase : 1;
        const { antes } = await fijar(id, { deposito: 0, exhibido: 0 }, `${MOTIVO_L}: no hay stock`);
        lineas.push(`  ${row.nombre}: ${fmt((antes.exhibido + antes.deposito) / tam)} → 0`);
      }

      if (!commit) throw new DryRun();
    });
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  }

  console.log(lineas.join("\n"));
  console.log(`\nModo: ${commit ? "COMMIT — aplicado" : "DRY-RUN — no se tocó la base (corré con --commit)"}`);
  await getSqlClient().end({ timeout: 5 });
}

main().catch(async (err) => {
  console.error(err);
  await getSqlClient().end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
