"use server";

import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import {
  buildAccessScope,
  isSucursalAllowed,
} from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { hoyAr } from "@/lib/fecha-ar";
import {
  aperturasCaja as aperturasCajaTable,
  cierresCaja as cierresCajaTable,
  egresos as egresosTable,
  insumos as insumosTable,
  mediosPago as mediosPagoTable,
  proveedores as proveedoresTable,
  rubrosGasto as rubrosGastoTable,
  sucursales as sucursalesTable,
} from "@/lib/db/schema";
import { fieldErrors, requireRole, type ActionResult } from "./_helpers";
import { egresoSchema } from "@/lib/validations/egreso";
import { applyMovementTx } from "./stock";
import {
  deleteMovimientosByRefTx,
  emitMovimientoBancarioTx,
  getCuentaIdForMpTx,
} from "./movimientos-bancarios-helpers";
import type {
  Egreso,
  Insumo,
  MedioPago,
  Proveedor,
  RubroGasto,
  Sucursal,
} from "@/lib/types";
import type { EgresoConDetalle } from "./egresos-helpers";

export interface EgresoFiltros {
  sucursalId?: string;
  rubroId?: string;
  proveedorId?: string;
  desde?: string; // ISO
  hasta?: string; // ISO
  soloPendientes?: boolean;
}

function createId() {
  return crypto.randomUUID();
}

function mapEgreso(row: typeof egresosTable.$inferSelect): Egreso {
  return {
    id: row.id,
    fecha: row.fecha.toISOString(),
    sucursal_id: row.sucursalId,
    rubro_id: row.rubroId,
    insumo_id: row.insumoId ?? undefined,
    proveedor_id: row.proveedorId ?? undefined,
    cantidad: row.cantidad ?? undefined,
    valor: row.valor,
    mp_id: row.mpId,
    mp1_cuenta_id: row.mp1CuentaId ?? undefined,
    mp2_id: row.mp2Id ?? undefined,
    valor2: row.valor2 ?? undefined,
    mp2_cuenta_id: row.mp2CuentaId ?? undefined,
    observacion: row.observacion ?? undefined,
    pagado: row.pagado,
    usuario_id: row.usuarioId,
  };
}

function mapRubro(row: typeof rubrosGastoTable.$inferSelect): RubroGasto {
  return {
    id: row.id,
    rubro: row.rubro,
    subrubro: row.subrubro ?? undefined,
    activo: row.activo,
  };
}

function mapSucursal(row: typeof sucursalesTable.$inferSelect): Sucursal {
  return {
    id: row.id,
    nombre: row.nombre,
    activo: row.activo,
    slug: row.slug ?? undefined,
    direccion: row.direccion ?? undefined,
    telefono: row.telefono ?? undefined,
    horario_resumen: row.horarioResumen ?? undefined,
    rating: row.rating ?? undefined,
    reviews: row.reviews ?? undefined,
    mapa_url: row.mapaUrl ?? undefined,
    descripcion_corta: row.descripcionCorta ?? undefined,
  };
}

function mapInsumo(row: typeof insumosTable.$inferSelect): Insumo {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    nombre: row.nombre,
    codigo: row.codigo ?? undefined,
    unidad_medida: row.unidadMedida,
    tamano_envase: row.tamanoEnvase,
    precio_envase: row.precioEnvase,
    precio_unitario: row.precioUnitario ?? null,
    rinde: row.rinde ?? undefined,
    umbral_stock_bajo: row.umbralStockBajo,
    activo: row.activo,
    tipo: row.tipo,
    vendible: row.vendible,
    precio_venta: row.precioVenta ?? undefined,
  };
}

function mapProveedor(row: typeof proveedoresTable.$inferSelect): Proveedor {
  return {
    id: row.id,
    nombre: row.nombre,
    telefono: row.telefono ?? undefined,
    cuit: row.cuit ?? undefined,
    deuda_pendiente: row.deudaPendiente,
  };
}

