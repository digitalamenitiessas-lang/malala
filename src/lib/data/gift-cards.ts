"use server";

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import {
  giftCardMovimientos as giftCardMovimientosTable,
  giftCards as giftCardsTable,
} from "@/lib/db/schema";
import {
  emitMovimientoBancarioTx,
  getCuentaIdForMpTx,
} from "./movimientos-bancarios-helpers";
import {
  esCodigoDuplicado,
  fieldErrors,
  requireRole,
  type ActionResult,
} from "./_helpers";
import { requireUser } from "@/lib/auth/session";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import type { GiftCard, GiftCardMovimiento } from "@/lib/types";
import { esCanjeable, hoyAr } from "@/lib/gift-card-estado";
import {
  giftCardAnularSchema,
  giftCardCodigoSchema,
  giftCardSchema,
} from "@/lib/validations/gift-card";

type DbOrTx =
  | ReturnType<typeof getDb>
  | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

function createId() {
  return crypto.randomUUID();
}

function mapGiftCard(row: typeof giftCardsTable.$inferSelect): GiftCard {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    codigo: row.codigo,
    importe: row.importe,
    saldo: row.saldo,
    estado: row.estado as GiftCard["estado"],
    fecha_emision: row.fechaEmision.toISOString(),
    vence_el: row.venceEl ?? undefined,
    compradora: row.compradora ?? undefined,
    beneficiaria: row.beneficiaria ?? undefined,
    observacion: row.observacion ?? undefined,
    emitida_pre_sistema: row.emitidaPreSistema,
    usuario_id: row.usuarioId,
  };
}

function mapMovimiento(
  row: typeof giftCardMovimientosTable.$inferSelect,
): GiftCardMovimiento {
  return {
    id: row.id,
    gift_card_id: row.giftCardId,
    fecha: row.fecha.toISOString(),
    tipo: row.tipo as GiftCardMovimiento["tipo"],
    monto: row.monto,
    saldo_resultante: row.saldoResultante,
    ingreso_id: row.ingresoId ?? undefined,
    descripcion: row.descripcion ?? undefined,
    usuario_id: row.usuarioId,
  };
}

export interface ListGiftCardsOpts {
  sucursalId?: string;
  /** Busca por código, compradora o beneficiaria. */
  q?: string;
  /**
   * Solo las que se pueden usar para pagar. Incluye las VENCIDAS a propósito: el
   * salón hace excepciones con la fecha, así que una vencida sigue siendo
   * canjeable (con aviso). Ver esCanjeable() en @/lib/gift-card-estado.
   */
  soloCanjeables?: boolean;
}

export async function listGiftCards(
  opts: ListGiftCardsOpts = {},
): Promise<GiftCard[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();

  const filters = [
    inArray(giftCardsTable.sucursalId, scope.sucursalIdsPermitidas),
  ];
  if (opts.sucursalId) {
    if (!isSucursalAllowed(scope, opts.sucursalId)) return [];
    filters.push(eq(giftCardsTable.sucursalId, opts.sucursalId));
  }
  if (opts.soloCanjeables) {
    filters.push(eq(giftCardsTable.estado, "activa"));
    filters.push(sql`${giftCardsTable.saldo} > 0.005`);
  }
  const q = opts.q?.trim();
  if (q) {
    const patron = `%${q}%`;
    filters.push(
      or(
        ilike(giftCardsTable.codigo, patron),
        ilike(giftCardsTable.compradora, patron),
        ilike(giftCardsTable.beneficiaria, patron),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(giftCardsTable)
    .where(and(...filters))
    .orderBy(desc(giftCardsTable.fechaEmision), asc(giftCardsTable.codigo));
  return rows.map(mapGiftCard);
}

export async function getGiftCard(id: string): Promise<GiftCard | null> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();

  const [row] = await db
    .select()
    .from(giftCardsTable)
    .where(eq(giftCardsTable.id, id))
    .limit(1);
  if (!row) return null;
  if (!isSucursalAllowed(scope, row.sucursalId)) return null;
  return mapGiftCard(row);
}

/**
 * Busca por código dentro de una sucursal. Case-insensitive porque el código lo
 * escribe una persona a mano y nadie se acuerda de las mayúsculas.
 */
export async function getGiftCardPorCodigo(
  sucursalId: string,
  codigo: string,
): Promise<GiftCard | null> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, sucursalId)) return null;

  const db = getDb();
  const [row] = await db
    .select()
    .from(giftCardsTable)
    .where(
      and(
        eq(giftCardsTable.sucursalId, sucursalId),
        sql`upper(${giftCardsTable.codigo}) = ${codigo.trim().toUpperCase()}`,
      ),
    )
    .limit(1);
  return row ? mapGiftCard(row) : null;
}

