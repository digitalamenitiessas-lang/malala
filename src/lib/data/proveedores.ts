"use server";

import { asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { requireSupabaseRuntime } from "@/lib/db/env";
import {
  egresos as egresosTable,
  proveedores as proveedoresTable,
  pagosProveedor as pagosProveedorTable,
  mediosPago as mediosPagoTable,
  proveedorSucursal as proveedorSucursalTable,
} from "@/lib/db/schema";
import type { Proveedor } from "@/lib/types";
import { proveedorSchema } from "@/lib/validations/proveedor";
import { getActiveSucursalForUser } from "@/lib/auth/session";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import { hoyAr } from "@/lib/fecha-ar";
import {
  emitMovimientoBancarioTx,
  getCuentaIdForMpTx,
} from "./movimientos-bancarios-helpers";
import {
  fieldErrors,
  normPhone,
  requireRole,
  type ActionResult,
} from "./_helpers";

/** Set de proveedorId habilitados en una sucursal (membresía). */
async function proveedorIdsDeSucursal(sucursalId: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ proveedorId: proveedorSucursalTable.proveedorId })
    .from(proveedorSucursalTable)
    .where(eq(proveedorSucursalTable.sucursalId, sucursalId));
  return new Set(rows.map((r) => r.proveedorId));
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

export async function listProveedores(opts?: {
  sucursalId?: string;
}): Promise<Proveedor[]> {
  requireSupabaseRuntime(
    "Los proveedores del sistema solo se cargan desde Supabase.",
  );

  const db = getDb();
  const rows = await db
    .select()
    .from(proveedoresTable)
    .orderBy(asc(proveedoresTable.nombre));
  if (opts?.sucursalId) {
    const habilitados = await proveedorIdsDeSucursal(opts.sucursalId);
    return rows.filter((r) => habilitados.has(r.id)).map(mapProveedor);
  }
  return rows.map(mapProveedor);
}

export interface ProveedorConTotal extends Proveedor {
  total_comprado: number;
  cantidad_compras: number;
}

export async function listProveedoresConTotal(opts?: {
  sucursalId?: string;
}): Promise<ProveedorConTotal[]> {
  requireSupabaseRuntime(
    "Los proveedores del sistema solo se cargan desde Supabase.",
  );

  const db = getDb();
  const [proveedoresRowsAll, egresosRows] = await Promise.all([
    db.select().from(proveedoresTable).orderBy(asc(proveedoresTable.nombre)),
    db
      .select({
        proveedorId: egresosTable.proveedorId,
        valor: egresosTable.valor,
      })
      .from(egresosTable)
      // Un gasto anulado no le debe plata a nadie.
      .where(eq(egresosTable.anulado, false)),
  ]);
  const proveedoresRows = opts?.sucursalId
    ? await (async () => {
        const habilitados = await proveedorIdsDeSucursal(opts.sucursalId!);
        return proveedoresRowsAll.filter((r) => habilitados.has(r.id));
      })()
    : proveedoresRowsAll;

  const totalesById = new Map<string, { total: number; cantidad: number }>();
  for (const row of egresosRows) {
    if (!row.proveedorId) continue;
    const cur = totalesById.get(row.proveedorId) ?? { total: 0, cantidad: 0 };
    cur.total += row.valor;
    cur.cantidad += 1;
    totalesById.set(row.proveedorId, cur);
  }

  return proveedoresRows.map((row) => {
    const totales = totalesById.get(row.id) ?? { total: 0, cantidad: 0 };
    return {
      ...mapProveedor(row),
      total_comprado: totales.total,
      cantidad_compras: totales.cantidad,
    };
  });
}

export async function getProveedor(
  proveedorId: string,
): Promise<Proveedor | null> {
  requireSupabaseRuntime(
    "Los proveedores del sistema solo se cargan desde Supabase.",
  );

  const db = getDb();
  const [row] = await db
    .select()
    .from(proveedoresTable)
    .where(eq(proveedoresTable.id, proveedorId))
    .limit(1);
  return row ? mapProveedor(row) : null;
}

function parse(formData: FormData) {
  return proveedorSchema.safeParse({
    nombre: formData.get("nombre"),
    telefono: formData.get("telefono"),
    cuit: formData.get("cuit"),
  });
}

export async function createProveedor(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime(
    "La creacion de proveedores requiere Supabase configurado.",
  );
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const db = getDb();
  const proveedorId = crypto.randomUUID();
  await db.insert(proveedoresTable).values({
    id: proveedorId,
    nombre: parsed.data.nombre,
    telefono: normPhone(parsed.data.telefono) ?? null,
    cuit: parsed.data.cuit ?? null,
    deudaPendiente: 0,
  });

  // Membresía: el proveedor queda habilitado en la sucursal activa del usuario.
  const sucursalActiva = await getActiveSucursalForUser(user);
  if (sucursalActiva) {
    await db.insert(proveedorSucursalTable).values({
      id: crypto.randomUUID(),
      proveedorId,
      sucursalId: sucursalActiva.id,
    });
  }

  revalidatePath("/catalogos/proveedores");
  revalidatePath("/egresos");
  return { ok: true };
}