function mapMedioPago(row: typeof mediosPagoTable.$inferSelect): MedioPago {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    codigo: row.codigo,
    nombre: row.nombre,
    activo: row.activo,
    cuenta_id: row.cuentaId ?? undefined,
    recargo_pct: row.recargoPct,
  };
}

async function loadEgresoLookups(egresos: Egreso[]) {
  const db = getDb();
  const rubroIds = Array.from(new Set(egresos.map((item) => item.rubro_id)));
  const sucursalIds = Array.from(new Set(egresos.map((item) => item.sucursal_id)));
  const insumoIds = Array.from(
    new Set(egresos.map((item) => item.insumo_id).filter(Boolean)),
  ) as string[];
  const proveedorIds = Array.from(
    new Set(egresos.map((item) => item.proveedor_id).filter(Boolean)),
  ) as string[];
  const medioPagoIds = Array.from(
    new Set(
      egresos
        .flatMap((item) => [item.mp_id, item.mp2_id])
        .filter(Boolean) as string[],
    ),
  );

  const [rubrosRows, sucursalesRows, insumosRows, proveedoresRows, mediosPagoRows] =
    await Promise.all([
      rubroIds.length > 0
        ? db
            .select()
            .from(rubrosGastoTable)
            .where(inArray(rubrosGastoTable.id, rubroIds))
        : Promise.resolve([]),
      sucursalIds.length > 0
        ? db
            .select()
            .from(sucursalesTable)
            .where(inArray(sucursalesTable.id, sucursalIds))
        : Promise.resolve([]),
      insumoIds.length > 0
        ? db
            .select()
            .from(insumosTable)
            .where(inArray(insumosTable.id, insumoIds))
        : Promise.resolve([]),
      proveedorIds.length > 0
        ? db
            .select()
            .from(proveedoresTable)
            .where(inArray(proveedoresTable.id, proveedorIds))
        : Promise.resolve([]),
      medioPagoIds.length > 0
        ? db
            .select()
            .from(mediosPagoTable)
            .where(inArray(mediosPagoTable.id, medioPagoIds))
        : Promise.resolve([]),
    ]);

  return {
    rubrosById: new Map(rubrosRows.map((item) => [item.id, mapRubro(item)])),
    sucursalesById: new Map(
      sucursalesRows.map((item) => [item.id, mapSucursal(item)]),
    ),
    insumosById: new Map(insumosRows.map((item) => [item.id, mapInsumo(item)])),
    proveedoresById: new Map(
      proveedoresRows.map((item) => [item.id, mapProveedor(item)]),
    ),
    mediosPagoById: new Map(
      mediosPagoRows.map((item) => [item.id, mapMedioPago(item)]),
    ),
  };
}

function detallar(
  egresos: Egreso[],
  lookups: Awaited<ReturnType<typeof loadEgresoLookups>>,
): EgresoConDetalle[] {
  return egresos.map((egreso) => ({
    egreso,
    rubro: lookups.rubrosById.get(egreso.rubro_id) ?? null,
    sucursal: lookups.sucursalesById.get(egreso.sucursal_id) ?? null,
    insumo: egreso.insumo_id
      ? (lookups.insumosById.get(egreso.insumo_id) ?? null)
      : null,
    proveedor: egreso.proveedor_id
      ? (lookups.proveedoresById.get(egreso.proveedor_id) ?? null)
      : null,
    mp: lookups.mediosPagoById.get(egreso.mp_id) ?? null,
    mp2: egreso.mp2_id
      ? (lookups.mediosPagoById.get(egreso.mp2_id) ?? null)
      : null,
  }));
}

