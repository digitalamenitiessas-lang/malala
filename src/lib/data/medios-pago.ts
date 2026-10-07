"use server";

import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import {
  cuentasBancarias as cuentasBancariasTable,
  mediosPago as mediosPagoTable,
} from "@/lib/db/schema";
import { medioPagoSchema } from "@/lib/validations/medio-pago";
import { fieldErrors, requireRole, type ActionResult } from "./_helpers";
import { requireUser } from "@/lib/auth/session";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import type { MedioPago } from "@/lib/types";

function createId() {
  return crypto.randomUUID();
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
    moneda: row.moneda,
    mueve_plata: row.muevePlata,
  };
}

export interface ListMediosPagoOpts {
  sucursalId?: string;
  soloActivos?: boolean;
  /**
   * Incluir el medio "CC" (Cuenta corriente). Por defecto se excluye: solo
   * tiene sentido al fiar una venta, no para pagar gastos/liquidaciones ni
   * para el resumen de caja.
   */
  incluirCuentaCorriente?: boolean;
  /**
   * Excluir el medio "GIFT" (Gift card).
   *
   * Va al revés que CC —incluido por defecto, se excluye a mano— y es a
   * propósito. GIFT tiene que aparecer en los agregados por medio de pago
   * (caja, reportes), porque el canje SÍ es facturación: el servicio se prestó.
   * Si se excluyera por defecto, esos agregados descartarían el tramo en
   * silencio y el "facturado del día" quedaría corto.
   *
   * Se excluye sólo donde se PAGA plata hacia afuera —gastos, liquidaciones,
   * compras a proveedor, pagos de cuenta corriente— porque ahí no tiene
   * sentido: con una gift card no se le paga a nadie, y un gasto marcado como
   * pagado con gift card sería plata que nunca salió.
   */
  excluirGiftCard?: boolean;
}

export async function listMediosPago(
  opts: ListMediosPagoOpts = {},
): Promise<MedioPago[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();

  const filters = [inArray(mediosPagoTable.sucursalId, scope.sucursalIdsPermitidas)];
  if (opts.sucursalId) {
    if (!isSucursalAllowed(scope, opts.sucursalId)) return [];
    filters.push(eq(mediosPagoTable.sucursalId, opts.sucursalId));
  }
  if (opts.soloActivos) {
    filters.push(eq(mediosPagoTable.activo, true));
  }
  if (!opts.incluirCuentaCorriente) {
    filters.push(ne(mediosPagoTable.codigo, "CC"));
  }
  if (opts.excluirGiftCard) {
    filters.push(ne(mediosPagoTable.codigo, "GIFT"));
  }

  const rows = await db
    .select()
    .from(mediosPagoTable)
    .where(and(...filters))
    .orderBy(
      asc(mediosPagoTable.sucursalId),
      asc(mediosPagoTable.codigo),
      asc(mediosPagoTable.nombre),
    );
  return rows.map(mapMedioPago);
}

