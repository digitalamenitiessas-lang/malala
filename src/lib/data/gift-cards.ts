"use server";

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import {
  egresos as egresosTable,
  giftCardMovimientos as giftCardMovimientosTable,
  giftCards as giftCardsTable,
  rubrosGasto as rubrosGastoTable,
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
import { sumarDiasYmd } from "@/lib/fecha-ar";
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
    cobrado: row.cobrado ?? undefined,
    saldo: row.saldo,
    estado: row.estado as GiftCard["estado"],
    fecha_emision: row.fechaEmision.toISOString(),
    vence_el: row.venceEl ?? undefined,
    compradora: row.compradora ?? undefined,
    beneficiaria: row.beneficiaria ?? undefined,
    observacion: row.observacion ?? undefined,
    origen: row.origen as GiftCard["origen"],
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

export interface PasivoGiftCards {
  /** Saldo de las que todavía están en fecha: es deuda exigible. */
  vigente: number;
  /**
   * Saldo de las vencidas. Va aparte porque no es lo mismo: el salón las toma
   * sólo si decide hacer la excepción. Sumarlo al total hacía que el número
   * dejara de significar "lo que realmente debemos" — con las vencidas del
   * sistema viejo cargadas, el pasivo se triplicó de golpe.
   */
  vencido: number;
  total: number;
}

/**
 * Lo que el salón todavía le debe a sus clientas: la suma de los saldos sin usar.
 * Es plata cobrada por servicios que no se prestaron; no es ganancia hasta que
 * alguien venga a canjear.
 */
export async function getPasivoGiftCards(
  sucursalId: string,
): Promise<PasivoGiftCards> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, sucursalId)) {
    return { vigente: 0, vencido: 0, total: 0 };
  }

  const hoy = hoyAr();
  const db = getDb();
  const [row] = await db
    .select({
      // Sin vencimiento cuenta como vigente: no hay fecha que la corte.
      vigente: sql<number>`coalesce(sum(case when ${giftCardsTable.venceEl} is null or ${giftCardsTable.venceEl} >= ${hoy} then ${giftCardsTable.saldo} else 0 end), 0)`,
      vencido: sql<number>`coalesce(sum(case when ${giftCardsTable.venceEl} < ${hoy} then ${giftCardsTable.saldo} else 0 end), 0)`,
    })
    .from(giftCardsTable)
    .where(
      and(
        eq(giftCardsTable.sucursalId, sucursalId),
        eq(giftCardsTable.estado, "activa"),
      ),
    );
  const vigente = Number(row?.vigente ?? 0);
  const vencido = Number(row?.vencido ?? 0);
  return { vigente, vencido, total: vigente + vencido };
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
    cobrado: formData.get("cobrado"),
    mp_id: formData.get("mp_id"),
    mp_cuenta_id: formData.get("mp_cuenta_id"),
    vence_el: formData.get("vence_el"),
    compradora: formData.get("compradora"),
    beneficiaria: formData.get("beneficiaria"),
    observacion: formData.get("observacion"),
    origen: formData.get("origen") ?? "venta",
    fecha_venta: formData.get("fecha_venta"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  if (!isSucursalAllowed(scope, parsed.data.sucursal_id)) {
    return { ok: false, errors: { sucursal_id: ["Sin acceso a esa sucursal"] } };
  }

  /**
   * Lo que entra a caja. Si no lo mandaron, es el importe: la tarjeta de
   * $50.000 que se paga $50.000 sigue siendo el caso normal y nadie tiene que
   * completar un campo de más para eso.
   */
  /**
   * Cero significa "no lo especificaron", no "no entró plata".
   *
   * El campo es un CurrencyField, que guarda un número y arranca en 0: no
   * puede mandar vacío. Tratar ese 0 como un cobro real hizo que cuatro gift
   * cards de un mismo día —entre ellas un pack de masajes de $120.000 pagado
   * en efectivo— registraran $0 entrando a la caja, y Yerba Buena cerró con
   * $120.000 de sobrante que nadie podía explicar.
   *
   * Una tarjeta que de verdad no se cobra es una cortesía, y eso es un origen
   * aparte que ni siquiera muestra este campo. Así que acá el cero es seguro.
   */
  const cobrado =
    parsed.data.cobrado && parsed.data.cobrado > 0
      ? parsed.data.cobrado
      : parsed.data.importe;
  if (cobrado > parsed.data.importe) {
    return {
      ok: false,
      errors: {
        cobrado: ["No puede pagar más de lo que vale la tarjeta"],
      },
    };
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

  // Mismo criterio que en las ventas: nada a futuro, y un tope para atras que
  // atrapa el error de tipeo que importa, que es el año.
  if (parsed.data.fecha_venta) {
    if (parsed.data.fecha_venta > hoyAr()) {
      return { ok: false, errors: { fecha_venta: ["No se puede cargar a futuro"] } };
    }
    if (
      parsed.data.origen === "venta" &&
      parsed.data.fecha_venta < sumarDiasYmd(hoyAr(), -60)
    ) {
      return {
        ok: false,
        errors: {
          fecha_venta: [
            "Esa fecha es de hace mas de 60 dias. Si es una tarjeta vieja, marcala como vendida antes del sistema.",
          ],
        },
      };
    }
  }

  const db = getDb();
  const giftCardId = createId();
  // La fecha en que se vendio de verdad, no la de hoy.
  //
  // Antes esto solo valia para las de antes del sistema, que no mueven plata.
  // Pero tambien pasa que un pack se vendio hace tres dias y se cargo recien
  // hoy: ahi la plata entro el dia de la venta, y meter el movimiento con la
  // fecha de hoy infla la caja de hoy y deja corta la de ese dia. Reportado
  // desde el mostrador con un pack de 4 sesiones del que ya se habia usado una.
  const fecha = parsed.data.fecha_venta
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
        cobrado: cobrado === parsed.data.importe ? null : cobrado,
        saldo: parsed.data.importe,
        estado: "activa",
        fechaEmision: fecha,
        venceEl: parsed.data.vence_el ?? null,
        compradora: parsed.data.compradora ?? null,
        beneficiaria: parsed.data.beneficiaria ?? null,
        observacion: parsed.data.observacion ?? null,
        origen: parsed.data.origen,
        // Derivado, para que el deploy anterior siga leyendo algo coherente
        // mientras sale este. Nadie mas lo lee.
        emitidaPreSistema: parsed.data.origen !== "venta",
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
        descripcion:
          parsed.data.origen === "cortesia"
            ? "Gift card de cortesia (la regala el salon)"
            : "Venta de gift card",
        usuarioId: user.id,
      });

      // Dos motivos distintos para no cobrar hoy, y en los dos el resultado es
      // el mismo: no se emite movimiento.
      //
      // La vendida antes del sistema porque esa plata entró en su momento y ya
      // está contada; cobrarla acá la contaría dos veces e inflaría el arqueo.
      // La cortesía porque no entra plata nunca: el salón la regala y el costo
      // aparece recién al canjearla, cuando el servicio factura sin que entre
      // un peso.
      if (parsed.data.origen !== "venta") return;

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
        // Entra lo que pagaron, no lo que vale la tarjeta: con 40% de
        // descuento el arqueo tiene que esperar $60.000, no $100.000.
        monto: cobrado,
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
      origen: giftCardsTable.origen,
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

  // Una cortesía canjeada le cuesta plata al salón, y hasta acá eso no figuraba
  // en ningún lado: el servicio facturaba por su precio, la chica cobraba su
  // comisión y no entraba un peso, así que la ganancia quedaba sobrestimada por
  // el valor de la tarjeta. El gasto lo compensa.
  //
  // Va pagado y sin medio de pago, que parece contradictorio y no lo es: no se
  // le debe nada a nadie (por eso pagado) pero tampoco salió plata de ninguna
  // cuenta (por eso sin medio). Los cálculos de caja filtran por medio de pago,
  // así que este gasto no toca el arqueo; el estado de resultados suma por
  // rubro, así que sí le resta a la ganancia, que es lo que se busca.
  if (fila.origen === "cortesia") {
    const [rubro] = await tx
      .select({ id: rubrosGastoTable.id })
      .from(rubrosGastoTable)
      .where(sql`lower(trim(${rubrosGastoTable.rubro})) = 'gift cards de cortesia'`)
      .limit(1);
    // Sin el rubro no se frena el canje: la clienta está en el mostrador y la
    // venta no puede caerse por una fila que falta en un catálogo.
    if (rubro) {
      await tx.insert(egresosTable).values({
        id: createId(),
        fecha: args.fecha,
        sucursalId: args.sucursalId,
        rubroId: rubro.id,
        valor: args.monto,
        mpId: null,
        pagado: true,
        anulado: false,
        ingresoId: args.ingresoId,
        observacion: `Gift card ${fila.codigo} — cortesía del salón`,
        usuarioId: args.usuarioId,
      });
    }
  }

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
