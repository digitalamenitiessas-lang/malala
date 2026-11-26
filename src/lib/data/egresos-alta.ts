import { and, eq } from "drizzle-orm";
import type { getDb } from "@/lib/db/client/postgres";
import {
  aperturasCaja as aperturasCajaTable,
  cierresCaja as cierresCajaTable,
  proveedorSucursal as proveedorSucursalTable,
} from "@/lib/db/schema";
import { formatYmdAr } from "@/lib/fecha-ar";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Un gasto sólo se carga en un día con la caja abierta y sin cerrar. Lo usan
 * el gasto suelto (createEgreso) y la factura de proveedor entera.
 */
export async function verificarCajaParaGastoTx(tx: Tx, sucursalId: string, ymdFecha: string) {
  const [cierreDelDia] = await tx
    .select({ id: cierresCajaTable.id })
    .from(cierresCajaTable)
    .where(and(eq(cierresCajaTable.sucursalId, sucursalId), eq(cierresCajaTable.fecha, ymdFecha)))
    .limit(1);
  if (cierreDelDia) {
    throw new Error(
      `La caja del ${formatYmdAr(ymdFecha)} ya está cerrada para esta sucursal. Para cargarlo igual, entrá a Caja → Cierres anteriores, abrí el cierre del ${formatYmdAr(ymdFecha)} y tocá "Reabrir cierre". Si no, cargá el gasto con otra fecha.`,
    );
  }

  // Apertura obligatoria: no se puede cargar egresos si la caja de ese día
  // no fue abierta en esta sucursal.
  const [aperturaDelDia] = await tx
    .select({ id: aperturasCajaTable.id })
    .from(aperturasCajaTable)
    .where(and(eq(aperturasCajaTable.sucursalId, sucursalId), eq(aperturasCajaTable.fecha, ymdFecha)))
    .limit(1);
  if (!aperturaDelDia) {
    throw new Error(`Tenés que abrir la caja del ${ymdFecha} antes de cargar egresos.`);
  }
}

/**
 * Un proveedor al que la sucursal le compra queda habilitado en ella.
 *
 * Si no, su deuda no se ve: Yerba Buena le cargó tres productos a "QUESTION
 * (Raul)", que sólo estaba habilitado en Centro (llegó solo, por ser el único
 * proveedor del producto), y la deuda no aparecía en su lista (24/11/2026).
 */
export async function habilitarProveedorEnSucursalTx(tx: Tx, proveedorId: string, sucursalId: string) {
  await tx
    .insert(proveedorSucursalTable)
    .values({ id: crypto.randomUUID(), proveedorId, sucursalId })
    .onConflictDoNothing();
}
