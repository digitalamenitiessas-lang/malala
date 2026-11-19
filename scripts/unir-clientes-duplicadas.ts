/**
 * Une las clientas repetidas de una sucursal que son seguro la misma persona,
 * y completa el teléfono normalizado de las que lo tienen vacío.
 *
 * Pedido de Yerba Buena el 19/11/2026: "se están duplicando los clientes".
 * Criterio en src/lib/clientes-duplicadas.ts: mismo teléfono y mismo nombre
 * escrito de otra forma, o mismo nombre exacto sin teléfonos que choquen. Las
 * que comparten número con nombres distintos (familias) NO se tocan: se
 * listan como dudosas para preguntarle al salón.
 *
 * Corre en modo prueba (no escribe nada) salvo que se pase --aplicar. Al
 * aplicar deja en --registro las filas de cada clienta como estaban.
 *
 * Uso:
 *   npx tsx scripts/unir-clientes-duplicadas.ts --sucursal seed-000002 [--aplicar] [--registro archivo.json]
 */
import "../envConfig";
import fs from "node:fs";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, getSqlClient } from "../src/lib/db/client/postgres";
import {
  clienteSucursal as clienteSucursalTable,
  clientes as clientesTable,
} from "../src/lib/db/schema";
import { planDuplicadas } from "../src/lib/clientes-duplicadas";
import { unirClientasEnTx } from "../src/lib/data/clientes-unir";
import { tryNormalizarTelefonoAR } from "../src/lib/phone";

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const sucursalId = arg("--sucursal");
  if (!sucursalId) throw new Error("Falta --sucursal <id>");
  const aplicar = process.argv.includes("--aplicar");
  const registro = arg("--registro") ?? `unir-clientes-${sucursalId}-${Date.now()}.json`;
  const db = getDb();

  const clientes = await db
    .select({
      id: clientesTable.id,
      nombre: clientesTable.nombre,
      telefono: clientesTable.telefono,
      telefono_e164: clientesTable.telefonoE164,
      ventas: sql<number>`(select count(*)::int from ingresos i where i.cliente_id = ${clientesTable.id} and not i.anulado)`,
    })
    .from(clientesTable)
    .innerJoin(clienteSucursalTable, eq(clienteSucursalTable.clienteId, clientesTable.id))
    .where(eq(clienteSucursalTable.sucursalId, sucursalId));

  const plan = planDuplicadas(clientes);
  const fichasMenos = plan.unir.reduce((s, g) => s + g.unir.length, 0);
  const desc = (c: (typeof clientes)[number]) =>
    `${c.nombre} [${c.telefono ?? "sin tel"}, ${c.ventas} ventas]`;

  console.log(`Clientas de ${sucursalId}: ${clientes.length}`);
  console.log(`Grupos a unir: ${plan.unir.length} (quedan ${fichasMenos} fichas menos)\n`);
  for (const g of plan.unir) {
    console.log(`  [${g.motivo}] queda ${desc(g.queda)}`);
    for (const o of g.unir) console.log(`      ← ${desc(o)}`);
  }
  console.log(`\nDudosos (mismo teléfono, nombres distintos; no se tocan): ${plan.dudosos.length}`);
  for (const d of plan.dudosos) {
    console.log(`  ${d.telefono}: ${d.clientes.map((c) => c.nombre).join(" / ")}`);
  }

  if (!aplicar) {
    console.log("\nModo prueba: no se cambió nada. Para aplicar, --aplicar.");
    return;
  }

  const antes: unknown[] = [];
  for (const g of plan.unir) {
    const filas = await db.transaction((tx) =>
      unirClientasEnTx(tx, g.queda.id, g.unir.map((c) => c.id)),
    );
    antes.push({ queda: g.queda.id, unidas: g.unir.map((c) => c.id), filas });
  }
  fs.writeFileSync(registro, JSON.stringify(antes, null, 2));
  console.log(`\nUnidos ${plan.unir.length} grupos. Registro: ${registro}`);

  // Teléfono normalizado de las que quedaron sin él (ver src/lib/phone.ts). Si
  // el número ya es de otra ficha, se deja vacío: es uno de los dudosos.
  const sinE164 = await db
    .select({ id: clientesTable.id, telefono: clientesTable.telefono })
    .from(clientesTable)
    .innerJoin(clienteSucursalTable, eq(clienteSucursalTable.clienteId, clientesTable.id))
    .where(
      and(
        eq(clienteSucursalTable.sucursalId, sucursalId),
        isNull(clientesTable.telefonoE164),
        isNotNull(clientesTable.telefono),
      ),
    );
  let completadas = 0;
  let ocupadas = 0;
  for (const c of sinE164) {
    const e164 = tryNormalizarTelefonoAR(c.telefono);
    if (!e164) continue;
    const [ya] = await db
      .select({ id: clientesTable.id })
      .from(clientesTable)
      .where(eq(clientesTable.telefonoE164, e164))
      .limit(1);
    if (ya) {
      ocupadas++;
      continue;
    }
    await db.update(clientesTable).set({ telefonoE164: e164 }).where(eq(clientesTable.id, c.id));
    completadas++;
  }
  console.log(`Teléfono normalizado completado: ${completadas} (otras ${ocupadas} comparten número con otra ficha)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => getSqlClient().end());
