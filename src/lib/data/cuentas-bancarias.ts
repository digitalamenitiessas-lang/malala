"use server";

import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { fechaArDeISO, finDeDiaArISO, formatYmdAr, hoyAr } from "@/lib/fecha-ar";
import { getDb } from "@/lib/db/client/postgres";
import {
  cuentasBancarias as cuentasBancariasTable,
  movimientosBancarios as movimientosBancariosTable,
  profiles as profilesTable,
  sucursales as sucursalesTable,
} from "@/lib/db/schema";
import {
  cuentaBancariaSchema,
  transferenciaSchema,
  ingresoManualSchema,
} from "@/lib/validations/cuenta-bancaria";
import { failure, fieldErrors, requireRole, type ActionResult } from "./_helpers";
import { getCierreQueBloqueaFecha } from "./caja";
import { requireUser } from "@/lib/auth/session";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import type { CuentaBancaria, MovimientoBancario } from "@/lib/types";

function createId() {
  return crypto.randomUUID();
}

function mapCuenta(row: typeof cuentasBancariasTable.$inferSelect): CuentaBancaria {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    nombre: row.nombre,
    tipo: row.tipo,
    activo: row.activo,
    observacion: row.observacion ?? undefined,
  };
}

function mapMov(row: typeof movimientosBancariosTable.$inferSelect): MovimientoBancario {
  return {
    id: row.id,
    cuenta_id: row.cuentaId,
    fecha: row.fecha.toISOString(),
    tipo: row.tipo,
    monto: row.monto,
    sucursal_id: row.sucursalId ?? undefined,
    ref_tipo: row.refTipo ?? undefined,
    ref_id: row.refId ?? undefined,
    descripcion: row.descripcion ?? undefined,
    usuario_id: row.usuarioId,
  };
}

export interface ListCuentasOpts {
  soloActivas?: boolean;
  sucursalId?: string;
}

export async function listCuentas(
  opts: ListCuentasOpts = {},
): Promise<CuentaBancaria[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();

  const filters = [
    inArray(cuentasBancariasTable.sucursalId, scope.sucursalIdsPermitidas),
  ];
  if (opts.sucursalId) {
    if (!isSucursalAllowed(scope, opts.sucursalId)) return [];
    filters.push(eq(cuentasBancariasTable.sucursalId, opts.sucursalId));
  }
  if (opts.soloActivas) {
    filters.push(eq(cuentasBancariasTable.activo, true));
  }

  const rows = await db
    .select()
    .from(cuentasBancariasTable)
    .where(and(...filters))
    .orderBy(
      asc(cuentasBancariasTable.sucursalId),
      asc(cuentasBancariasTable.tipo),
      asc(cuentasBancariasTable.nombre),
    );
  return rows.map(mapCuenta);
}

export async function getCuenta(id: string): Promise<CuentaBancaria | null> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();
  const [row] = await db
    .select()
    .from(cuentasBancariasTable)
    .where(eq(cuentasBancariasTable.id, id))
    .limit(1);
  if (!row) return null;
  if (!isSucursalAllowed(scope, row.sucursalId)) return null;
  return mapCuenta(row);
}

export interface SaldoCuenta {
  cuenta: CuentaBancaria;
  saldo: number;
}

export async function listSaldos(
  opts: {
    sucursalId?: string;
    /**
     * Saldo al final de ese día, no el de ahora (YYYY-MM-DD).
     *
     * Hace falta para abrir la caja de un día pasado: ahí el esperado tiene
     * que ser lo que había ESE día. Con el saldo de hoy, la diferencia contra
     * lo que se declara sale calculada contra el número equivocado y el ajuste
     * queda mal.
     */
    hasta?: string;
  } = {},
): Promise<SaldoCuenta[]> {
  const db = getDb();
  const cuentas = await listCuentas(opts);
  if (cuentas.length === 0) return [];

  const filtros = [
    inArray(
      movimientosBancariosTable.cuentaId,
      cuentas.map((c) => c.id),
    ),
  ];
  if (opts.hasta) {
    filtros.push(
      lte(movimientosBancariosTable.fecha, new Date(finDeDiaArISO(opts.hasta))),
    );
  }

  const rows = await db
    .select({
      cuentaId: movimientosBancariosTable.cuentaId,
      total: sql<number>`coalesce(sum(${movimientosBancariosTable.monto}), 0)`,
    })
    .from(movimientosBancariosTable)
    .where(and(...filtros))
    .groupBy(movimientosBancariosTable.cuentaId);

  const saldoById = new Map(rows.map((r) => [r.cuentaId, Number(r.total)]));
  return cuentas.map((cuenta) => ({
    cuenta,
    saldo: saldoById.get(cuenta.id) ?? 0,
  }));
}

