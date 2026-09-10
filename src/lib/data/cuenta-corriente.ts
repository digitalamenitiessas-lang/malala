"use server";

import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { requireSupabaseRuntime } from "@/lib/db/env";
import {
  clientes as clientesTable,
  movimientosCc as movimientosCcTable,
} from "@/lib/db/schema";
import { getActiveSucursalForUser } from "@/lib/auth/session";
import { fieldErrors, requireRole, type ActionResult } from "./_helpers";
import {
  emitMovimientoBancarioTx,
  getCuentaIdForMpTx,
} from "./movimientos-bancarios-helpers";
import { cargoCcSchema, pagoCcSchema } from "@/lib/validations/cuenta-corriente";
import type { MovimientoCc, TipoMovimientoCc } from "@/lib/types";

// Tolerancia para comparaciones de punto flotante en pesos.
const EPS = 0.01;

function createId() {
  return crypto.randomUUID();
}

function mapMovimiento(
  row: typeof movimientosCcTable.$inferSelect,
): MovimientoCc {
  return {
    id: row.id,
    cliente_id: row.clienteId,
    fecha: row.fecha.toISOString(),
    tipo: row.tipo as TipoMovimientoCc,
    monto: row.monto,
    sucursal_id: row.sucursalId ?? undefined,
    mp_id: row.mpId ?? undefined,
    ref_tipo: row.refTipo ?? undefined,
    ref_id: row.refId ?? undefined,
    descripcion: row.descripcion ?? undefined,
    usuario_id: row.usuarioId,
    creado_en: row.creadoEn.toISOString(),
  };
}

export async function listMovimientosCc(
  clienteId: string,
): Promise<MovimientoCc[]> {
  requireSupabaseRuntime(
    "Los movimientos de cuenta corriente requieren Supabase.",
  );
  const db = getDb();
  const rows = await db
    .select()
    .from(movimientosCcTable)
    .where(eq(movimientosCcTable.clienteId, clienteId))
    .orderBy(desc(movimientosCcTable.fecha), desc(movimientosCcTable.creadoEn));
  return rows.map(mapMovimiento);
}

export interface DeudorCc {
  cliente_id: string;
  nombre: string;
  saldo: number;
  ultimo_concepto?: string;
  ultima_fecha?: string;
}

/**
 * Clientes con deuda pendiente en cuenta corriente (saldo > 0), ordenados de
 * mayor a menor, con el último concepto fiado de cada uno. El saldo_cc es global
 * (no por sucursal), así que lista a todos los deudores.
 */
export async function getDeudoresCc(): Promise<DeudorCc[]> {
  requireSupabaseRuntime(
    "La cuenta corriente requiere Supabase configurado.",
  );
  const db = getDb();

  const deudores = await db
    .select({
      id: clientesTable.id,
      nombre: clientesTable.nombre,
      saldo: clientesTable.saldoCc,
    })
    .from(clientesTable)
    .where(gt(clientesTable.saldoCc, EPS))
    .orderBy(desc(clientesTable.saldoCc));
  if (deudores.length === 0) return [];

  const ids = deudores.map((d) => d.id);
  const cargos = await db
    .select({
      clienteId: movimientosCcTable.clienteId,
      fecha: movimientosCcTable.fecha,
      descripcion: movimientosCcTable.descripcion,
    })
    .from(movimientosCcTable)
    .where(
      and(
        inArray(movimientosCcTable.clienteId, ids),
        eq(movimientosCcTable.tipo, "cargo"),
      ),
    )
    .orderBy(desc(movimientosCcTable.fecha));

  // El primer cargo por cliente (ya ordenados por fecha desc) es el más reciente.
  const ultimoPorCliente = new Map<
    string,
    { descripcion: string | null; fecha: Date }
  >();
  for (const c of cargos) {
    if (!ultimoPorCliente.has(c.clienteId)) {
      ultimoPorCliente.set(c.clienteId, {
        descripcion: c.descripcion,
        fecha: c.fecha,
      });
    }
  }

  return deudores.map((d) => {
    const u = ultimoPorCliente.get(d.id);
    return {
      cliente_id: d.id,
      nombre: d.nombre,
      saldo: d.saldo,
      ultimo_concepto: u?.descripcion ?? undefined,
      ultima_fecha: u?.fecha.toISOString(),
    };
  });
}

export interface SaldoAFavorCc {
  cliente_id: string;
  nombre: string;
  /** Siempre positivo: lo que el local le debe al cliente. */
  a_favor: number;
}

