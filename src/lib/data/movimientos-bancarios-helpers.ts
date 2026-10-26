import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client/postgres";
import {
  cuentaImpuestos as cuentaImpuestosTable,
  mediosPago as mediosPagoTable,
  movimientosBancarios as movimientosBancariosTable,
} from "@/lib/db/schema";

type DbOrTx = ReturnType<typeof getDb> | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

function createId() {
  return crypto.randomUUID();
}

export interface EmitMovArgs {
  cuentaId: string;
  fecha: Date;
  monto: number; // signo según naturaleza
  tipo: "ingreso" | "egreso" | "ajuste";
  sucursalId?: string | null;
  refTipo: string;
  refId: string;
  descripcion?: string | null;
  usuarioId: string;
}

export async function emitMovimientoBancarioTx(tx: DbOrTx, args: EmitMovArgs) {
  const movId = createId();
  await tx.insert(movimientosBancariosTable).values({
    id: movId,
    cuentaId: args.cuentaId,
    fecha: args.fecha,
    tipo: args.tipo,
    monto: args.monto,
    sucursalId: args.sucursalId ?? null,
    refTipo: args.refTipo,
    refId: args.refId,
    descripcion: args.descripcion ?? null,
    usuarioId: args.usuarioId,
  });

  await emitImpuestosCuentaTx(tx, args);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Genera, por cada impuesto activo de la cuenta cuya base aplique, un movimiento
 * de tipo "impuesto" (egreso) linkeado al movimiento que lo originó. Da
 * trazabilidad ("cuánto te come la cuenta") y deja el saldo igual al real del
 * banco, que ya retuvo/debitó ese impuesto.
 *
 * Solo se gravan ingresos y egresos reales: los ajustes, transferencias y los
 * propios movimientos de impuesto (refTipo="impuesto") no generan impuesto.
 */
async function emitImpuestosCuentaTx(tx: DbOrTx, args: EmitMovArgs) {
  if (args.tipo !== "ingreso" && args.tipo !== "egreso") return;
  if (args.refTipo === "impuesto") return;

  const impuestos = await tx
    .select()
    .from(cuentaImpuestosTable)
    .where(
      and(
        eq(cuentaImpuestosTable.cuentaId, args.cuentaId),
        eq(cuentaImpuestosTable.activo, true),
      ),
    );
  if (impuestos.length === 0) return;

  // ingreso = crédito (entra); egreso = débito (sale).
  const ladoMov = args.tipo === "ingreso" ? "credito" : "debito";
  const baseMonto = Math.abs(args.monto);

  for (const imp of impuestos) {
    const aplica = imp.base === "ambos" || imp.base === ladoMov;
    if (!aplica) continue;
    const monto = round2((baseMonto * imp.alicuotaPct) / 100);
    if (monto <= 0) continue;

    await tx.insert(movimientosBancariosTable).values({
      id: createId(),
      cuentaId: args.cuentaId,
      fecha: args.fecha,
      tipo: "impuesto",
      // El impuesto siempre resta de la cuenta (es un costo).
      monto: -monto,
      sucursalId: args.sucursalId ?? null,
      refTipo: "impuesto",
      // Mismo ref_id que el movimiento padre: al borrar/editar el egreso o venta,
      // deleteMovimientosByRefTx limpia también sus impuestos.
      refId: args.refId,
      descripcion: `${imp.nombre} ${imp.alicuotaPct}% s/ ${
        args.descripcion ?? (args.tipo === "ingreso" ? "cobro" : "pago")
      }`,
      usuarioId: args.usuarioId,
    });
  }
}

/**
 * Borra el movimiento de un origen y sus impuestos (que comparten ref_id pero
 * llevan ref_tipo "impuesto"). Filtra por ref_tipo además de ref_id: sin eso,
 * cualquier otro movimiento que apunte al mismo id —una anulación, por
 * ejemplo— se iba con el delete.
 */
export async function deleteMovimientosByRefTx(
  tx: DbOrTx,
  refTipo: string,
  refId: string,
) {
  await tx
    .delete(movimientosBancariosTable)
    .where(
      and(
        eq(movimientosBancariosTable.refId, refId),
        inArray(movimientosBancariosTable.refTipo, [refTipo, "impuesto"]),
      ),
    );
}

export async function getCuentaIdForMpTx(
  tx: DbOrTx,
  mpId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ cuentaId: mediosPagoTable.cuentaId })
    .from(mediosPagoTable)
    .where(eq(mediosPagoTable.id, mpId))
    .limit(1);
  return row?.cuentaId ?? null;
}