export async function createMedioPago(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin"]);
  const scope = buildAccessScope(user);
  const parsed = medioPagoSchema.safeParse({
    sucursal_id: formData.get("sucursal_id"),
    codigo: formData.get("codigo"),
    nombre: formData.get("nombre"),
    activo: true,
    cuenta_id: formData.get("cuenta_id"),
    recargo_pct: formData.get("recargo_pct") ?? 0,
    no_mueve_plata: formData.get("no_mueve_plata"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  if (!isSucursalAllowed(scope, parsed.data.sucursal_id)) {
    return { ok: false, errors: { sucursal_id: ["No tenés acceso a esa sucursal"] } };
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: mediosPagoTable.id })
    .from(mediosPagoTable)
    .where(
      and(
        eq(mediosPagoTable.sucursalId, parsed.data.sucursal_id),
        eq(mediosPagoTable.codigo, parsed.data.codigo),
      ),
    )
    .limit(1);
  if (existing) {
    return { ok: false, errors: { codigo: ["Ya existe ese código en la sucursal"] } };
  }

  if (parsed.data.cuenta_id) {
    const [cuenta] = await db
      .select({ sucursalId: cuentasBancariasTable.sucursalId })
      .from(cuentasBancariasTable)
      .where(eq(cuentasBancariasTable.id, parsed.data.cuenta_id))
      .limit(1);
    if (!cuenta || cuenta.sucursalId !== parsed.data.sucursal_id) {
      return {
        ok: false,
        errors: { cuenta_id: ["La cuenta no pertenece a la sucursal"] },
      };
    }
  }

  await db.insert(mediosPagoTable).values({
    id: createId(),
    sucursalId: parsed.data.sucursal_id,
    codigo: parsed.data.codigo,
    nombre: parsed.data.nombre,
    activo: true,
    // Un medio que no mueve plata no lleva cuenta aunque hayan elegido una:
    // tenerla haría que cada cortesía inventara un ingreso en la caja.
    cuentaId: parsed.data.no_mueve_plata
      ? null
      : (parsed.data.cuenta_id ?? null),
    recargoPct: parsed.data.recargo_pct,
    muevePlata: !parsed.data.no_mueve_plata,
  });
  revalidatePath("/catalogos/medios-pago");
  return { ok: true };
}

export async function updateMedioPagoRecargo(
  mpId: string,
  recargoPct: number,
): Promise<ActionResult> {
  const user = await requireRole(["admin"]);
  const scope = buildAccessScope(user);
  const db = getDb();

  const [mp] = await db
    .select()
    .from(mediosPagoTable)
    .where(eq(mediosPagoTable.id, mpId))
    .limit(1);
  if (!mp) return { ok: false, errors: { _: ["Medio no encontrado"] } };
  if (!isSucursalAllowed(scope, mp.sucursalId)) {
    return { ok: false, errors: { _: ["Sin acceso al medio"] } };
  }
  if (!Number.isFinite(recargoPct) || recargoPct < 0 || recargoPct > 100) {
    return { ok: false, errors: { recargo_pct: ["El recargo debe estar entre 0 y 100"] } };
  }

  await db
    .update(mediosPagoTable)
    .set({ recargoPct })
    .where(eq(mediosPagoTable.id, mpId));
  revalidatePath("/catalogos/medios-pago");
  return { ok: true };
}

export async function updateMedioPagoCuenta(
  mpId: string,
  cuentaId: string | null,
): Promise<ActionResult> {
  const user = await requireRole(["admin"]);
  const scope = buildAccessScope(user);
  const db = getDb();

  const [mp] = await db
    .select()
    .from(mediosPagoTable)
    .where(eq(mediosPagoTable.id, mpId))
    .limit(1);
  if (!mp) return { ok: false, errors: { _: ["Medio no encontrado"] } };
  if (!isSucursalAllowed(scope, mp.sucursalId)) {
    return { ok: false, errors: { _: ["Sin acceso al medio"] } };
  }

  if (cuentaId) {
    const [cuenta] = await db
      .select({ sucursalId: cuentasBancariasTable.sucursalId })
      .from(cuentasBancariasTable)
      .where(eq(cuentasBancariasTable.id, cuentaId))
      .limit(1);
    if (!cuenta || cuenta.sucursalId !== mp.sucursalId) {
      return {
        ok: false,
        errors: { cuenta_id: ["La cuenta debe pertenecer a la misma sucursal"] },
      };
    }
  }

  await db
    .update(mediosPagoTable)
    .set({ cuentaId })
    .where(eq(mediosPagoTable.id, mpId));
  revalidatePath("/catalogos/medios-pago");
  revalidatePath("/bancos");
  return { ok: true };
}

export async function toggleMedioPagoActivo(
  mpId: string,
): Promise<ActionResult> {
  const user = await requireRole(["admin"]);
  const scope = buildAccessScope(user);
  const db = getDb();
  const [medioPago] = await db
    .select()
    .from(mediosPagoTable)
    .where(eq(mediosPagoTable.id, mpId))
    .limit(1);
  if (!medioPago) return { ok: false, errors: { _: ["No encontrado"] } };
  if (!isSucursalAllowed(scope, medioPago.sucursalId)) {
    return { ok: false, errors: { _: ["Sin acceso al medio"] } };
  }

  await db
    .update(mediosPagoTable)
    .set({ activo: !medioPago.activo })
    .where(eq(mediosPagoTable.id, mpId));
  revalidatePath("/catalogos/medios-pago");
  return { ok: true };
}