export async function listEgresos(
  filtros: EgresoFiltros = {},
): Promise<EgresoConDetalle[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);

  if (filtros.sucursalId && !isSucursalAllowed(scope, filtros.sucursalId)) {
    return [];
  }

  const filters = [inArray(egresosTable.sucursalId, scope.sucursalIdsPermitidas)];
  if (filtros.sucursalId) {
    filters.push(eq(egresosTable.sucursalId, filtros.sucursalId));
  }
  if (filtros.rubroId) {
    filters.push(eq(egresosTable.rubroId, filtros.rubroId));
  }
  if (filtros.proveedorId) {
    filters.push(eq(egresosTable.proveedorId, filtros.proveedorId));
  }
  if (filtros.desde) {
    filters.push(gte(egresosTable.fecha, new Date(filtros.desde)));
  }
  if (filtros.hasta) {
    filters.push(lte(egresosTable.fecha, new Date(filtros.hasta)));
  }
  if (filtros.soloPendientes) {
    filters.push(eq(egresosTable.pagado, false));
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(egresosTable)
    .where(and(...filters))
    .orderBy(desc(egresosTable.fecha));

  const egresos = rows.map(mapEgreso);
  if (egresos.length === 0) return [];

  const lookups = await loadEgresoLookups(egresos);
  return detallar(egresos, lookups);
}

export async function getEgreso(
  egresoId: string,
): Promise<EgresoConDetalle | null> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();
  const [row] = await db
    .select()
    .from(egresosTable)
    .where(eq(egresosTable.id, egresoId))
    .limit(1);

  if (!row) return null;
  if (!scope.sucursalIdsPermitidas.includes(row.sucursalId)) return null;

  const egreso = mapEgreso(row);
  const lookups = await loadEgresoLookups([egreso]);
  return detallar([egreso], lookups)[0] ?? null;
}

export type CreateEgresoResult =
  | { ok: true; egresoId: string }
  | { ok: false; errors: Record<string, string[]> };

/**
 * Crea un egreso.
 * - Si hay insumo + cantidad, registra entrada de stock.
 * - Si queda pendiente y tiene proveedor, suma a deuda_pendiente.
 */
