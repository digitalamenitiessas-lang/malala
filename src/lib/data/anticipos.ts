"use server";

import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { requireSupabaseRuntime } from "@/lib/db/env";
import {
  anticipos as anticiposTable,
  aperturasCaja as aperturasCajaTable,
  cierresCaja as cierresCajaTable,
  egresos as egresosTable,
  empleados as empleadosTable,
  rubrosGasto as rubrosGastoTable,
} from "@/lib/db/schema";
import { getActiveSucursalForUser, requireUser } from "@/lib/auth/session";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import { fieldErrors, requireRole, type ActionResult } from "./_helpers";
import {
  emitMovimientoBancarioTx,
  getCuentaIdForMpTx,
} from "./movimientos-bancarios-helpers";
import { anticipoSchema } from "@/lib/validations/anticipo";
import type { Anticipo } from "@/lib/types";
import { finDeDiaArISO, hoyAr, inicioDeDiaArISO } from "@/lib/fecha-ar";

function createId() {
  return crypto.randomUUID();
}

// El período de una liquidación son días ARGENTINOS. Construirlos con el reloj
// del proceso (UTC) corría el rango tres horas y dejaba los anticipos del
// último día de la noche fuera del período que los tenía que descontar.
const isoStart = inicioDeDiaArISO;
const isoEnd = finDeDiaArISO;

function mapAnticipo(row: typeof anticiposTable.$inferSelect): Anticipo {
  return {
    id: row.id,
    empleado_id: row.empleadoId,
    sucursal_id: row.sucursalId,
    fecha: row.fecha.toISOString(),
    monto: row.monto,
    mp_id: row.mpId ?? undefined,
    egreso_id: row.egresoId ?? undefined,
    liquidacion_id: row.liquidacionId ?? undefined,
    observacion: row.observacion ?? undefined,
    usuario_id: row.usuarioId,
    creado_en: row.creadoEn.toISOString(),
  };
}

/**
 * Anticipos de un empleado (más recientes primero), confinados a las sucursales
 * permitidas del usuario. Los anticipos son por sucursal, así que una encargada
 * solo ve los de su sucursal aunque el empleado rote entre locales.
 */
export async function listAnticipos(empleadoId: string): Promise<Anticipo[]> {
  requireSupabaseRuntime("Los anticipos requieren Supabase configurado.");
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();
  const rows = await db
    .select()
    .from(anticiposTable)
    .where(
      and(
        eq(anticiposTable.empleadoId, empleadoId),
        inArray(anticiposTable.sucursalId, scope.sucursalIdsPermitidas),
      ),
    )
    .orderBy(desc(anticiposTable.fecha), desc(anticiposTable.creadoEn));
  return rows.map(mapAnticipo);
}

/**
 * Anticipos pendientes de descontar (liquidacion_id null) de un empleado en una
 * sucursal, dentro de un período. Se usan al previsualizar/crear la liquidación.
 */
export async function listAnticiposPendientesPeriodo(args: {
  empleadoId: string;
  sucursalId: string;
  desde: string;
  hasta: string;
}): Promise<Anticipo[]> {
  requireSupabaseRuntime("Los anticipos requieren Supabase configurado.");
  const db = getDb();
  const rows = await db
    .select()
    .from(anticiposTable)
    .where(
      and(
        eq(anticiposTable.empleadoId, args.empleadoId),
        eq(anticiposTable.sucursalId, args.sucursalId),
        isNull(anticiposTable.liquidacionId),
        gte(anticiposTable.fecha, new Date(isoStart(args.desde))),
        lte(anticiposTable.fecha, new Date(isoEnd(args.hasta))),
      ),
    )
    .orderBy(asc(anticiposTable.fecha));
  return rows.map(mapAnticipo);
}