export async function listMovimientosGiftCard(
  giftCardId: string,
): Promise<GiftCardMovimiento[]> {
  const tarjeta = await getGiftCard(giftCardId);
  if (!tarjeta) return [];

  const db = getDb();
  const rows = await db
    .select()
    .from(giftCardMovimientosTable)
    .where(eq(giftCardMovimientosTable.giftCardId, giftCardId))
    .orderBy(
      desc(giftCardMovimientosTable.fecha),
      desc(giftCardMovimientosTable.creadoEn),
    );
  return rows.map(mapMovimiento);
}

/**
 * Lo que el salón todavía le debe a sus clientas: la suma de los saldos sin usar.
 * Es plata cobrada por servicios que no se prestaron; no es ganancia hasta que
 * alguien venga a canjear.
 */
export async function getPasivoGiftCards(sucursalId: string): Promise<number> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, sucursalId)) return 0;

  const db = getDb();
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${giftCardsTable.saldo}), 0)` })
    .from(giftCardsTable)
    .where(
      and(
        eq(giftCardsTable.sucursalId, sucursalId),
        eq(giftCardsTable.estado, "activa"),
      ),
    );
  return Number(row?.total ?? 0);
}

/**
 * Próximo código sugerido para la sucursal, con el formato GC-0001.
 *
 * El salón numera las tarjetas a mano (las físicas las escriben, las digitales
 * las arman en Canva), así que el número no existe antes de la venta: lo puede
 * proponer el sistema y ellas lo copian a la tarjeta. Eso saca de encima los
 * duplicados y los errores de tipeo. El campo queda editable igual, porque una
 * encargada puede haber armado el diseño antes de cargarla.
 */
export async function sugerirCodigoGiftCard(
  sucursalId: string,
): Promise<string> {
  const db = getDb();
  const patron = "^GC-([0-9]+)$";
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max((regexp_match(${giftCardsTable.codigo}, ${patron}))[1]::int), 0)`,
    })
    .from(giftCardsTable)
    .where(eq(giftCardsTable.sucursalId, sucursalId));
  const siguiente = Number(row?.max ?? 0) + 1;
  return `GC-${String(siguiente).padStart(4, "0")}`;
}

/**
 * Emite una gift card: la vende.
 *
 * NO escribe en `ingresos` — ése es el punto de todo esto. Vender una tarjeta es
 * cobrar por adelantado un servicio que todavía no se prestó; la facturación
 * aparece cuando la clienta la canjea. Sí emite el movimiento bancario, porque
 * la plata entró de verdad y el arqueo tiene que cerrar. Es el mismo camino que
 * recorre registrarPagoCc: plata que entra sin ser facturación.
 */
export async function emitirGiftCard(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);

  const parsed = giftCardSchema.safeParse({
    sucursal_id: formData.get("sucursal_id"),
    codigo: formData.get("codigo"),
    importe: formData.get("importe"),
    mp_id: formData.get("mp_id"),
    mp_cuenta_id: formData.get("mp_cuenta_id"),
    vence_el: formData.get("vence_el"),
    compradora: formData.get("compradora"),
    beneficiaria: formData.get("beneficiaria"),
    observacion: formData.get("observacion"),
    pre_sistema: formData.get("pre_sistema") === "on" ||
      formData.get("pre_sistema") === "true",
    fecha_venta: formData.get("fecha_venta"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  if (!isSucursalAllowed(scope, parsed.data.sucursal_id)) {
    return { ok: false, errors: { sucursal_id: ["Sin acceso a esa sucursal"] } };
  }

  const yaExiste = await getGiftCardPorCodigo(
    parsed.data.sucursal_id,
    parsed.data.codigo,
  );
  if (yaExiste) {
    return {
      ok: false,
      errors: { codigo: ["Ya hay una gift card con ese código en la sucursal"] },
    };
  }

  const db = getDb();
  const giftCardId = createId();
  // Las de antes del sistema llevan la fecha en que se vendieron de verdad, no
  // la de hoy: es lo que permite entender despues de cuando viene cada una.
  const fecha =
    parsed.data.pre_sistema && parsed.data.fecha_venta
      ? new Date(`${parsed.data.fecha_venta}T12:00:00-03:00`)
      : new Date();
  let aviso: string | undefined;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(giftCardsTable).values({
        id: giftCardId,
        sucursalId: parsed.data.sucursal_id,
        codigo: parsed.data.codigo,
        importe: parsed.data.importe,
        saldo: parsed.data.importe,
        estado: "activa",
        fechaEmision: fecha,
        venceEl: parsed.data.vence_el ?? null,
        compradora: parsed.data.compradora ?? null,
        beneficiaria: parsed.data.beneficiaria ?? null,
        observacion: parsed.data.observacion ?? null,
        emitidaPreSistema: parsed.data.pre_sistema,
        usuarioId: user.id,
      });

      await tx.insert(giftCardMovimientosTable).values({
        id: createId(),
        giftCardId,
        fecha,
        tipo: "emision",
        monto: parsed.data.importe,
        saldoResultante: parsed.data.importe,
        ingresoId: null,
        descripcion: "Venta de gift card",
        usuarioId: user.id,
      });

      // La tarjeta vendida antes del sistema no cobra nada hoy: esa plata entró
      // en su momento y ya está contada donde corresponda. Emitir el ingreso
      // acá la contaría dos veces e inflaría el arqueo del día.
      if (parsed.data.pre_sistema) return;

      const cuentaId =
        parsed.data.mp_cuenta_id ??
        (await getCuentaIdForMpTx(tx, parsed.data.mp_id!));
      if (!cuentaId) {
        // Mismo criterio que createIngreso: no se frena la venta por una
        // configuración incompleta, se avisa.
        aviso =
          "Medio de pago sin cuenta asignada: la gift card quedó emitida pero el cobro no impacta en caja hasta asignarla.";
        return;
      }
      await emitMovimientoBancarioTx(tx, {
        cuentaId,
        fecha,
        monto: parsed.data.importe,
        tipo: "ingreso",
        sucursalId: parsed.data.sucursal_id,
        refTipo: "gift_card_venta",
        refId: giftCardId,
        descripcion: `Venta de gift card ${parsed.data.codigo}`,
        usuarioId: user.id,
      });
    });
  } catch (error) {
    if (esCodigoDuplicado(error)) {
      return {
        ok: false,
        errors: {
          codigo: ["Ya hay una gift card con ese código en la sucursal"],
        },
      };
    }
    return {
      ok: false,
      errors: {
        _: [
          error instanceof Error
            ? error.message
            : "No se pudo emitir la gift card",
        ],
      },
    };
  }

  revalidatePath("/catalogos/gift-cards");
  revalidatePath("/caja");
  revalidatePath("/bancos");
  return aviso ? { ok: true, message: aviso } : { ok: true };
}

