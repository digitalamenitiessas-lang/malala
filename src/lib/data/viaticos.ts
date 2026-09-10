"use server";

import { and, asc, eq, gte, ilike, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import {
  empleados as empleadosTable,
  egresos as egresosTable,
  movimientosBancarios as movimientosBancariosTable,
  rubrosGasto as rubrosGastoTable,
  viaticos as viaticosTable,
} from "@/lib/db/schema";
import {
  emitMovimientoBancarioTx,
  getCuentaIdForMpTx,
} from "./movimientos-bancarios-helpers";
import { fieldErrors, requireRole, type ActionResult } from "./_helpers";
import { getCierreQueBloqueaFecha } from "./caja";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import { getActiveSucursalForUser } from "@/lib/auth/session";
import { viaticoSchema } from "@/lib/validations/viatico";

/**
 * Viáticos: el almuerzo que el salón le paga a una empleada un día puntual.
 *
 * ANTES esto no se cargaba: salía de empleados.viatico_por_dia (un fijo en la
 * ficha, hoy en cero para las 12) multiplicado por una cantidad de días que se
 * tipeaba al liquidar y que el sistema sugería contando las fechas en que a esa
 * empleada le habían vendido algo. O sea, adivinaba la asistencia a partir de
 * las ventas, y el monto no podía variar de un día a otro.
 *
 * AHORA se carga el día que se da, con su monto, y la liquidación suma los del
 * período.
 *
 * `pagado` es la única bifurcación, y existe porque los dos casos pasan en el
 * mostrador: si la plata se le dio en el momento se genera el egreso y en la
 * liquidación figura como ya entregada; si no, se paga junto con la quincena.
 * Sin esa distinción, un viático entregado en efectivo se pagaría dos veces.
 */

export interface Viatico {
  id: string;
  empleado_id: string;
  sucursal_id: string;
  fecha: string; // YYYY-MM-DD
  monto: number;
  pagado: boolean;
  egreso_id?: string;
  liquidacion_id?: string;
  observacion?: string;
}

function createId() {
  return crypto.randomUUID();
}

function mapViatico(row: typeof viaticosTable.$inferSelect): Viatico {
  return {
    id: row.id,
    empleado_id: row.empleadoId,
    sucursal_id: row.sucursalId,
    fecha: row.fecha,
    monto: row.monto,
    pagado: row.pagado,
    egreso_id: row.egresoId ?? undefined,
    liquidacion_id: row.liquidacionId ?? undefined,
    observacion: row.observacion ?? undefined,
  };
}

export interface ListViaticosOpts {
  empleadoId?: string;
  sucursalId?: string;
  desde?: string; // YYYY-MM-DD
  hasta?: string; // YYYY-MM-DD
  /** Sólo los que todavía no entraron en una liquidación. */
  soloPendientes?: boolean;
}

export async function listViaticos(
  opts: ListViaticosOpts = {},
): Promise<Viatico[]> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);
  const db = getDb();

  const filtros = [];
  if (opts.empleadoId) filtros.push(eq(viaticosTable.empleadoId, opts.empleadoId));
  if (opts.sucursalId) {
    if (!isSucursalAllowed(scope, opts.sucursalId)) return [];
    filtros.push(eq(viaticosTable.sucursalId, opts.sucursalId));
  }
  if (opts.desde) filtros.push(gte(viaticosTable.fecha, opts.desde));
  if (opts.hasta) filtros.push(lte(viaticosTable.fecha, opts.hasta));
  if (opts.soloPendientes) filtros.push(isNull(viaticosTable.liquidacionId));

  const rows = await db
    .select()
    .from(viaticosTable)
    .where(filtros.length > 0 ? and(...filtros) : undefined)
    .orderBy(asc(viaticosTable.fecha));
  return rows
    .filter((r) => isSucursalAllowed(scope, r.sucursalId))
    .map(mapViatico);
}

