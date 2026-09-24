/**
 * Recalcula los montos guardados de los cierres de caja a partir de las ventas
 * y gastos reales de cada día. Necesario porque los cierres viejos se guardaron
 * en cero (el cálculo usaba códigos de medio EF/TR/TC/TD que no existen en esta
 * base; los reales son EFECTIVO/TRASNFER/QR/TARJETA).
 *
 * Clasificación: efectivo = medios cuya cuenta es de tipo "efectivo"; el resto
 * va a "banco". Se excluye CC (fiado, no entra a caja). No toca saldo inicial,
 * billetes ni observaciones.
 *
 * Uso:
 *   npx tsx scripts/backfill-cierres.ts            (DRY-RUN: solo muestra)
 *   npx tsx scripts/backfill-cierres.ts --apply    (aplica los cambios)
 */
import "../envConfig";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../src/lib/db/client/postgres";
import {
  cierresCaja,
  cuentasBancarias,
  egresos,
  ingresos,
  mediosPago,
} from "../src/lib/db/schema";

const APPLY = process.argv.includes("--apply");

function dayRange(fecha: string) {
  return {
    desde: new Date(`${fecha}T00:00:00`),
    hasta: new Date(`${fecha}T23:59:59.999`),
  };
}

async function main() {
  const db = getDb();

  const medios = await db
    .select({
      id: mediosPago.id,
      codigo: mediosPago.codigo,
      cuentaId: mediosPago.cuentaId,
    })
    .from(mediosPago);
  const medioById = new Map(medios.map((m) => [m.id, m]));

  const cuentas = await db
    .select({ id: cuentasBancarias.id, tipo: cuentasBancarias.tipo })
    .from(cuentasBancarias);
  const efectivoCuentas = new Set(
    cuentas.filter((c) => c.tipo === "efectivo").map((c) => c.id),
  );

  const esCC = (medioId: string) => medioById.get(medioId)?.codigo === "CC";
  const esEfectivo = (medioId: string) => {
    const m = medioById.get(medioId);
    return !!m && m.cuentaId != null && efectivoCuentas.has(m.cuentaId);
  };

  const cierres = await db.select().from(cierresCaja);
  console.log(
    `\n${APPLY ? "APLICANDO" : "DRY-RUN (no escribe)"} · ${cierres.length} cierres\n`,
  );

  let cambios = 0;
  for (const c of cierres) {
    const { desde, hasta } = dayRange(c.fecha);

    const ings = await db
      .select({
        mp1Id: ingresos.mp1Id,
        valor1: ingresos.valor1,
        mp2Id: ingresos.mp2Id,
        valor2: ingresos.valor2,
      })
      .from(ingresos)
      .where(
        and(
          eq(ingresos.sucursalId, c.sucursalId),
          eq(ingresos.anulado, false),
          gte(ingresos.fecha, desde),
          lte(ingresos.fecha, hasta),
        ),
      );

    const egrs = await db
      .select({ mpId: egresos.mpId, valor: egresos.valor })
      .from(egresos)
      .where(
        and(
          eq(egresos.sucursalId, c.sucursalId),
          eq(egresos.pagado, true),
          gte(egresos.fecha, desde),
          lte(egresos.fecha, hasta),
        ),
      );

    let ingEf = 0;
    let ingResto = 0;
    let egEf = 0;
    let egResto = 0;

    for (const r of ings) {
      if (!esCC(r.mp1Id)) {
        if (esEfectivo(r.mp1Id)) ingEf += r.valor1;
        else ingResto += r.valor1;
      }
      if (r.mp2Id && r.valor2 != null && !esCC(r.mp2Id)) {
        if (esEfectivo(r.mp2Id)) ingEf += r.valor2;
        else ingResto += r.valor2;
      }
    }
    for (const r of egrs) {
      // Sin medio de pago el gasto quedó a pagar (cuenta corriente del
      // proveedor): no movió la caja de ese día.
      if (!r.mpId || esCC(r.mpId)) continue;
      if (esEfectivo(r.mpId)) egEf += r.valor;
      else egResto += r.valor;
    }

    const cambia =
      c.ingresosEf !== ingEf ||
      c.egresosEf !== egEf ||
      c.ingresosBanc !== ingResto ||
      c.egresosBanc !== egResto ||
      c.cobrosTc !== 0 ||
      c.cobrosTd !== 0;

    const totalNuevo = ingEf + ingResto;
    console.log(
      `  ${c.fecha} | antes: ingEf=${c.ingresosEf} banc=${c.ingresosBanc} TC=${c.cobrosTc} TD=${c.cobrosTd}` +
        `  →  ahora: ingEf=${ingEf} egEf=${egEf} banc=${ingResto} egBanc=${egResto} | total=${totalNuevo}${cambia ? "  *" : ""}`,
    );

    if (cambia) {
      cambios += 1;
      if (APPLY) {
        await db
          .update(cierresCaja)
          .set({
            ingresosEf: ingEf,
            egresosEf: egEf,
            ingresosBanc: ingResto,
            egresosBanc: egResto,
            cobrosTc: 0,
            cobrosTd: 0,
          })
          .where(eq(cierresCaja.id, c.id));
      }
    }
  }

  console.log(
    `\n${APPLY ? "✓ Aplicado" : "DRY-RUN"}: ${cambios} cierres ${APPLY ? "actualizados" : "cambiarían"} (de ${cierres.length}).` +
      `${APPLY ? "" : "\nPara aplicar: npx tsx scripts/backfill-cierres.ts --apply"}\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
