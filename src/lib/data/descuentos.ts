"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { requireSupabaseRuntime } from "@/lib/db/env";
import {
  descuentos as descuentosTable,
  empleados as empleadosTable,
} from "@/lib/db/schema";
import { getActiveSucursalForUser, requireUser } from "@/lib/auth/session";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import { fieldErrors, requireRole, type ActionResult } from "./_helpers";
import { descuentoSchema } from "@/lib/validations/descuento";
import type { Descuento } from "@/lib/types";

function createId() {
  return crypto.randomUUID();
}

function mapDescuento(row: typeof descuentosTable.$inferSelect): Descuento {
  return {
    id: row.id,
    empleado_id: row.empleadoId,
    sucursal_id: row.sucursalId,
    fecha: row.fecha.toISOString(),
    fecha_descuento: row.fechaDescuento ?? undefined,
    monto: row.monto,
    concepto: row.concepto,
    liquidacion_id: row.liquidacionId ?? undefined,
    observacion: row.observacion ?? undefined,
    usuario_id: row.usuarioId,
    creado_en: row.creadoEn.toISOString(),
  };
}

/**
 * Descuentos de un empleado, los más recientes primero, acotados a las
 * sucursales que el usuario puede ver.
 */
export async function listDescuentos(empleadoId: string): Promise<Descuento[]> {
  requireSupabaseRuntime("Los descuentos requieren Supabase configurado.");
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();
  const rows = await db
    .select()
    .from(descuentosTable)
    .where(
      and(
        eq(descuentosTable.empleadoId, empleadoId),
        inArray(descuentosTable.sucursalId, scope.sucursalIdsPermitidas),
      ),
    )
    .orderBy(desc(descuentosTable.fecha), desc(descuentosTable.creadoEn));
  return rows.map(mapDescuento);
}

/**
 * Carga un descuento. NO toca la caja ni genera egreso, y esa es toda la
 * diferencia con un anticipo: acá no se le dio plata a nadie, se le va a
 * cobrar el sábado. "Para muchos items que no salen de la caja hasta el día
 * del pago del sábado".
 */
export async function registrarDescuento(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime("Los descuentos requieren Supabase configurado.");

  const parsed = descuentoSchema.safeParse({
    empleado_id: formData.get("empleado_id"),
    monto: formData.get("monto"),
    concepto: formData.get("concepto"),
    fecha: formData.get("fecha"),
    fecha_descuento: formData.get("fecha_descuento"),
    observacion: formData.get("observacion"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const db = getDb();
  const [empleado] = await db
    .select({ id: empleadosTable.id, sucursalId: empleadosTable.sucursalPrincipalId })
    .from(empleadosTable)
    .where(eq(empleadosTable.id, parsed.data.empleado_id))
    .limit(1);
  if (!empleado) {
    return { ok: false, errors: { empleado_id: ["Empleado no encontrado"] } };
  }

  // La sucursal del descuento es la del empleado, no la que el usuario tenga
  // en pantalla: el descuento se compensa contra SU liquidación, que es por
  // sucursal.
  const sucursalId = empleado.sucursalId ?? (await getActiveSucursalForUser(user))?.id;
  if (!sucursalId) {
    return { ok: false, errors: { _: ["No pude determinar la sucursal"] } };
  }
  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, sucursalId)) {
    return { ok: false, errors: { _: ["Sin acceso a esa sucursal"] } };
  }

  // Mediodía argentino para una fecha retroactiva: con medianoche, el cambio
  // de huso lo corre al día anterior y el descuento cae en otra semana.
  const fecha = parsed.data.fecha
    ? new Date(`${parsed.data.fecha}T12:00:00-03:00`)
    : new Date();

  try {
    await db.insert(descuentosTable).values({
      id: createId(),
      empleadoId: parsed.data.empleado_id,
      sucursalId,
      fecha,
      // Null si coincide con el día del cargo: guardar el mismo dato dos veces
      // invita a que queden desfasados.
      fechaDescuento:
        parsed.data.fecha_descuento &&
        parsed.data.fecha_descuento !== (parsed.data.fecha ?? null)
          ? parsed.data.fecha_descuento
          : null,
      monto: parsed.data.monto,
      concepto: parsed.data.concepto,
      observacion: parsed.data.observacion ?? null,
      usuarioId: user.id,
    });
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [
          error instanceof Error ? error.message : "No se pudo cargar el descuento",
        ],
      },
    };
  }

  revalidatePath(`/catalogos/empleados/${parsed.data.empleado_id}`);
  revalidatePath("/liquidaciones");
  return { ok: true };
}

/**
 * Borra un descuento que todavía no se descontó.
 *
 * No hay caja que reabrir ni egreso que revertir —nunca movió plata—, así que
 * el único freno es que ya se haya compensado contra una liquidación: sacarlo
 * ahí dejaría ese sueldo sin explicación.
 */
export async function revertirDescuento(
  descuentoId: string,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime("Los descuentos requieren Supabase configurado.");
  const scope = buildAccessScope(user);
  const db = getDb();

  const [desc] = await db
    .select()
    .from(descuentosTable)
    .where(eq(descuentosTable.id, descuentoId))
    .limit(1);
  if (!desc) return { ok: false, errors: { _: ["Descuento no encontrado"] } };
  if (!isSucursalAllowed(scope, desc.sucursalId)) {
    return { ok: false, errors: { _: ["Sin acceso a esa sucursal"] } };
  }
  if (desc.liquidacionId) {
    return {
      ok: false,
      errors: {
        _: [
          "Ese descuento ya se aplicó en una liquidación. Para sacarlo hay que anular esa liquidación primero.",
        ],
      },
    };
  }

  try {
    await db.delete(descuentosTable).where(eq(descuentosTable.id, descuentoId));
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [
          error instanceof Error
            ? error.message
            : "No se pudo revertir el descuento",
        ],
      },
    };
  }

  revalidatePath(`/catalogos/empleados/${desc.empleadoId}`);
  revalidatePath("/liquidaciones");
  return { ok: true };
}