export async function registrarAnticipo(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime("Los anticipos requieren Supabase configurado.");

  const parsed = anticipoSchema.safeParse({
    empleado_id: formData.get("empleado_id"),
    monto: formData.get("monto"),
    mp_id: formData.get("mp_id"),
    observacion: formData.get("observacion"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const data = parsed.data;

  const scope = buildAccessScope(user);
  const sucursal = await getActiveSucursalForUser(user);
  if (!sucursal || !isSucursalAllowed(scope, sucursal.id)) {
    return { ok: false, errors: { _: ["Sin sucursal activa válida"] } };
  }

  const db = getDb();

  const [empleado] = await db
    .select({ nombre: empleadosTable.nombre })
    .from(empleadosTable)
    .where(eq(empleadosTable.id, data.empleado_id))
    .limit(1);
  if (!empleado) return { ok: false, errors: { _: ["Empleado no encontrado"] } };

  const [rubro] = await db
    .select({ id: rubrosGastoTable.id })
    .from(rubrosGastoTable)
    .where(ilike(rubrosGastoTable.rubro, "Sueldos"))
    .limit(1);
  if (!rubro) {
    return {
      ok: false,
      errors: {
        _: [
          'No existe el rubro de gasto "Sueldos". Creálo en Catálogos → Rubros antes de cargar anticipos.',
        ],
      },
    };
  }

  const ahora = new Date();
  // Fecha argentina: el cierre de caja se guarda con la fecha local, no UTC.
  const ymdHoy = hoyAr();
  const egresoId = createId();
  const anticipoId = createId();
  const observacionEgreso =
    `Anticipo ${empleado.nombre}` +
    (data.observacion ? ` — ${data.observacion}` : "");

  try {
    await db.transaction(async (tx) => {
      const [cierreDelDia] = await tx
        .select({ id: cierresCajaTable.id })
        .from(cierresCajaTable)
        .where(
          and(
            eq(cierresCajaTable.sucursalId, sucursal.id),
            eq(cierresCajaTable.fecha, ymdHoy),
          ),
        )
        .limit(1);
      if (cierreDelDia) {
        throw new Error(
          `La caja del ${ymdHoy} ya está cerrada para esta sucursal. Reabrí el cierre antes de registrar el anticipo.`,
        );
      }

      // Apertura obligatoria: el anticipo genera un egreso, así que requiere la
      // caja del día abierta en esta sucursal.
      const [aperturaDelDia] = await tx
        .select({ id: aperturasCajaTable.id })
        .from(aperturasCajaTable)
        .where(
          and(
            eq(aperturasCajaTable.sucursalId, sucursal.id),
            eq(aperturasCajaTable.fecha, ymdHoy),
          ),
        )
        .limit(1);
      if (!aperturaDelDia) {
        throw new Error(
          `Tenés que abrir la caja del ${ymdHoy} antes de registrar anticipos.`,
        );
      }

      await tx.insert(egresosTable).values({
        id: egresoId,
        fecha: ahora,
        sucursalId: sucursal.id,
        rubroId: rubro.id,
        valor: data.monto,
        mpId: data.mp_id,
        observacion: observacionEgreso,
        pagado: true,
        usuarioId: user.id,
      });

      const cuentaId = await getCuentaIdForMpTx(tx, data.mp_id);
      if (cuentaId) {
        await emitMovimientoBancarioTx(tx, {
          cuentaId,
          fecha: ahora,
          monto: -Math.abs(data.monto),
          tipo: "egreso",
          sucursalId: sucursal.id,
          refTipo: "egreso",
          refId: egresoId,
          descripcion: observacionEgreso,
          usuarioId: user.id,
        });
      }

      await tx.insert(anticiposTable).values({
        id: anticipoId,
        empleadoId: data.empleado_id,
        sucursalId: sucursal.id,
        fecha: ahora,
        monto: data.monto,
        mpId: data.mp_id,
        egresoId,
        liquidacionId: null,
        observacion: data.observacion ?? null,
        usuarioId: user.id,
      });
    });
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [
          error instanceof Error ? error.message : "No se pudo registrar el anticipo",
        ],
      },
    };
  }

  revalidatePath(`/catalogos/empleados/${data.empleado_id}`);
  revalidatePath("/catalogos/empleados");
  revalidatePath("/egresos");
  revalidatePath("/caja");
  revalidatePath("/bancos");
  revalidatePath("/dashboard");
  return { ok: true };
}
