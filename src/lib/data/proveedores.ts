"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { requireSupabaseRuntime } from "@/lib/db/env";
import {
  egresos as egresosTable,
  proveedores as proveedoresTable,
  proveedorSucursal as proveedorSucursalTable,
} from "@/lib/db/schema";
import type { Proveedor } from "@/lib/types";
import { proveedorSchema } from "@/lib/validations/proveedor";
import { getActiveSucursalForUser } from "@/lib/auth/session";
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