/**
 * Suma de impuestos retenidos (movimientos tipo "impuesto") por cuenta en un
 * período. Devuelve montos positivos (lo que se llevó cada cuenta). Respeta el
 * scope: solo cuentas accesibles por el usuario.
 */
export async function sumImpuestosByCuenta(
  opts: { sucursalId?: string; desde?: string; hasta?: string } = {},
): Promise<Map<string, number>> {
  const db = getDb();
  const cuentas = await listCuentas(
    opts.sucursalId ? { sucursalId: opts.sucursalId } : {},
  );
  const map = new Map<string, number>();
  if (cuentas.length === 0) return map;

  const filters = [
    inArray(
      movimientosBancariosTable.cuentaId,
      cuentas.map((c) => c.id),
    ),
    eq(movimientosBancariosTable.tipo, "impuesto"),
  ];
  if (opts.desde) {
    filters.push(gte(movimientosBancariosTable.fecha, new Date(opts.desde)));
  }
  if (opts.hasta) {
    filters.push(lte(movimientosBancariosTable.fecha, new Date(opts.hasta)));
  }

  const rows = await db
    .select({
      cuentaId: movimientosBancariosTable.cuentaId,
      total: sql<number>`coalesce(sum(${movimientosBancariosTable.monto}), 0)`,
    })
    .from(movimientosBancariosTable)
    .where(and(...filters))
    .groupBy(movimientosBancariosTable.cuentaId);

  for (const r of rows) map.set(r.cuentaId, Math.abs(Number(r.total)));
  return map;
}

export interface MovFiltros {
  cuentaId?: string;
  sucursalId?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
}

export interface MovimientoDetalle {
  movimiento: MovimientoBancario;
  cuenta: CuentaBancaria | null;
  sucursalNombre?: string;
  usuarioNombre?: string;
  /** Sólo en ingresos manuales que se anularon: el ajuste que los deshizo. */
  anulacion?: { descripcion?: string; usuarioNombre?: string };
}