/**
 * Corrige el código impreso.
 *
 * Es el único dato que una encargada puede tocar después de emitida, y a
 * propósito: el código es lo único que tiene que coincidir con un objeto físico
 * que se llevó otra persona, se escribe a mano y con gente esperando. Sin marcha
 * atrás, un número mal copiado aparece semanas después con la clienta enfrente y
 * las tres salidas posibles son malas. No mueve plata, así que no es una
 * operación contable — pero queda en el historial con su motivo.
 */
export async function corregirCodigoGiftCard(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);

  const parsed = giftCardCodigoSchema.safeParse({
    gift_card_id: formData.get("gift_card_id"),
    codigo: formData.get("codigo"),
    motivo: formData.get("motivo"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const tarjeta = await getGiftCard(parsed.data.gift_card_id);
  if (!tarjeta) return { ok: false, errors: { _: ["Gift card no encontrada"] } };
  if (tarjeta.codigo === parsed.data.codigo) return { ok: true };

  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(giftCardsTable)
        .set({ codigo: parsed.data.codigo })
        .where(eq(giftCardsTable.id, tarjeta.id));
      await tx.insert(giftCardMovimientosTable).values({
        id: createId(),
        giftCardId: tarjeta.id,
        fecha: new Date(),
        tipo: "correccion_codigo",
        monto: 0,
        saldoResultante: tarjeta.saldo,
        ingresoId: null,
        descripcion: `Código ${tarjeta.codigo} → ${parsed.data.codigo}. ${parsed.data.motivo}`,
        usuarioId: user.id,
      });
    });
  } catch (error) {
    if (esCodigoDuplicado(error)) {
      return {
        ok: false,
        errors: {
          codigo: ["Ya hay una gift card con ese código en la sucursal"],
        },
      };
    }
    return {
      ok: false,
      errors: {
        _: [
          error instanceof Error
            ? error.message
            : "No se pudo corregir el código",
        ],
      },
    };
  }

  revalidatePath("/catalogos/gift-cards");
  return { ok: true };
}

/**
 * Anula una tarjeta: la deja sin valor. Solo admin, porque destruye un saldo que
 * la clienta pagó. No devuelve la plata — eso, si corresponde, es un egreso.
 */