export async function createEgreso(
  _prev: CreateEgresoResult | null,
  formData: FormData,
): Promise<CreateEgresoResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);

  const parsed = egresoSchema.safeParse({
    fecha: formData.get("fecha"),
    sucursal_id: formData.get("sucursal_id"),
    rubro_id: formData.get("rubro_id"),
    insumo_id: formData.get("insumo_id"),
    proveedor_id: formData.get("proveedor_id"),
    cantidad: formData.get("cantidad"),
    valor: formData.get("valor"),
    mp_id: formData.get("mp_id"),
    mp1_cuenta_id: formData.get("mp1_cuenta_id"),
    mp2_id: formData.get("mp2_id"),
    valor2: formData.get("valor2"),
    mp2_cuenta_id: formData.get("mp2_cuenta_id"),
    observacion: formData.get("observacion"),
    pagado: formData.get("pagado") ?? false,
  });

  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }
  const data = parsed.data;

  if (!isSucursalAllowed(scope, data.sucursal_id)) {
    return {
      ok: false,
      errors: { sucursal_id: ["No tienes acceso a esa sucursal"] },
    };
  }

  const ymdFecha =
    data.fecha && /^\d{4}-\d{2}-\d{2}$/.test(data.fecha)
      ? data.fecha
      : hoyAr();

  let fechaIso: string;
  if (data.fecha && /^\d{4}-\d{2}-\d{2}$/.test(data.fecha)) {
    const ahora = new Date();
    const fecha = new Date(`${data.fecha}T00:00:00`);
    fecha.setHours(ahora.getHours(), ahora.getMinutes(), ahora.getSeconds(), 0);
    fechaIso = fecha.toISOString();
  } else {
    fechaIso = new Date().toISOString();
  }

  const egresoId = createId();
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      const [cierreDelDia] = await tx
        .select({ id: cierresCajaTable.id })
        .from(cierresCajaTable)
        .where(
          and(
            eq(cierresCajaTable.sucursalId, data.sucursal_id),
            eq(cierresCajaTable.fecha, ymdFecha),
          ),
        )
        .limit(1);

      if (cierreDelDia) {
        throw new Error(
          `La caja del ${ymdFecha} ya esta cerrada para esta sucursal. Reabri el cierre o carga el egreso con otra fecha.`,
        );
      }

      // Apertura obligatoria: no se puede cargar egresos si la caja de ese día
      // no fue abierta en esta sucursal.
      const [aperturaDelDia] = await tx
        .select({ id: aperturasCajaTable.id })
        .from(aperturasCajaTable)
        .where(
          and(
            eq(aperturasCajaTable.sucursalId, data.sucursal_id),
            eq(aperturasCajaTable.fecha, ymdFecha),
          ),
        )
        .limit(1);

      if (!aperturaDelDia) {
        throw new Error(
          `Tenés que abrir la caja del ${ymdFecha} antes de cargar egresos.`,
        );
      }

      // El medio 1 cubre lo que no paga el medio 2 (si lo hay).
      const valor2 = data.mp2_id ? (data.valor2 ?? 0) : 0;
      const valor1 = data.valor - valor2;

      await tx.insert(egresosTable).values({
        id: egresoId,
        fecha: new Date(fechaIso),
        sucursalId: data.sucursal_id,
        rubroId: data.rubro_id,
        insumoId: data.insumo_id ?? null,
        proveedorId: data.proveedor_id ?? null,
        cantidad: data.cantidad ?? null,
        valor: data.valor,
        mpId: data.mp_id,
        mp1CuentaId: data.mp1_cuenta_id ?? null,
        mp2Id: data.mp2_id ?? null,
        valor2: data.mp2_id ? valor2 : null,
        mp2CuentaId: data.mp2_cuenta_id ?? null,
        observacion: data.observacion ?? null,
        pagado: data.pagado,
        usuarioId: user.id,
      });

      if (data.insumo_id && data.cantidad && data.cantidad > 0) {
        // `cantidad` viene en ENVASES. El stock se lleva en la unidad base del
        // insumo (ml/g/ud), igual que el consumo por receta y la valuación, así
        // que convertimos a unidad base con el tamaño del envase.
        const [insumoRow] = await tx
          .select({ tamanoEnvase: insumosTable.tamanoEnvase })
          .from(insumosTable)
          .where(eq(insumosTable.id, data.insumo_id))
          .limit(1);
        const tamanoEnvase = insumoRow?.tamanoEnvase ?? 1;
        await applyMovementTx(tx, {
          insumo_id: data.insumo_id,
          sucursal_id: data.sucursal_id,
          delta: data.cantidad * tamanoEnvase,
          tipo: "compra",
          motivo: `${data.cantidad} envase(s)`,
          ref_tipo: "egreso",
          ref_id: egresoId,
          usuario_id: user.id,
        });
      }

      if (data.pagado) {
        // Un movimiento bancario por cada medio usado. La cuenta es la elegida
        // (override) o, si no se eligió, la cuenta por defecto del medio.
        const pagos: Array<{
          mpId: string;
          cuentaOverride?: string;
          monto: number;
        }> = [
          { mpId: data.mp_id, cuentaOverride: data.mp1_cuenta_id, monto: valor1 },
        ];
        if (data.mp2_id) {
          pagos.push({
            mpId: data.mp2_id,
            cuentaOverride: data.mp2_cuenta_id,
            monto: valor2,
          });
        }
        // Sin observación el movimiento decía literalmente "Egreso", y en la
        // caja aparecía un "Egreso $4.000" imposible de rastrear. El rubro
        // siempre está cargado (es obligatorio), así que sirve de concepto.
        const [rubroDelEgreso] = await tx
          .select({
            rubro: rubrosGastoTable.rubro,
            subrubro: rubrosGastoTable.subrubro,
          })
          .from(rubrosGastoTable)
          .where(eq(rubrosGastoTable.id, data.rubro_id))
          .limit(1);
        const conceptoRubro = rubroDelEgreso
          ? [rubroDelEgreso.rubro, rubroDelEgreso.subrubro]
              .filter(Boolean)
              .join(" · ")
          : "Egreso";

        for (const pago of pagos) {
          if (pago.monto <= 0) continue;
          const cuentaId =
            pago.cuentaOverride ?? (await getCuentaIdForMpTx(tx, pago.mpId));
          if (cuentaId) {
            await emitMovimientoBancarioTx(tx, {
              cuentaId,
              fecha: new Date(fechaIso),
              monto: -Math.abs(pago.monto),
              tipo: "egreso",
              sucursalId: data.sucursal_id,
              refTipo: "egreso",
              refId: egresoId,
              descripcion: data.observacion ?? conceptoRubro,
              usuarioId: user.id,
            });
          }
        }
      }

      if (!data.pagado && data.proveedor_id) {
        const [proveedor] = await tx
          .select()
          .from(proveedoresTable)
          .where(eq(proveedoresTable.id, data.proveedor_id))
          .limit(1);
        if (proveedor) {
          await tx
            .update(proveedoresTable)
            .set({ deudaPendiente: proveedor.deudaPendiente + data.valor })
            .where(eq(proveedoresTable.id, data.proveedor_id));
        }
      }
    });
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [error instanceof Error ? error.message : "No se pudo crear el egreso"],
      },
    };
  }

  revalidatePath("/egresos");
  revalidatePath("/stock");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  revalidatePath("/catalogos/proveedores");
  revalidatePath("/bancos");
  return { ok: true, egresoId };
}