export async function listMovimientos(
  filtros: MovFiltros = {},
): Promise<MovimientoDetalle[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();

  // Restringimos por las cuentas que el usuario puede ver
  const cuentasPermitidasIds = (await listCuentas()).map((c) => c.id);
  if (cuentasPermitidasIds.length === 0) return [];

  const filters = [inArray(movimientosBancariosTable.cuentaId, cuentasPermitidasIds)];
  if (filtros.cuentaId) {
    if (!cuentasPermitidasIds.includes(filtros.cuentaId)) return [];
    filters.push(eq(movimientosBancariosTable.cuentaId, filtros.cuentaId));
  }
  if (filtros.sucursalId) {
    if (!isSucursalAllowed(scope, filtros.sucursalId)) return [];
    filters.push(eq(movimientosBancariosTable.sucursalId, filtros.sucursalId));
  }
  if (filtros.desde) {
    filters.push(gte(movimientosBancariosTable.fecha, new Date(filtros.desde)));
  }
  if (filtros.hasta) {
    filters.push(lte(movimientosBancariosTable.fecha, new Date(filtros.hasta)));
  }

  const rows = await db
    .select()
    .from(movimientosBancariosTable)
    .where(and(...filters))
    .orderBy(desc(movimientosBancariosTable.fecha))
    .limit(filtros.limit ?? 200);

  const movs = rows.map(mapMov);
  if (movs.length === 0) return [];

  const cuentaIds = Array.from(new Set(movs.map((m) => m.cuenta_id)));
  const sucursalIds = Array.from(
    new Set(movs.map((m) => m.sucursal_id).filter(Boolean)),
  ) as string[];
  // El contra-asiento puede quedar fuera de la página (otro filtro, el
  // límite), así que se busca aparte para poder marcar el original.
  const manualIds = movs.filter((m) => m.ref_tipo === "manual").map((m) => m.id);
  const anulacionRows =
    manualIds.length > 0
      ? await db
          .select()
          .from(movimientosBancariosTable)
          .where(
            and(
              eq(movimientosBancariosTable.refTipo, "anulacion_manual"),
              inArray(movimientosBancariosTable.refId, manualIds),
            ),
          )
      : [];
  const userIds = Array.from(
    new Set([
      ...movs.map((m) => m.usuario_id),
      ...anulacionRows.map((a) => a.usuarioId),
    ]),
  );

  const [cuentasRows, sucRows, profRows] = await Promise.all([
    cuentaIds.length > 0
      ? db
          .select()
          .from(cuentasBancariasTable)
          .where(inArray(cuentasBancariasTable.id, cuentaIds))
      : Promise.resolve([]),
    sucursalIds.length > 0
      ? db
          .select({ id: sucursalesTable.id, nombre: sucursalesTable.nombre })
          .from(sucursalesTable)
          .where(inArray(sucursalesTable.id, sucursalIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? db
          .select({ userId: profilesTable.userId, nombre: profilesTable.nombre })
          .from(profilesTable)
          .where(inArray(profilesTable.userId, userIds))
      : Promise.resolve([]),
  ]);

  const cuentaById = new Map(cuentasRows.map((c) => [c.id, mapCuenta(c)]));
  const sucById = new Map(sucRows.map((s) => [s.id, s.nombre]));
  const userById = new Map(profRows.map((p) => [p.userId, p.nombre]));
  const anulacionByOriginal = new Map(
    anulacionRows.map((a) => [
      a.refId,
      {
        descripcion: a.descripcion ?? undefined,
        usuarioNombre: userById.get(a.usuarioId),
      },
    ]),
  );

  return movs.map((m) => ({
    movimiento: m,
    cuenta: cuentaById.get(m.cuenta_id) ?? null,
    sucursalNombre: m.sucursal_id ? sucById.get(m.sucursal_id) : undefined,
    usuarioNombre: userById.get(m.usuario_id),
    anulacion: anulacionByOriginal.get(m.id),
  }));
}

export async function createCuenta(formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["admin"]);
  const scope = buildAccessScope(user);
  const parsed = cuentaBancariaSchema.safeParse({
    sucursal_id: formData.get("sucursal_id"),
    nombre: formData.get("nombre"),
    tipo: formData.get("tipo"),
    observacion: formData.get("observacion"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  if (!isSucursalAllowed(scope, parsed.data.sucursal_id)) {
    return { ok: false, errors: { sucursal_id: ["Sin acceso a esa sucursal"] } };
  }

  const db = getDb();
  await db.insert(cuentasBancariasTable).values({
    id: createId(),
    sucursalId: parsed.data.sucursal_id,
    nombre: parsed.data.nombre,
    tipo: parsed.data.tipo,
    activo: true,
    observacion: parsed.data.observacion ?? null,
  });
  revalidatePath("/catalogos/cuentas-bancarias");
  revalidatePath("/bancos");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function toggleCuentaActiva(id: string): Promise<ActionResult> {
  const user = await requireRole(["admin"]);
  const scope = buildAccessScope(user);
  const db = getDb();
  const [cuenta] = await db
    .select()
    .from(cuentasBancariasTable)
    .where(eq(cuentasBancariasTable.id, id))
    .limit(1);
  if (!cuenta) return { ok: false, errors: { _: ["Cuenta no encontrada"] } };
  if (!isSucursalAllowed(scope, cuenta.sucursalId)) {
    return { ok: false, errors: { _: ["Sin acceso a la cuenta"] } };
  }

  await db
    .update(cuentasBancariasTable)
    .set({ activo: !cuenta.activo })
    .where(eq(cuentasBancariasTable.id, id));
  revalidatePath("/catalogos/cuentas-bancarias");
  revalidatePath("/bancos");
  return { ok: true };
}

export async function createTransferencia(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);
  const parsed = transferenciaSchema.safeParse({
    cuenta_origen_id: formData.get("cuenta_origen_id"),
    cuenta_destino_id: formData.get("cuenta_destino_id"),
    monto: formData.get("monto"),
    descripcion: formData.get("descripcion"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const data = parsed.data;

  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      const cuentas = await tx
        .select()
        .from(cuentasBancariasTable)
        .where(
          inArray(cuentasBancariasTable.id, [
            data.cuenta_origen_id,
            data.cuenta_destino_id,
          ]),
        );
      if (cuentas.length !== 2) {
        throw new Error("Cuenta origen o destino no existe");
      }
      for (const c of cuentas) {
        if (!isSucursalAllowed(scope, c.sucursalId)) {
          throw new Error("Sin acceso a alguna de las cuentas");
        }
      }
      const sucursalOrigen = cuentas.find((c) => c.id === data.cuenta_origen_id)!
        .sucursalId;
      const sucursalDestino = cuentas.find((c) => c.id === data.cuenta_destino_id)!
        .sucursalId;
      if (sucursalOrigen !== sucursalDestino) {
        throw new Error("No se permiten transferencias entre sucursales");
      }

      const fecha = new Date();
      const descripcion = data.descripcion ?? `Transferencia entre cuentas`;

      await tx.insert(movimientosBancariosTable).values([
        {
          id: createId(),
          cuentaId: data.cuenta_origen_id,
          fecha,
          tipo: "transferencia_salida",
          monto: -Math.abs(data.monto),
          sucursalId: sucursalOrigen,
          refTipo: "transferencia",
          refId: null,
          descripcion,
          usuarioId: user.id,
        },
        {
          id: createId(),
          cuentaId: data.cuenta_destino_id,
          fecha,
          tipo: "transferencia_entrada",
          monto: Math.abs(data.monto),
          sucursalId: sucursalDestino,
          refTipo: "transferencia",
          refId: null,
          descripcion,
          usuarioId: user.id,
        },
      ]);
    });
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [error instanceof Error ? error.message : "No se pudo transferir"],
      },
    };
  }

  revalidatePath("/bancos");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Registra plata que entra y no es una venta.
 *
 * El salón cobra cosas que no pasan por la caja de ventas: una comisión por
 * maquillajes que le transfieren, plata que alguien devuelve, un aporte. Hasta
 * ahora la única forma de que la caja subiera era una venta o un ajuste de
 * apertura, así que esto se cargaba falseando el ajuste — la plata quedaba
 * bien pero el motivo se perdía, y al mes siguiente nadie sabía de qué era.
 *
 * NO es una venta y no pretende serlo: no factura, no genera comisión y no
 * entra en el reporte por rubro. Mueve el saldo de la cuenta y deja dicho por
 * qué, que es exactamente lo que faltaba.
 */
export async function registrarIngresoManual(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);
  const parsed = ingresoManualSchema.safeParse({
    cuenta_id: formData.get("cuenta_id"),
    monto: formData.get("monto"),
    concepto: formData.get("concepto"),
    fecha: formData.get("fecha"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const data = parsed.data;

  if (data.fecha && data.fecha > hoyAr()) {
    return { ok: false, errors: { fecha: ["No se puede cargar a futuro"] } };
  }

  const db = getDb();
  try {
    const [cuenta] = await db
      .select()
      .from(cuentasBancariasTable)
      .where(eq(cuentasBancariasTable.id, data.cuenta_id))
      .limit(1);
    if (!cuenta) return { ok: false, errors: { cuenta_id: ["La cuenta no existe"] } };
    if (!isSucursalAllowed(scope, cuenta.sucursalId)) {
      return { ok: false, errors: { cuenta_id: ["Sin acceso a esa cuenta"] } };
    }

    // Con fecha pasada se puede caer en un día que ya se cerró: el arqueo de
    // ese día quedó congelado y este ingreso aparecería en el saldo sin estar
    // en ningún cierre.
    const cierre = await getCierreQueBloqueaFecha(
      cuenta.sucursalId,
      data.fecha ?? hoyAr(),
    );
    if (cierre) {
      return {
        ok: false,
        errors: {
          fecha: [
            `La caja del ${formatYmdAr(cierre.fecha)} ya está cerrada. Reabrí ese cierre desde Caja o cargá el ingreso con otra fecha.`,
          ],
        },
      };
    }

    await db.insert(movimientosBancariosTable).values({
      id: createId(),
      cuentaId: cuenta.id,
      // Mediodía argentino, igual que las ventas retroactivas: cae dentro del
      // día elegido mire desde donde se mire.
      fecha: data.fecha ? new Date(`${data.fecha}T12:00:00-03:00`) : new Date(),
      tipo: "ingreso",
      monto: Math.abs(data.monto),
      sucursalId: cuenta.sucursalId,
      refTipo: "manual",
      refId: null,
      descripcion: data.concepto,
      usuarioId: user.id,
    });
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [error instanceof Error ? error.message : "No se pudo registrar"],
      },
    };
  }

  revalidatePath("/bancos");
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Deshace un ingreso manual cargado por error.
 *
 * Pedido por la encargada de Yerba Buena: cargó un ingreso que no era y no
 * tuvo cómo sacarlo. No se borra: se asienta un ajuste por el mismo monto en
 * negativo, con la misma fecha y apuntando al original (ref_tipo
 * "anulacion_manual", ref_id = id del ingreso). Así el saldo vuelve solo —
 * cualquier suma de movimientos lo ve— y en la lista quedan los dos renglones,
 * el que entró y el que lo anuló con su motivo. El arqueo del día descarta el
 * par (ver getEstadoCajaDelDia) para no inflar ingresos y egresos.
 *
 * Sólo ingresos manuales: los movimientos que nacen de una venta, un gasto o
 * una gift card se anulan desde su pantalla, que además revierte lo demás.
 */
export async function anularIngresoManual(
  movimientoId: string,
  motivo: string,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);
  const nota = motivo?.trim();
  if (!nota) {
    return { ok: false, errors: { motivo: ["Contá por qué se anula"] } };
  }

  const db = getDb();
  const [mov] = await db
    .select()
    .from(movimientosBancariosTable)
    .where(eq(movimientosBancariosTable.id, movimientoId))
    .limit(1);
  if (!mov) return failure("Movimiento no encontrado");
  if (!mov.sucursalId || !isSucursalAllowed(scope, mov.sucursalId)) {
    return failure("No tenés acceso a ese movimiento");
  }
  if (mov.refTipo !== "manual" || mov.tipo !== "ingreso") {
    return failure(
      "Sólo se pueden anular acá los ingresos cargados a mano. Este movimiento se anula desde la pantalla que lo generó.",
    );
  }

  const ymd = fechaArDeISO(mov.fecha.toISOString());
  const cierre = await getCierreQueBloqueaFecha(mov.sucursalId, ymd);
  if (cierre) {
    return failure(
      `La caja del ${formatYmdAr(cierre.fecha)} ya está cerrada y este ingreso entró en ese arqueo. Reabrí ese cierre desde Caja y volvé a intentarlo.`,
    );
  }

  try {
    await db.transaction(async (tx) => {
      // Se vuelve a mirar pegado al insert: un doble clic no tiene que dejar
      // dos contra-asientos.
      const [yaAnulado] = await tx
        .select({ id: movimientosBancariosTable.id })
        .from(movimientosBancariosTable)
        .where(
          and(
            eq(movimientosBancariosTable.refTipo, "anulacion_manual"),
            eq(movimientosBancariosTable.refId, mov.id),
          ),
        )
        .limit(1);
      if (yaAnulado) throw new Error("Este ingreso ya estaba anulado");

      await tx.insert(movimientosBancariosTable).values({
        id: createId(),
        cuentaId: mov.cuentaId,
        // Misma fecha que el original: el par cae en el mismo día y el saldo
        // "al cierre de" cualquier fecha queda bien.
        fecha: mov.fecha,
        tipo: "ajuste",
        monto: -mov.monto,
        sucursalId: mov.sucursalId,
        refTipo: "anulacion_manual",
        refId: mov.id,
        descripcion: `Anulación de "${mov.descripcion ?? "ingreso manual"}": ${nota}`,
        usuarioId: user.id,
      });
    });
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "No se pudo anular",
    );
  }

  revalidatePath("/bancos");
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  return { ok: true };
}