/**
 * Clientes con plata a favor. Es el mismo saldo_cc que la deuda pero del otro
 * lado del cero (negativo), y se devuelve en positivo para que la vista no
 * tenga que acordarse del signo.
 */
export async function getSaldosAFavorCc(): Promise<SaldoAFavorCc[]> {
  requireSupabaseRuntime("La cuenta corriente requiere Supabase configurado.");
  const db = getDb();

  const rows = await db
    .select({
      id: clientesTable.id,
      nombre: clientesTable.nombre,
      saldo: clientesTable.saldoCc,
    })
    .from(clientesTable)
    .where(lt(clientesTable.saldoCc, -EPS))
    .orderBy(asc(clientesTable.saldoCc));

  return rows.map((r) => ({
    cliente_id: r.id,
    nombre: r.nombre,
    a_favor: -r.saldo,
  }));
}

export async function toggleCuentaCorriente(
  clienteId: string,
): Promise<ActionResult> {
  await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime("La cuenta corriente requiere Supabase configurado.");

  const db = getDb();
  const [cliente] = await db
    .select()
    .from(clientesTable)
    .where(eq(clientesTable.id, clienteId))
    .limit(1);
  if (!cliente) return { ok: false, errors: { _: ["Cliente no encontrado"] } };

  // No permitir deshabilitar con deuda pendiente: se perdería el rastro del saldo.
  if (cliente.cuentaCorrienteHabilitada && Math.abs(cliente.saldoCc) > EPS) {
    return {
      ok: false,
      errors: {
        _: [
          "No se puede deshabilitar la cuenta corriente con saldo pendiente. Saldá la deuda primero.",
        ],
      },
    };
  }

  await db
    .update(clientesTable)
    .set({ cuentaCorrienteHabilitada: !cliente.cuentaCorrienteHabilitada })
    .where(eq(clientesTable.id, clienteId));

  revalidatePath(`/catalogos/clientes/${clienteId}`);
  revalidatePath("/catalogos/clientes");
  revalidatePath("/ventas/nueva");
  return { ok: true };
}

