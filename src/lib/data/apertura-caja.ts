"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import {
  aperturasCaja as aperturasCajaTable,
  aperturaCajaCuentas as aperturaCajaCuentasTable,
  cierresCaja as cierresCajaTable,
} from "@/lib/db/schema";
import { fieldErrors, requireRole, type ActionResult } from "./_helpers";
import { aperturaCajaSchema } from "@/lib/validations/caja";
import { listSaldos } from "./cuentas-bancarias";
import {
  deleteMovimientosByRefTx,
  emitMovimientoBancarioTx,
} from "./movimientos-bancarios-helpers";
import type {
  AperturaCaja,
  AperturaCuentaLinea,
  CuentaBancaria,
} from "@/lib/types";

function createId() {
  return crypto.randomUUID();
}

// Diferencias menores a un centavo se consideran iguales (ruido de float).
const EPSILON = 0.005;

/**
 * No se puede abrir una caja nueva si quedó otra sin cerrar. Lleva la fecha
 * aparte del mensaje porque la pantalla necesita armar con ella el link para
 * ir a cerrarla: quedarse sólo con la frase dejaba a la encargada trabada sin
 * saber adónde ir.
 */
class CajaAbiertaError extends Error {
  constructor(readonly fecha: string) {
    super(`Ya hay una caja abierta del ${fecha}. Cerrala antes de abrir otra.`);
    this.name = "CajaAbiertaError";
  }
}

function mapApertura(row: typeof aperturasCajaTable.$inferSelect): AperturaCaja {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    fecha: row.fecha,
    abierto_por: row.abiertoPor,
    fecha_apertura: row.fechaApertura.toISOString(),
    observacion: row.observacion ?? undefined,
  };
}

function mapLinea(
  row: typeof aperturaCajaCuentasTable.$inferSelect,
): AperturaCuentaLinea {
  return {
    id: row.id,
    apertura_id: row.aperturaId,
    cuenta_id: row.cuentaId,
    saldo_esperado: row.saldoEsperado,
    saldo_declarado: row.saldoDeclarado,
  };
}

export interface AperturaCuentaSugerida {
  cuenta: CuentaBancaria;
  esperado: number;
}

/**
 * Saldos actuales por cuenta activa de la sucursal: lo que la app calcula hoy
 * (suma de movimientos). Es el "esperado" que se prellena al abrir la caja.
 * Efectivo primero, después los bancos.
 */
export async function getSugerenciasApertura(
  sucursalId: string,
): Promise<AperturaCuentaSugerida[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja || !isSucursalAllowed(scope, sucursalId)) return [];

  const saldos = await listSaldos({ sucursalId });
  return saldos
    .filter((s) => s.cuenta.activo)
    .map((s) => ({ cuenta: s.cuenta, esperado: s.saldo }))
    .sort((a, b) => {
      // efectivo primero, luego alfabético por nombre
      const ae = a.cuenta.tipo === "efectivo" ? 0 : 1;
      const be = b.cuenta.tipo === "efectivo" ? 0 : 1;
      if (ae !== be) return ae - be;
      return a.cuenta.nombre.localeCompare(b.cuenta.nombre);
    });
}

export interface AperturaConDetalle {
  apertura: AperturaCaja;
  cuentas: AperturaCuentaLinea[];
}

export async function getAperturaDeFecha(
  sucursalId: string,
  fecha: string,
): Promise<AperturaConDetalle | null> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCaja || !isSucursalAllowed(scope, sucursalId)) return null;

  const db = getDb();
  const [row] = await db
    .select()
    .from(aperturasCajaTable)
    .where(
      and(
        eq(aperturasCajaTable.sucursalId, sucursalId),
        eq(aperturasCajaTable.fecha, fecha),
      ),
    )
    .limit(1);

  if (!row) return null;

  const lineas = await db
    .select()
    .from(aperturaCajaCuentasTable)
    .where(eq(aperturaCajaCuentasTable.aperturaId, row.id));

  return {
    apertura: mapApertura(row),
    cuentas: lineas.map(mapLinea),
  };
}

export type CrearAperturaResult =
  | { ok: true; aperturaId: string }
  | { ok: false; errors: Record<string, string[]> };

/**
 * Abre la caja del día: guarda lo declarado por cuenta y, si difiere del saldo
 * esperado, registra un movimiento de ajuste para que el saldo de la cuenta pase
 * a ser exactamente lo declarado. El form envía declarado_<cuentaId> por cuenta.
 */