export async function togglePagadoEgreso(
  egresoId: string,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);
  const db = getDb();
  const [egreso] = await db
    .select()
    .from(egresosTable)
    .where(eq(egresosTable.id, egresoId))
    .limit(1);

  if (!egreso) return { ok: false, errors: { _: ["Egreso no encontrado"] } };
  if (!scope.sucursalIdsPermitidas.includes(egreso.sucursalId)) {
    return { ok: false, errors: { _: ["No tienes acceso a ese egreso"] } };
  }

  await db.transaction(async (tx) => {
    const nuevoPagado = !egreso.pagado;
    await tx
      .update(egresosTable)
      .set({ pagado: nuevoPagado })
      .where(eq(egresosTable.id, egresoId));

    if (nuevoPagado) {
      // Un movimiento por cada medio usado, igual que al crear el egreso.
      const valor2 = egreso.mp2Id ? (egreso.valor2 ?? 0) : 0;
      const valor1 = egreso.valor - valor2;
      const pagos: Array<{
        mpId: string;
        cuentaOverride: string | null;
        monto: number;
      }> = [
        { mpId: egreso.mpId, cuentaOverride: egreso.mp1CuentaId, monto: valor1 },
      ];
      if (egreso.mp2Id) {
        pagos.push({
          mpId: egreso.mp2Id,
          cuentaOverride: egreso.mp2CuentaId,
          monto: valor2,
        });
      }
      for (const pago of pagos) {
        if (pago.monto <= 0) continue;
        const cuentaId =
          pago.cuentaOverride ?? (await getCuentaIdForMpTx(tx, pago.mpId));
        if (cuentaId) {
          await emitMovimientoBancarioTx(tx, {
            cuentaId,
            fecha: new Date(),
            monto: -Math.abs(pago.monto),
            tipo: "egreso",
            sucursalId: egreso.sucursalId,
            refTipo: "egreso",
            refId: egreso.id,
            descripcion: egreso.observacion ?? "Pago a proveedor",
            usuarioId: user.id,
          });
        }
      }
    } else {
      await deleteMovimientosByRefTx(tx, "egreso", egreso.id);
    }

    if (egreso.proveedorId) {
      const [proveedor] = await tx
        .select()
        .from(proveedoresTable)
        .where(eq(proveedoresTable.id, egreso.proveedorId))
        .limit(1);
      if (proveedor) {
        const nextDebt = egreso.pagado
          ? proveedor.deudaPendiente + egreso.valor
          : Math.max(0, proveedor.deudaPendiente - egreso.valor);
        await tx
          .update(proveedoresTable)
          .set({ deudaPendiente: nextDebt })
          .where(eq(proveedoresTable.id, egreso.proveedorId));
      }
    }
  });

  revalidatePath("/egresos");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  revalidatePath("/catalogos/proveedores");
  revalidatePath("/bancos");
  return { ok: true };
}
