import { and, eq, ilike, inArray, isNotNull, or } from "drizzle-orm";
import type { getDb } from "@/lib/db/client/postgres";
import { instanteEnFechaAr } from "@/lib/fecha-ar";
import {
  egresos as egresosTable,
  insumoProveedores as insumoProveedoresTable,
  insumos as insumosTable,
  proveedores as proveedoresTable,
  rubrosGasto as rubrosGastoTable,
} from "@/lib/db/schema";
import { numeroFactura, type LineaFactura, type PlanFactura } from "@/lib/factura-proveedor";
import { habilitarProveedorEnSucursalTx, verificarCajaParaGastoTx } from "./egresos-alta";
import { applyMovementTx } from "./stock";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export class FacturaRepetida extends Error {}

export interface CargaFactura {
  sucursalId: string;
  proveedorId: string;
  comprobante: string;
  /** numeroFactura(comprobante). */
  numero: string;
  ymdFecha: string;
  total: number;
  lineas: LineaFactura[];
  plan: PlanFactura;
  actualizarCosto: boolean;
  cargarIgual: boolean;
  usuarioId: string;
}

/**
 * Lo que hace registrarFacturaProveedor dentro de la transacción (ver ahí y
 * src/lib/factura-proveedor.ts). Aparte para poder probarlo contra una copia
 * de la base.
 */
export async function cargarFacturaTx(
  tx: Tx,
  {
    sucursalId,
    proveedorId,
    comprobante,
    numero,
    ymdFecha,
    total,
    lineas,
    plan,
    actualizarCosto,
    cargarIgual,
    usuarioId,
  }: CargaFactura,
) {
  const fechaInstante = new Date(instanteEnFechaAr(ymdFecha));
  await verificarCajaParaGastoTx(tx, sucursalId, ymdFecha);

  const [proveedor] = await tx
    .select({ id: proveedoresTable.id })
    .from(proveedoresTable)
    .where(eq(proveedoresTable.id, proveedorId))
    .for("update");
  if (!proveedor) throw new Error("El proveedor no existe");

  // La misma factura dos veces es pagarla dos veces. Se mira sólo esta
  // sucursal: una factura compartida (Loreal, 26/11/2026) la carga cada
  // sucursal con sus productos y su parte, con el mismo número.
  if (!cargarIgual) {
    const yaCargadas = await tx
      .select({ comprobante: egresosTable.comprobante, fecha: egresosTable.fecha })
      .from(egresosTable)
      .where(
        and(
          eq(egresosTable.proveedorId, proveedorId),
          eq(egresosTable.sucursalId, sucursalId),
          eq(egresosTable.anulado, false),
          isNotNull(egresosTable.comprobante),
        ),
      );
    const misma = yaCargadas.find((e) => numeroFactura(e.comprobante) === numero);
    if (misma) {
      throw new FacturaRepetida(
        `La factura ${misma.comprobante} de este proveedor ya está cargada en esta sucursal (${misma.fecha.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}). Si es otra factura, tildá "Es otra factura, cargarla igual".`,
      );
    }
  }

  const insumoIds = [...new Set(lineas.map((l) => l.insumoId))];
  const insumos = await tx
    .select({ id: insumosTable.id, nombre: insumosTable.nombre, tamanoEnvase: insumosTable.tamanoEnvase, tipo: insumosTable.tipo })
    .from(insumosTable)
    .where(and(inArray(insumosTable.id, insumoIds), eq(insumosTable.sucursalId, sucursalId)));
  const insumoDe = new Map(insumos.map((i) => [i.id, i]));
  const faltan = insumoIds.filter((id) => !insumoDe.has(id));
  if (faltan.length > 0) throw new Error("Algún producto no es de esta sucursal. Volvé a elegirlo.");

  const rubroId = await rubroInsumosTx(tx);
  await habilitarProveedorEnSucursalTx(tx, proveedorId, sucursalId);

  for (const [i, l] of lineas.entries()) {
    const insumo = insumoDe.get(l.insumoId)!;
    const egresoId = crypto.randomUUID();
    await tx.insert(egresosTable).values({
      id: egresoId,
      fecha: fechaInstante,
      sucursalId,
      rubroId,
      insumoId: l.insumoId,
      proveedorId,
      cantidad: l.cantidad,
      valor: l.valor,
      observacion: `Factura ${comprobante}`,
      comprobante,
      pagado: false,
      usuarioId: usuarioId,
    });
    // `cantidad` son envases; el stock va en la unidad base del insumo.
    await applyMovementTx(tx, {
      insumo_id: l.insumoId,
      sucursal_id: sucursalId,
      delta: l.cantidad * (insumo.tamanoEnvase || 1),
      tipo: "compra",
      motivo: `${l.cantidad} envase(s) · factura ${comprobante}`,
      ref_tipo: "egreso",
      ref_id: egresoId,
      usuario_id: usuarioId,
      ubicacion: insumo.tipo === "venta" ? "deposito" : undefined,
    });
    if (actualizarCosto) {
      const precioEnvase = plan.precioEnvase[i];
      await tx
        .update(insumosTable)
        .set({
          precioEnvase,
          precioUnitario: insumo.tamanoEnvase > 0 ? precioEnvase / insumo.tamanoEnvase : null,
        })
        .where(eq(insumosTable.id, l.insumoId));
    }
  }

  if (plan.diferencia > 0) {
    await tx.insert(egresosTable).values({
      id: crypto.randomUUID(),
      fecha: fechaInstante,
      sucursalId,
      rubroId,
      proveedorId,
      valor: plan.diferencia,
      observacion: `IVA, percepciones y otros · Factura ${comprobante}`,
      comprobante,
      pagado: false,
      usuarioId: usuarioId,
    });
  }

  // Comprarle a alguien es asociarlo al producto (como la compra suelta).
  await tx
    .insert(insumoProveedoresTable)
    .values(insumoIds.map((insumoId) => ({ id: crypto.randomUUID(), insumoId, proveedorId })))
    .onConflictDoNothing();

  const [actual] = await tx
    .select({ deuda: proveedoresTable.deudaPendiente })
    .from(proveedoresTable)
    .where(eq(proveedoresTable.id, proveedorId));
  await tx
    .update(proveedoresTable)
    .set({ deudaPendiente: (actual?.deuda ?? 0) + total })
    .where(eq(proveedoresTable.id, proveedorId));
}

async function rubroInsumosTx(tx: Tx): Promise<string> {
  const [existente] = await tx
    .select({ id: rubrosGastoTable.id })
    .from(rubrosGastoTable)
    .where(or(ilike(rubrosGastoTable.rubro, "insumos"), ilike(rubrosGastoTable.rubro, "insumo")))
    .limit(1);
  if (existente) return existente.id;
  const id = crypto.randomUUID();
  await tx.insert(rubrosGastoTable).values({ id, rubro: "Insumos", subrubro: null, activo: true });
  return id;
}
