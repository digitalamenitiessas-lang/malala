/**
 * Carga los packs de sesiones que están vigentes y hoy viven sólo en un Excel.
 *
 * Un pack es plata cobrada por adelantado por servicios que todavía no se
 * prestaron: exactamente lo mismo que una gift card. Por eso se cargan como
 * gift card y no hay que inventar nada — el saldo baja solo a medida que se
 * usan las sesiones, y cada sesión se le puede asignar a la profesional que la
 * hizo, que es justo lo que el Excel no podía hacer.
 *
 * Van marcados `emitida_pre_sistema = true` porque esa plata entró en julio y
 * septiembre, fuera del sistema. Sin esa marca, emitirlos hoy metería el
 * importe en la caja de hoy como si hubiera entrado hoy.
 *
 * El saldo que se carga es el REMANENTE, no el importe: las sesiones ya usadas
 * están en el Excel con su fecha y no se vuelven a cobrar.
 *
 *   npx tsx scripts/import-packs-vigentes-yb.ts            (dry-run)
 *   npx tsx scripts/import-packs-vigentes-yb.ts --commit
 */
import "../envConfig";
import { getDb, getSqlClient } from "../src/lib/db/client/postgres";
import {
  giftCards as giftCardsTable,
  giftCardMovimientos as giftCardMovimientosTable,
  profiles as profilesTable,
} from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

const YB_ID = "seed-000002";
const PRECIO_SESION = 30000; // pack de 4 masajes de 1 hora: $120.000 / 4

interface PackVigente {
  codigo: string;
  beneficiaria: string;
  /** Packs comprados juntos el mismo día (Mariana compró 2). */
  packs: number;
  sesionesUsadas: number;
  fechaPago: string; // ISO
  detalle: string;
}

// Del Excel "packs de masajes" que pasó el salón el 24/09/2026.
const PACKS: PackVigente[] = [
  {
    codigo: "PACK-001",
    beneficiaria: "Mariana Carlino",
    packs: 2,
    sesionesUsadas: 0,
    fechaPago: "2026-09-12",
    detalle: "2 packs comprados juntos el 12/09, ninguna sesión usada.",
  },
  {
    codigo: "PACK-002",
    beneficiaria: "Nathalia Herrera",
    packs: 1,
    // El Excel marca dos sesiones usadas (17/09 y 24/09), pero la del 24/09 se
    // estaba cargando en el sistema cuando se armó esto: si se descontara acá,
    // al registrar la venta se descontaría de nuevo y la profesional perdería
    // la comisión de hoy. Se descuenta sólo la del 17/09, que no se registró.
    sesionesUsadas: 1,
    fechaPago: "2026-09-17",
    detalle:
      "Pack del 17/09. La sesión del 17/09 se hizo antes de llevar los packs " +
      "en el sistema y no se registró como venta; la del 24/09 se carga normal.",
  },
];

async function main() {
  const commit = process.argv.includes("--commit");
  const db = getDb();

  const [usuario] = await db
    .select({ id: profilesTable.userId })
    .from(profilesTable)
    .where(eq(profilesTable.rol, "admin"))
    .limit(1);
  if (!usuario) throw new Error("No hay un usuario admin para atribuir la carga");

  const existentes = await db
    .select({ codigo: giftCardsTable.codigo })
    .from(giftCardsTable)
    .where(eq(giftCardsTable.sucursalId, YB_ID));
  const yaCargados = new Set(existentes.map((g) => g.codigo));

  const aCargar = PACKS.filter((p) => {
    if (yaCargados.has(p.codigo)) {
      console.log(`  ${p.codigo} ya existe, se saltea.`);
      return false;
    }
    return true;
  });

  console.log("PACKS VIGENTES A CARGAR\n");
  for (const p of aCargar) {
    const sesiones = p.packs * 4;
    const restantes = sesiones - p.sesionesUsadas;
    console.log(
      `  ${p.codigo}  ${p.beneficiaria}\n` +
        `     ${p.packs} pack(s) = ${sesiones} sesiones · usadas ${p.sesionesUsadas} · quedan ${restantes}\n` +
        `     importe $${(sesiones * PRECIO_SESION).toLocaleString("es-AR")} · saldo $${(restantes * PRECIO_SESION).toLocaleString("es-AR")}\n` +
        `     pagado el ${p.fechaPago}`,
    );
  }

  if (!commit) {
    console.log("\nDRY-RUN: no se tocó la base. Corré con --commit.");
    await getSqlClient().end({ timeout: 5 });
    return;
  }
  if (aCargar.length === 0) {
    console.log("\nNo hay nada para cargar.");
    await getSqlClient().end({ timeout: 5 });
    return;
  }

  await db.transaction(async (tx) => {
    for (const p of aCargar) {
      const sesiones = p.packs * 4;
      const restantes = sesiones - p.sesionesUsadas;
      const importe = sesiones * PRECIO_SESION;
      const saldo = restantes * PRECIO_SESION;
      const fecha = new Date(`${p.fechaPago}T12:00:00.000Z`);
      const id = crypto.randomUUID();

      await tx.insert(giftCardsTable).values({
        id,
        sucursalId: YB_ID,
        codigo: p.codigo,
        importe,
        saldo,
        estado: "activa",
        fechaEmision: fecha,
        venceEl: null, // el salón todavía no les pone vencimiento
        compradora: p.beneficiaria,
        beneficiaria: p.beneficiaria,
        observacion:
          `PACK DE MASAJES · ${sesiones} sesiones de 1 hora a $${PRECIO_SESION.toLocaleString("es-AR")} c/u. ` +
          `${p.detalle} Cargá cada sesión como el masaje normal a $40.000 con la profesional, ` +
          `aplicá el descuento con motivo "Pack de sesiones" y cobrá con esta gift card.`,
        emitidaPreSistema: true,
        usuarioId: usuario.id,
      });

      await tx.insert(giftCardMovimientosTable).values({
        id: crypto.randomUUID(),
        giftCardId: id,
        fecha,
        tipo: "emision",
        monto: importe,
        saldoResultante: saldo,
        ingresoId: null,
        descripcion:
          `Pack vendido el ${p.fechaPago}, antes de que los packs se llevaran en el sistema. ` +
          `Esa plata ya entró en su momento, así que no cuenta como venta de hoy. ` +
          (p.sesionesUsadas > 0
            ? `Arranca con ${p.sesionesUsadas} sesiones ya usadas descontadas.`
            : `Arranca con las ${sesiones} sesiones sin usar.`),
        usuarioId: usuario.id,
      });
    }
  });

  console.log(`\nCargados ${aCargar.length} packs.`);
  await getSqlClient().end({ timeout: 5 });
}

main();