export async function updateProveedor(
  proveedorId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime(
    "La edicion de proveedores requiere Supabase configurado.",
  );
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const db = getDb();
  const existing = await getProveedor(proveedorId);
  if (!existing) return { ok: false, errors: { _: ["No encontrado"] } };

  await db
    .update(proveedoresTable)
    .set({
      nombre: parsed.data.nombre,
      telefono: normPhone(parsed.data.telefono) ?? null,
      cuit: parsed.data.cuit ?? null,
    })
    .where(eq(proveedoresTable.id, proveedorId));

  revalidatePath("/catalogos/proveedores");
  revalidatePath("/egresos");
  return { ok: true };
}

export interface PagoProveedor {
  id: string;
  fecha: string;
  monto: number;
  mp_codigo?: string;
  observacion?: string;
  anulado: boolean;
}

export async function listPagosProveedor(
  proveedorId: string,
): Promise<PagoProveedor[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: pagosProveedorTable.id,
      fecha: pagosProveedorTable.fecha,
      monto: pagosProveedorTable.monto,
      observacion: pagosProveedorTable.observacion,
      anulado: pagosProveedorTable.anulado,
      mpCodigo: mediosPagoTable.codigo,
    })
    .from(pagosProveedorTable)
    .leftJoin(
      mediosPagoTable,
      eq(mediosPagoTable.id, pagosProveedorTable.mpId),
    )
    .where(eq(pagosProveedorTable.proveedorId, proveedorId))
    .orderBy(desc(pagosProveedorTable.fecha));
  return rows.map((r) => ({
    id: r.id,
    fecha: r.fecha.toISOString(),
    monto: r.monto,
    mp_codigo: r.mpCodigo ?? undefined,
    observacion: r.observacion ?? undefined,
    anulado: r.anulado,
  }));
}

/**
 * Registra un pago a cuenta de un proveedor.
 *
 * El salón nunca paga una factura entera: paga montos sueltos todas las
 * semanas. Antes la única forma de bajar la deuda era marcar una factura como
 * pagada —entera o nada—, así que la deuda quedaba congelada y los pagos no se
 * registraban en ningún lado.
 *
 * Esto NO toca las facturas: ellas siguen siendo el origen de la deuda. El pago
 * baja el saldo y saca la plata de la cuenta, que es lo que pasa de verdad.
 */
export async function registrarPagoProveedor(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);

  const proveedorId = String(formData.get("proveedor_id") ?? "");
  const sucursalId = String(formData.get("sucursal_id") ?? "");
  const mpId = String(formData.get("mp_id") ?? "");
  const monto = Number(formData.get("monto") ?? 0);
  const fechaRaw = String(formData.get("fecha") ?? "").trim();
  const observacion = String(formData.get("observacion") ?? "").trim();

  if (!proveedorId) return { ok: false, errors: { _: ["Falta el proveedor"] } };
  if (!isSucursalAllowed(scope, sucursalId)) {
    return { ok: false, errors: { sucursal_id: ["Sin acceso a esa sucursal"] } };
  }
  if (!(monto > 0)) {
    return { ok: false, errors: { monto: ["El monto debe ser mayor a 0"] } };
  }
  if (!mpId) return { ok: false, errors: { mp_id: ["Elegí con qué pagaste"] } };
  if (fechaRaw && !/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) {
    return { ok: false, errors: { fecha: ["Fecha inválida"] } };
  }
  if (fechaRaw && fechaRaw > hoyAr()) {
    return { ok: false, errors: { fecha: ["No se puede pagar a futuro"] } };
  }
  const fecha = fechaRaw
    ? new Date(`${fechaRaw}T12:00:00-03:00`)
    : new Date();

  const db = getDb();
  const pagoId = crypto.randomUUID();
  try {
    await db.transaction(async (tx) => {
      const [prov] = await tx
        .select()
        .from(proveedoresTable)
        .where(eq(proveedoresTable.id, proveedorId))
        .limit(1);
      if (!prov) throw new Error("El proveedor no existe");

      await tx.insert(pagosProveedorTable).values({
        id: pagoId,
        proveedorId,
        sucursalId,
        fecha,
        monto,
        mpId,
        observacion: observacion || null,
        anulado: false,
        usuarioId: user.id,
      });

      // La deuda no se acota a cero: si pagan de más, el negativo es el dato
      // —queda saldo a favor del salón— y taparlo lo perdería.
      await tx
        .update(proveedoresTable)
        .set({ deudaPendiente: prov.deudaPendiente - monto })
        .where(eq(proveedoresTable.id, proveedorId));

      const cuentaId = await getCuentaIdForMpTx(tx, mpId);
      if (cuentaId) {
        await emitMovimientoBancarioTx(tx, {
          cuentaId,
          fecha,
          monto: -Math.abs(monto),
          tipo: "egreso",
          sucursalId,
          refTipo: "pago_proveedor",
          refId: pagoId,
          descripcion: `Pago a ${prov.nombre}${observacion ? ` — ${observacion}` : ""}`,
          usuarioId: user.id,
        });
      }
    });
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [error instanceof Error ? error.message : "No se pudo registrar el pago"],
      },
    };
  }

  revalidatePath(`/catalogos/proveedores/${proveedorId}`);
  revalidatePath("/caja");
  revalidatePath("/bancos");
  return { ok: true };
}