export async function registrarCargoCc(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime("La cuenta corriente requiere Supabase configurado.");

  const parsed = cargoCcSchema.safeParse({
    cliente_id: formData.get("cliente_id"),
    monto: formData.get("monto"),
    descripcion: formData.get("descripcion"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const data = parsed.data;

  const sucursal = await getActiveSucursalForUser(user);
  const db = getDb();
  const fecha = new Date();

  try {
    await db.transaction(async (tx) => {
      const [cliente] = await tx
        .select()
        .from(clientesTable)
        .where(eq(clientesTable.id, data.cliente_id))
        .limit(1);
      if (!cliente) throw new Error("Cliente no encontrado");
      if (!cliente.cuentaCorrienteHabilitada) {
        throw new Error("El cliente no tiene la cuenta corriente habilitada");
      }

      await tx.insert(movimientosCcTable).values({
        id: createId(),
        clienteId: data.cliente_id,
        fecha,
        tipo: "cargo",
        monto: data.monto,
        sucursalId: sucursal?.id ?? null,
        mpId: null,
        refTipo: "manual",
        refId: null,
        descripcion: data.descripcion ?? null,
        usuarioId: user.id,
      });

      await tx
        .update(clientesTable)
        .set({ saldoCc: cliente.saldoCc + data.monto })
        .where(eq(clientesTable.id, data.cliente_id));
    });
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [error instanceof Error ? error.message : "No se pudo registrar el cargo"],
      },
    };
  }

  revalidatePath(`/catalogos/clientes/${data.cliente_id}`);
  revalidatePath("/catalogos/clientes");
  return { ok: true };
}

/**
 * Asiento compartido de "el cliente entrega plata": baja su saldo e ingresa el
 * monto a bancos por el medio de pago elegido.
 *
 * Pagar una deuda y dejar saldo a favor son el mismo asiento; lo único que
 * cambia es hasta dónde se puede bajar el saldo. El pago se frena en cero (si
 * paga de más, es un vuelto que hay que devolver, no un pago) y el saldo a
 * favor justamente lo cruza.
 */
async function recibirPlataDeClienteCc(
  formData: FormData,
  modo: {
    topeEnLaDeuda: boolean;
    refTipo: string;
    descripcionPorDefecto: string | null;
    descripcionBanco: string;
    errorGenerico: string;
  },
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime("La cuenta corriente requiere Supabase configurado.");

  const parsed = pagoCcSchema.safeParse({
    cliente_id: formData.get("cliente_id"),
    monto: formData.get("monto"),
    mp_id: formData.get("mp_id"),
    cuenta_id: formData.get("cuenta_id"),
    descripcion: formData.get("descripcion"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const data = parsed.data;

  const sucursal = await getActiveSucursalForUser(user);
  const db = getDb();
  const fecha = new Date();

  try {
    await db.transaction(async (tx) => {
      const [cliente] = await tx
        .select()
        .from(clientesTable)
        .where(eq(clientesTable.id, data.cliente_id))
        .limit(1);
      if (!cliente) throw new Error("Cliente no encontrado");
      if (!cliente.cuentaCorrienteHabilitada) {
        throw new Error("El cliente no tiene la cuenta corriente habilitada");
      }

      const monto = data.monto;
      if (modo.topeEnLaDeuda) {
        if (cliente.saldoCc <= EPS) {
          throw new Error("El cliente no tiene deuda pendiente");
        }
        if (monto > cliente.saldoCc + EPS) {
          throw new Error(
            `El pago no puede superar la deuda (${cliente.saldoCc.toFixed(2)})`,
          );
        }
      }

      await tx.insert(movimientosCcTable).values({
        id: createId(),
        clienteId: data.cliente_id,
        fecha,
        tipo: "pago",
        monto,
        sucursalId: sucursal?.id ?? null,
        mpId: data.mp_id,
        refTipo: modo.refTipo,
        refId: null,
        descripcion: data.descripcion ?? modo.descripcionPorDefecto,
        usuarioId: user.id,
      });

      await tx
        .update(clientesTable)
        .set({ saldoCc: cliente.saldoCc - monto })
        .where(eq(clientesTable.id, data.cliente_id));

      // La plata entra a bancos por la cuenta elegida en el form (override) o,
      // si no se eligió, por la cuenta por defecto del medio de pago. Si no hay
      // ninguna, igual se registra (baja el saldo) pero no impacta en bancos
      // hasta asignarle una cuenta.
      const cuentaId =
        data.cuenta_id ?? (await getCuentaIdForMpTx(tx, data.mp_id));
      if (cuentaId) {
        await emitMovimientoBancarioTx(tx, {
          cuentaId,
          fecha,
          monto,
          tipo: "ingreso",
          sucursalId: sucursal?.id ?? null,
          refTipo: "cc_pago",
          refId: data.cliente_id,
          descripcion: modo.descripcionBanco,
          usuarioId: user.id,
        });
      }
    });
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [error instanceof Error ? error.message : modo.errorGenerico],
      },
    };
  }

  revalidatePath(`/catalogos/clientes/${data.cliente_id}`);
  revalidatePath("/catalogos/clientes");
  revalidatePath("/caja");
  revalidatePath("/bancos");
  // El form de venta avisa cuánto tiene a favor la clienta: si no se revalida,
  // sigue mostrando el saldo viejo.
  revalidatePath("/ventas/nueva");
  return { ok: true };
}

/**
 * Registra un pago de cuenta corriente: baja la deuda del cliente e ingresa la
 * plata a bancos por el medio de pago elegido. No permite pagar de más.
 */
export async function registrarPagoCc(
  formData: FormData,
): Promise<ActionResult> {
  return recibirPlataDeClienteCc(formData, {
    topeEnLaDeuda: true,
    refTipo: "manual",
    descripcionPorDefecto: null,
    descripcionBanco: "Pago de cuenta corriente",
    errorGenerico: "No se pudo registrar el pago",
  });
}

/**
 * La clienta deja plata a favor: paga con un billete grande, no se lleva el
 * vuelto y lo usa la próxima vez.
 *
 * Esa plata queda en la caja hoy, así que entra a bancos igual que cualquier
 * cobro — si no, el arqueo del día cerraría con sobrante. Lo que queda pendiente
 * no es plata sino la obligación con la clienta, y eso es el saldo_cc en
 * negativo. Se consume solo: la próxima venta cobrada con el medio "CC" genera
 * el cargo que lo lleva de vuelta a cero.
 */
export async function registrarSaldoAFavorCc(
  formData: FormData,
): Promise<ActionResult> {
  return recibirPlataDeClienteCc(formData, {
    topeEnLaDeuda: false,
    refTipo: "saldo_favor",
    descripcionPorDefecto: "Saldo a favor (no se llevó el vuelto)",
    descripcionBanco: "Saldo a favor de clienta",
    errorGenerico: "No se pudo registrar el saldo a favor",
  });
}