export async function crearApertura(
  _prev: CrearAperturaResult | null,
  formData: FormData,
): Promise<CrearAperturaResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);

  const parsed = aperturaCajaSchema.safeParse({
    sucursal_id: formData.get("sucursal_id"),
    fecha: formData.get("fecha"),
    observacion: formData.get("observacion"),
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

  const db = getDb();

  const sugerencias = await getSugerenciasApertura(data.sucursal_id);
  if (sugerencias.length === 0) {
    return {
      ok: false,
      errors: { _: ["No hay cuentas cargadas en esta sucursal"] },
    };
  }

  const aperturaId = createId();
  const fechaApertura = new Date();

  try {
    await db.transaction(async (tx) => {
      // Checks atómicos dentro de la transacción para evitar race conditions.
      const [aperturas, cierres] = await Promise.all([
        tx
          .select({ fecha: aperturasCajaTable.fecha })
          .from(aperturasCajaTable)
          .where(eq(aperturasCajaTable.sucursalId, data.sucursal_id)),
        tx
          .select({ fecha: cierresCajaTable.fecha })
          .from(cierresCajaTable)
          .where(eq(cierresCajaTable.sucursalId, data.sucursal_id)),
      ]);
      const fechasCerradas = new Set(cierres.map((c) => c.fecha));
      const abierta = aperturas.find((a) => !fechasCerradas.has(a.fecha));
      if (abierta) throw new CajaAbiertaError(abierta.fecha);
      if (aperturas.some((a) => a.fecha === data.fecha))
        throw new Error("La caja de este día ya está abierta");

      await tx.insert(aperturasCajaTable).values({
        id: aperturaId,
        sucursalId: data.sucursal_id,
        fecha: data.fecha,
        abiertoPor: user.id,
        fechaApertura,
        observacion: data.observacion ?? null,
      });

      for (const sug of sugerencias) {
        const raw = formData.get(`declarado_${sug.cuenta.id}`);
        const declarado =
          typeof raw === "string" && raw !== "" ? Number(raw) : sug.esperado;
        if (!Number.isFinite(declarado)) continue;

        await tx.insert(aperturaCajaCuentasTable).values({
          id: createId(),
          aperturaId,
          cuentaId: sug.cuenta.id,
          saldoEsperado: sug.esperado,
          saldoDeclarado: declarado,
        });

        const diff = declarado - sug.esperado;
        if (Math.abs(diff) > EPSILON) {
          await emitMovimientoBancarioTx(tx, {
            cuentaId: sug.cuenta.id,
            fecha: fechaApertura,
            monto: diff,
            tipo: "ajuste",
            sucursalId: data.sucursal_id,
            refTipo: "apertura",
            refId: aperturaId,
            descripcion: "Ajuste de apertura de caja",
            usuarioId: user.id,
          });
        }
      }
    });
  } catch (error) {
    // La fecha bloqueante viaja aparte del texto, para que la pantalla pueda
    // ofrecer el link de cierre sin tener que leerla de la frase.
    if (error instanceof CajaAbiertaError) {
      return {
        ok: false,
        errors: { _: [error.message], caja_abierta: [error.fecha] },
      };
    }
    return {
      ok: false,
      errors: {
        _: [error instanceof Error ? error.message : "No se pudo abrir la caja"],
      },
    };
  }

  revalidatePath("/caja");
  revalidatePath("/bancos");
  revalidatePath("/dashboard");
  return { ok: true, aperturaId };
}

/**
 * Reabre (deshace) la apertura del día: borra la apertura, sus líneas y los
 * ajustes de saldo que generó, dejando los saldos como estaban antes de abrir.
 *
 * Lo puede hacer la encargada, no solo admin: la apertura se corrige el mismo
 * día y por quien contó la plata. El caso real es el vuelto que quedó del día
 * anterior, que hace que en el cajón haya más de lo que dice el cierre; si
 * corregirlo depende de que aparezca un admin, la plata queda sin registrar y
 * el arqueo arrastra la diferencia.
 */
export async function reabrirApertura(aperturaId: string): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);

  const db = getDb();
  const [apertura] = await db
    .select()
    .from(aperturasCajaTable)
    .where(eq(aperturasCajaTable.id, aperturaId))
    .limit(1);

  if (!apertura) {
    return { ok: false, errors: { _: ["Apertura no encontrada"] } };
  }
  if (!scope.sucursalIdsPermitidas.includes(apertura.sucursalId)) {
    return { ok: false, errors: { _: ["No tienes acceso a esa apertura"] } };
  }

  await db.transaction(async (tx) => {
    await deleteMovimientosByRefTx(tx, "apertura", aperturaId);
    await tx
      .delete(aperturaCajaCuentasTable)
      .where(eq(aperturaCajaCuentasTable.aperturaId, aperturaId));
    await tx.delete(aperturasCajaTable).where(eq(aperturasCajaTable.id, aperturaId));
  });

  revalidatePath("/caja");
  revalidatePath("/bancos");
  revalidatePath("/dashboard");
  return { ok: true };
}