export async function anularGiftCard(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin"]);

  const parsed = giftCardAnularSchema.safeParse({
    gift_card_id: formData.get("gift_card_id"),
    motivo: formData.get("motivo"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const tarjeta = await getGiftCard(parsed.data.gift_card_id);
  if (!tarjeta) return { ok: false, errors: { _: ["Gift card no encontrada"] } };
  if (tarjeta.estado === "anulada") return { ok: true };

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(giftCardsTable)
      .set({ estado: "anulada", saldo: 0 })
      .where(eq(giftCardsTable.id, tarjeta.id));
    await tx.insert(giftCardMovimientosTable).values({
      id: createId(),
      giftCardId: tarjeta.id,
      fecha: new Date(),
      tipo: "anulacion",
      monto: -tarjeta.saldo,
      saldoResultante: 0,
      ingresoId: null,
      descripcion: parsed.data.motivo,
      usuarioId: user.id,
    });
  });

  revalidatePath("/catalogos/gift-cards");
  return { ok: true };
}

export interface CanjeGiftCardArgs {
  giftCardId: string;
  sucursalId: string;
  monto: number;
  ingresoId: string;
  usuarioId: string;
  fecha: Date;
}

/**
 * Descuenta saldo de una tarjeta dentro de la transacción de una venta.
 *
 * EL UPDATE ES CONDICIONAL A PROPÓSITO. Leer el saldo y después escribirlo deja
 * una ventana en la que dos operadoras pueden canjear la misma tarjeta al mismo
 * tiempo y gastarla dos veces. Acá la condición viaja en el propio UPDATE: si
 * otra transacción llegó primero, no matchea ninguna fila, `returning` vuelve
 * vacío y tiramos error — que hace rollback de la venta entera.
 *
 * El greatest(0, ...) es contra el redondeo de punto flotante: cuando el canje
 * consume la tarjeta justa, saldo - monto puede dar -0.0000001 y el CHECK de la
 * base rechazaría la fila.
 *
 * OJO: no valida el vencimiento. Una tarjeta vencida se canjea igual porque el
 * salón hace excepciones; el aviso lo da la UI y el canje queda registrado.
 */
export async function canjearGiftCardTx(
  tx: DbOrTx,
  args: CanjeGiftCardArgs,
): Promise<number> {
  const filas = await tx
    .update(giftCardsTable)
    .set({
      saldo: sql`greatest(0, ${giftCardsTable.saldo} - ${args.monto})`,
    })
    .where(
      and(
        eq(giftCardsTable.id, args.giftCardId),
        eq(giftCardsTable.sucursalId, args.sucursalId),
        eq(giftCardsTable.estado, "activa"),
        sql`${giftCardsTable.saldo} >= ${args.monto} - 0.005`,
      ),
    )
    .returning({
      saldo: giftCardsTable.saldo,
      codigo: giftCardsTable.codigo,
      venceEl: giftCardsTable.venceEl,
    });

  const fila = filas[0];
  if (!fila) {
    // Puede ser cualquiera de cuatro cosas; se distingue leyendo, para dar un
    // mensaje que sirva en el mostrador en vez de un "no se pudo".
    const [actual] = await tx
      .select()
      .from(giftCardsTable)
      .where(eq(giftCardsTable.id, args.giftCardId))
      .limit(1);
    if (!actual) throw new Error("La gift card no existe");
    if (actual.sucursalId !== args.sucursalId)
      throw new Error("Esa gift card se vendió en otra sucursal");
    if (actual.estado === "anulada")
      throw new Error("Esa gift card está anulada");
    throw new Error(
      `La gift card no tiene saldo suficiente (le quedan $${Math.round(actual.saldo).toLocaleString("es-AR")})`,
    );
  }

  // El salon toma tarjetas vencidas a proposito, para no perder a la clienta, y
  // el sistema se lo permite. Pero la pantalla promete que "se va a registrar
  // como canje fuera de termino", y hasta ahora no se registraba nada: la
  // descripcion era la misma en los dos casos. Sin esto no hay forma de saber
  // despues cuantas excepciones se hicieron ni por cuanta plata.
  const venceEl = fila.venceEl ?? null;
  const fueraDeTermino = !!venceEl && hoyAr(args.fecha) > venceEl;

  await tx.insert(giftCardMovimientosTable).values({
    id: createId(),
    giftCardId: args.giftCardId,
    fecha: args.fecha,
    tipo: "canje",
    monto: -args.monto,
    saldoResultante: fila.saldo,
    ingresoId: args.ingresoId,
    descripcion: fueraDeTermino
      ? `Canje de gift card ${fila.codigo} — FUERA DE TERMINO, vencia el ${venceEl}`
      : `Canje de gift card ${fila.codigo}`,
    usuarioId: args.usuarioId,
  });

  return fila.saldo;
}

/**
 * Chequeo previo al canje, para avisar antes de guardar. No bloquea por
 * vencimiento: el salón hace excepciones con la fecha.
 */
export async function verificarCanjeGiftCard(
  giftCardId: string,
): Promise<{ canjeable: boolean; motivo?: string; advertencia?: string }> {
  const tarjeta = await getGiftCard(giftCardId);
  if (!tarjeta) return { canjeable: false, motivo: "No existe" };
  return esCanjeable(tarjeta, hoyAr());
}
