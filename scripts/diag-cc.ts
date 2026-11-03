/**
 * Diagnóstico SOLO LECTURA del medio "Cuenta corriente" duplicado: muestra cada
 * registro CC y cuántas referencias tiene en cada tabla, para decidir cuál
 * conservar. No modifica nada.
 *
 * Uso: npx tsx scripts/diag-cc.ts
 */
import "../envConfig";
import { eq, or } from "drizzle-orm";
import { getDb } from "../src/lib/db/client/postgres";
import {
  anticipos,
  egresos,
  ingresos,
  liquidaciones,
  mediosPago,
  movimientosCc,
} from "../src/lib/db/schema";

async function count(rows: { length: number }) {
  return rows.length;
}

async function main() {
  const db = getDb();

  const ccs = await db
    .select()
    .from(mediosPago)
    .where(eq(mediosPago.codigo, "CC"));

  console.log(`\n=== Medios CC encontrados: ${ccs.length} ===`);
  for (const cc of ccs) {
    const [ing, egr, liq, mcc, ant] = await Promise.all([
      db
        .select({ id: ingresos.id })
        .from(ingresos)
        .where(
          or(
            eq(ingresos.mp1Id, cc.id),
            eq(ingresos.mp2Id, cc.id),
            eq(ingresos.mp3Id, cc.id),
          ),
        )
        .then(count),
      db.select({ id: egresos.id }).from(egresos).where(eq(egresos.mpId, cc.id)).then(count),
      db
        .select({ id: liquidaciones.id })
        .from(liquidaciones)
        .where(eq(liquidaciones.mpId, cc.id))
        .then(count),
      db
        .select({ id: movimientosCc.id })
        .from(movimientosCc)
        .where(eq(movimientosCc.mpId, cc.id))
        .then(count),
      db.select({ id: anticipos.id }).from(anticipos).where(eq(anticipos.mpId, cc.id)).then(count),
    ]);
    const total = ing + egr + liq + mcc + ant;
    console.log(
      `\n  id=${cc.id}\n  sucursal=${cc.sucursalId} | nombre="${cc.nombre}" | activo=${cc.activo} | cuenta=${cc.cuentaId ?? "-"}\n  refs: ingresos=${ing} egresos=${egr} liquidaciones=${liq} movimientos_cc=${mcc} anticipos=${ant}  → TOTAL=${total}`,
    );
  }
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