export async function registrarViatico(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);

  const parsed = viaticoSchema.safeParse({
    empleado_id: formData.get("empleado_id"),
    fecha: formData.get("fecha"),
    monto: formData.get("monto"),
    pagado: formData.get("pagado"),
    mp_id: formData.get("mp_id"),
    observacion: formData.get("observacion"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const data = parsed.data;

  if (data.pagado && !data.mp_id) {
    return {
      ok: false,
      errors: { mp_id: ["Decí con qué se le dio la plata"] },
    };
  }

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
  if (!empleado) {
    return { ok: false, errors: { empleado_id: ["Empleada no encontrada"] } };
  }

  const yaHay = await db
    .select({ id: viaticosTable.id })
    .from(viaticosTable)
    .where(
      and(
        eq(viaticosTable.empleadoId, data.empleado_id),
        eq(viaticosTable.fecha, data.fecha),
      ),
    )
    .limit(1);
  if (yaHay.length > 0) {
    return {
      ok: false,
      errors: {
        fecha: [`${empleado.nombre} ya tiene un viático cargado ese día`],
      },
    };
  }

  const viaticoId = createId();
  const ahora = new Date();
  const detalle =
    `Viático ${empleado.nombre} (${data.fecha})` +
    (data.observacion ? ` — ${data.observacion}` : "");

  try {
    await db.transaction(async (tx) => {
      let egresoId: string | null = null;

      if (data.pagado) {
        const [rubro] = await tx
          .select({ id: rubrosGastoTable.id })
          .from(rubrosGastoTable)
          .where(ilike(rubrosGastoTable.rubro, "Sueldos"))
          .limit(1);
        if (!rubro) {
          throw new Error(
            'No existe el rubro de gasto "Sueldos", que es donde se imputa el viático.',
          );
        }

        egresoId = createId();
        await tx.insert(egresosTable).values({
          id: egresoId,
          fecha: ahora,
          sucursalId: sucursal.id,
          rubroId: rubro.id,
          valor: data.monto,
          mpId: data.mp_id!,
          observacion: detalle,
          pagado: true,
          usuarioId: user.id,
        });

        const cuentaId = await getCuentaIdForMpTx(tx, data.mp_id!);
        if (cuentaId) {
          await emitMovimientoBancarioTx(tx, {
            cuentaId,
            fecha: ahora,
            monto: -Math.abs(data.monto),
            tipo: "egreso",
            sucursalId: sucursal.id,
            refTipo: "egreso",
            refId: egresoId,
            descripcion: detalle,
            usuarioId: user.id,
          });
        }
      }

      await tx.insert(viaticosTable).values({
        id: viaticoId,
        empleadoId: data.empleado_id,
        sucursalId: sucursal.id,
        fecha: data.fecha,
        monto: data.monto,
        pagado: data.pagado,
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
          error instanceof Error ? error.message : "No se pudo cargar el viático",
        ],
      },
    };
  }

  revalidatePath(`/catalogos/empleados/${data.empleado_id}`);
  revalidatePath("/egresos");
  revalidatePath("/caja");
  revalidatePath("/liquidaciones");
  return { ok: true };
}

/**
 * Borra un viático y deshace lo que haya generado.
 *
 * El único freno real es la liquidación: una vez que el número se usó para
 * pagarle a alguien, borrarlo dejaría esa liquidación sin respaldo.
 *
 * Que esté pagado NO es un freno. Antes lo era, y mandaba a "anulá el gasto
 * desde Gastos" — una salida que no existe: los egresos no tienen anulación en
 * el sistema. O sea que un viático cargado con "ya se lo di" (que es la opción
 * por defecto) quedaba imposible de borrar. Acá se borra el egreso y su
 * movimiento bancario en la misma transacción, así la caja del día vuelve a
 * cuadrar sola.
 */
export async function borrarViatico(viaticoId: string): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);
  const db = getDb();

  const [row] = await db
    .select()
    .from(viaticosTable)
    .where(eq(viaticosTable.id, viaticoId))
    .limit(1);
  if (!row) return { ok: false, errors: { _: ["No encontrado"] } };
  if (!isSucursalAllowed(scope, row.sucursalId)) {
    return { ok: false, errors: { _: ["Sin acceso a esa sucursal"] } };
  }
  if (row.liquidacionId) {
    return {
      ok: false,
      errors: {
        _: ["Ya entró en una liquidación: no se puede borrar."],
      },
    };
  }

  // Si el viático movió plata y esa caja ya se cerró, borrarlo cambiaría un
  // día cuyo arqueo ya está firmado. Primero hay que reabrir el cierre.
  if (row.egresoId) {
    const [egresoRow] = await db
      .select({ fecha: egresosTable.fecha })
      .from(egresosTable)
      .where(eq(egresosTable.id, row.egresoId))
      .limit(1);
    if (egresoRow) {
      const cierre = await getCierreQueBloqueaFecha(
        row.sucursalId,
        egresoRow.fecha.toISOString(),
      );
      if (cierre) {
        return {
          ok: false,
          errors: {
            _: [
              `La caja del ${cierre.fecha} ya está cerrada y este viático salió de ahí. Reabrí ese cierre desde Caja y volvé a intentarlo.`,
            ],
          },
        };
      }
    }
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(viaticosTable).where(eq(viaticosTable.id, viaticoId));

      if (row.egresoId) {
        // Por ref_id y no por id: si la cuenta tiene impuestos configurados, el
        // egreso emitió más de un movimiento y hay que llevarse todos.
        await tx
          .delete(movimientosBancariosTable)
          .where(eq(movimientosBancariosTable.refId, row.egresoId));
        await tx.delete(egresosTable).where(eq(egresosTable.id, row.egresoId));
      }
    });
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [
          error instanceof Error ? error.message : "No se pudo borrar el viático",
        ],
      },
    };
  }

  revalidatePath(`/catalogos/empleados/${row.empleadoId}`);
  revalidatePath("/egresos");
  revalidatePath("/caja");
  revalidatePath("/bancos");
  revalidatePath("/liquidaciones");
  return { ok: true };
}
