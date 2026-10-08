"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { requireSupabaseRuntime } from "@/lib/db/env";
import {
  cierresCaja as cierresCajaTable,
  clientes as clientesTable,
  movimientosBancarios as movimientosBancariosTable,
  movimientosCc as movimientosCcTable,
} from "@/lib/db/schema";
import { fechaArDeISO, formatYmdAr, hoyAr } from "@/lib/fecha-ar";
import { reversoDe, type TipoMovCc } from "@/lib/cuenta-corriente-reverso";
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
/**
 * Saldo de un cliente EN UNA SUCURSAL.
 *
 * La deuda es por local, no de la clienta con "Malala". Lucia, buscando a
 * Carolina Prieto en Centro: "me aparece el saldo de Malala Yerba Buena, es
 * esto posible?". Lo era: clientes.saldo_cc es UNA columna que las dos
 * sucursales miraban, y la deuda de Carolina —entera de Yerba Buena— se veia
 * igual desde Centro. Su propia cuenta, con movimientos en los dos locales,
 * era una suma que ninguna de las dos podia explicar.
 *
 * Se calcula desde los movimientos, que si tienen sucursal: no hay un total
 * guardado por local que pueda quedar desfasado de su detalle. La columna
 * saldo_cc se sigue escribiendo como total de la clienta, pero ya no se
 * muestra en ningun lado.
 */
export async function getSaldosCcPorCliente(
  sucursalId: string,
  clienteIds?: string[],
): Promise<Map<string, number>> {
  requireSupabaseRuntime("La cuenta corriente requiere Supabase configurado.");
  if (clienteIds && clienteIds.length === 0) return new Map();
  const db = getDb();

  // Se agrupa toda la sucursal y se filtra después: una sola consulta, sin
  // interpolar una lista de ids. Los movimientos de cuenta corriente son
  // pocos —son las ventas fiadas y sus pagos, no todas las ventas.
  const filas = (await db.execute(sql`
    select m.cliente_id,
           sum(case when m.tipo = 'cargo' then m.monto else -m.monto end) as saldo
      from movimientos_cc m
     where m.sucursal_id = ${sucursalId}
     group by m.cliente_id
  `)) as unknown as { cliente_id: string; saldo: number }[];

  const pedidos = clienteIds ? new Set(clienteIds) : null;
  const mapa = new Map<string, number>();
  for (const f of filas) {
    if (pedidos && !pedidos.has(f.cliente_id)) continue;
    mapa.set(f.cliente_id, Number(f.saldo));
  }
  return mapa;
}

/** Lo que una clienta debe en esta sucursal. Positivo debe, negativo a favor. */
export async function getSaldoCc(
  clienteId: string,
  sucursalId: string,
): Promise<number> {
  const mapa = await getSaldosCcPorCliente(sucursalId, [clienteId]);
  return mapa.get(clienteId) ?? 0;
}

export async function getDeudoresCc(sucursalId: string): Promise<DeudorCc[]> {
  requireSupabaseRuntime(
    "La cuenta corriente requiere Supabase configurado.",
  );
  const db = getDb();

  // Quién debe EN ESTA SUCURSAL. Antes se leía clientes.saldo_cc, que es el
  // total de la clienta, y la caja de un local listaba deudores del otro.
  const saldos = await getSaldosCcPorCliente(sucursalId);
  const ids = [...saldos.entries()]
    .filter(([, saldo]) => saldo > EPS)
    .map(([id]) => id);
  if (ids.length === 0) return [];

  const nombres = await db
    .select({ id: clientesTable.id, nombre: clientesTable.nombre })
    .from(clientesTable)
    .where(inArray(clientesTable.id, ids));
  const deudores = nombres
    .map((c) => ({ id: c.id, nombre: c.nombre, saldo: saldos.get(c.id) ?? 0 }))
    .sort((a, b) => b.saldo - a.saldo);

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
        eq(movimientosCcTable.sucursalId, sucursalId),
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
export async function getSaldosAFavorCc(
  sucursalId: string,
): Promise<SaldoAFavorCc[]> {
  requireSupabaseRuntime("La cuenta corriente requiere Supabase configurado.");
  const db = getDb();

  const saldos = await getSaldosCcPorCliente(sucursalId);
  const ids = [...saldos.entries()]
    .filter(([, saldo]) => saldo < -EPS)
    .map(([id]) => id);
  if (ids.length === 0) return [];

  const rows = await db
    .select({ id: clientesTable.id, nombre: clientesTable.nombre })
    .from(clientesTable)
    .where(inArray(clientesTable.id, ids));

  return rows
    .map((r) => ({
      cliente_id: r.id,
      nombre: r.nombre,
      a_favor: -(saldos.get(r.id) ?? 0),
    }))
    .sort((a, b) => b.a_favor - a.a_favor);
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
    fecha: formData.get("fecha"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const data = parsed.data;

  const sucursal = await getActiveSucursalForUser(user);
  const db = getDb();

  // Mediodía argentino, igual que en las ventas retroactivas: dentro del día
  // elegido mire desde donde se mire, sin que el corrimiento de zona lo pase
  // al día anterior o al siguiente.
  const ymd = data.fecha ?? hoyAr();
  const esRetroactivo = ymd !== hoyAr();
  const fecha = esRetroactivo
    ? new Date(`${data.fecha}T12:00:00-03:00`)
    : new Date();

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

      // Un arqueo firmado no se toca por atrás: si el día ya se cerró, esta
      // plata cambiaría el esperado de un cierre que ya se contó.
      if (esRetroactivo && sucursal) {
        const [cerrada] = await tx
          .select({ id: cierresCajaTable.id })
          .from(cierresCajaTable)
          .where(
            and(
              eq(cierresCajaTable.sucursalId, sucursal.id),
              eq(cierresCajaTable.fecha, ymd),
            ),
          )
          .limit(1);
        if (cerrada) {
          throw new Error(
            `La caja del ${formatYmdAr(ymd)} ya está cerrada. Entrá a Caja → Cierres anteriores, abrí el cierre de ese día y tocá "Reabrir cierre"; después cargá el cobro y volvé a cerrarlo.`,
          );
        }
      }

      const monto = data.monto;
      if (modo.topeEnLaDeuda) {
        // El tope es la deuda EN ESTE LOCAL, no el total de la clienta: con el
        // saldo global, Centro podía cobrar una deuda de Yerba Buena.
        const [agg] = (await tx.execute(sql`
          select coalesce(sum(case when tipo = 'cargo' then monto else -monto end), 0) as saldo
            from movimientos_cc
           where cliente_id = ${data.cliente_id}
             and sucursal_id = ${sucursal?.id ?? null}
        `)) as unknown as { saldo: number }[];
        const deuda = Number(agg?.saldo ?? 0);

        if (deuda <= EPS) {
          throw new Error("El cliente no tiene deuda pendiente en esta sucursal");
        }
        if (monto > deuda + EPS) {
          throw new Error(
            `El pago no puede superar la deuda de esta sucursal (${deuda.toFixed(2)})`,
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

/**
 * Deshace un movimiento de cuenta corriente mal cargado.
 *
 * Elu: "como hago para REVERTIR PAGO DE CUENTA CORRIENTE. voy al cliente y me
 * aparece el pago pero no lo puedo revertir". No se podía: no existía.
 *
 * Queda sólo para Lucía (superadmin) porque lo pidió así: "yo había pensado
 * que me des a mí el perfil para hacerlo, así no nos equivocamos". Un pago
 * revertido mueve deuda y plata al mismo tiempo, y es justo el lugar donde un
 * error de apuro sale caro.
 *
 * Lo que hace, y por qué cada parte:
 *  - En la cuenta corriente deja el asiento contrario, no borra el original.
 *    La ficha del cliente tiene que poder contar que se cargó mal y se
 *    corrigió; es la prueba cuando el cliente discute el saldo.
 *  - En bancos sí borra, porque esa plata nunca entró. Un contra-asiento ahí
 *    serviría de historia pero rompería el arqueo del día, que compara contra
 *    lo que hay fisicamente en el cajón.
 *  - Borra también los impuestos que se auto-emitieron con el cobro: el banco
 *    no retuvo nada por un movimiento que no existió. Se los ubica por el
 *    instante exacto, que el cobro y sus impuestos comparten.
 */
export async function revertirMovimientoCc(
  movimientoId: string,
): Promise<ActionResult> {
  const user = await requireRole(["superadmin"]);
  requireSupabaseRuntime("La cuenta corriente requiere Supabase configurado.");

  const db = getDb();
  let clienteId = "";

  try {
    await db.transaction(async (tx) => {
      const [mov] = await tx
        .select()
        .from(movimientosCcTable)
        .where(eq(movimientosCcTable.id, movimientoId))
        .limit(1);
      if (!mov) throw new Error("No se encontro ese movimiento");
      clienteId = mov.clienteId;

      if (mov.refTipo === "reverso") {
        throw new Error(
          "Ese movimiento ya es la correccion de otro: no se revierte una reversa.",
        );
      }

      const [yaRevertido] = await tx
        .select({ id: movimientosCcTable.id })
        .from(movimientosCcTable)
        .where(
          and(
            eq(movimientosCcTable.refTipo, "reverso"),
            eq(movimientosCcTable.refId, movimientoId),
          ),
        )
        .limit(1);
      if (yaRevertido) throw new Error("Ese movimiento ya fue revertido.");

      // El arqueo de un dia cerrado esta firmado: tocarlo por atras haria que
      // el cierre deje de explicar lo que se conto esa noche.
      const ymd = fechaArDeISO(mov.fecha.toISOString());
      if (mov.sucursalId) {
        const [cerrada] = await tx
          .select({ id: cierresCajaTable.id })
          .from(cierresCajaTable)
          .where(
            and(
              eq(cierresCajaTable.sucursalId, mov.sucursalId),
              eq(cierresCajaTable.fecha, ymd),
            ),
          )
          .limit(1);
        if (cerrada) {
          throw new Error(
            `Ese movimiento es del ${formatYmdAr(ymd)} y la caja de ese dia ya esta cerrada. Entra a Caja -> Cierres anteriores, abri el cierre del ${formatYmdAr(ymd)}, toca "Reabrir cierre", reverti el movimiento y volve a cerrar el dia.`,
          );
        }
      }

      const [cliente] = await tx
        .select()
        .from(clientesTable)
        .where(eq(clientesTable.id, mov.clienteId))
        .limit(1);
      if (!cliente) throw new Error("Cliente no encontrado");

      const reverso = reversoDe(mov.tipo as TipoMovCc, mov.monto);

      await tx.insert(movimientosCcTable).values({
        id: createId(),
        clienteId: mov.clienteId,
        fecha: new Date(),
        tipo: reverso.tipo,
        monto: mov.monto,
        sucursalId: mov.sucursalId,
        mpId: mov.mpId,
        refTipo: "reverso",
        refId: mov.id,
        descripcion: `Reversa de: ${mov.descripcion ?? mov.tipo}`,
        usuarioId: user.id,
      });

      await tx
        .update(clientesTable)
        .set({ saldoCc: cliente.saldoCc + reverso.deltaSaldo })
        .where(eq(clientesTable.id, mov.clienteId));

      // Un cargo no movio plata, asi que no hay nada que sacar de bancos.
      if (mov.tipo === "pago") {
        await tx
          .delete(movimientosBancariosTable)
          .where(
            and(
              eq(movimientosBancariosTable.refId, mov.clienteId),
              inArray(movimientosBancariosTable.refTipo, ["cc_pago", "impuesto"]),
              eq(movimientosBancariosTable.fecha, mov.fecha),
            ),
          );
      }
    });
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [
          error instanceof Error
            ? error.message
            : "No se pudo revertir el movimiento",
        ],
      },
    };
  }

  revalidatePath(`/catalogos/clientes/${clienteId}`);
  revalidatePath("/catalogos/clientes");
  revalidatePath("/caja");
  revalidatePath("/bancos");
  revalidatePath("/ventas/nueva");
  return { ok: true };
}
