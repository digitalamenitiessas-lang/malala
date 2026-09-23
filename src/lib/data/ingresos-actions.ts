"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import {
  clienteSucursal as clienteSucursalTable,
  clientes as clientesTable,
  giftCardMovimientos as giftCardMovimientosTable,
  giftCards as giftCardsTable,
  ingresoLineas as ingresoLineasTable,
  ingresos as ingresosTable,
  liquidacionLineas as liquidacionLineasTable,
  movimientosCc as movimientosCcTable,
  movimientosStock as movimientosStockTable,
} from "@/lib/db/schema";
import { deleteMovimientosByRefTx } from "./movimientos-bancarios-helpers";
import { getCierreQueBloqueaFecha } from "./caja";
import { applyMovementTx } from "./stock";
import { comisionMontoServicio } from "./ingresos-helpers";
import type { CreateIngresoResult } from "./ingresos";
import { createIngreso as createIngresoImpl } from "./ingresos";
import { buildAccessScope } from "@/lib/auth/access";
import { failure, requireRole, type ActionResult } from "./_helpers";

export async function createIngreso(formData: FormData): Promise<CreateIngresoResult> {
  return createIngresoImpl(formData);
}

/**
 * Marca si el cliente quedó satisfecho con la venta (con motivo opcional). La
 * marca quien registra/gestiona la venta (admin/encargada). Internamente reutiliza
 * la columna `revision`: "ok" = satisfecho, "error" = no satisfecho.
 */
export async function setSatisfaccionVenta(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);

  const id = String(formData.get("ingreso_id") ?? "");
  if (!id) return failure("Venta no encontrada");

  const estado = String(formData.get("estado") ?? ""); // "ok" | "error"
  const revision = estado === "ok" || estado === "error" ? estado : null;
  const nota = String(formData.get("satisfaccion_nota") ?? "").trim();

  const db = getDb();
  const [existing] = await db
    .select({ id: ingresosTable.id, sucursalId: ingresosTable.sucursalId })
    .from(ingresosTable)
    .where(eq(ingresosTable.id, id))
    .limit(1);
  if (!existing) return failure("Venta no encontrada");
  if (!scope.sucursalIdsPermitidas.includes(existing.sucursalId)) {
    return failure("No tenés acceso a esa venta");
  }

  await db
    .update(ingresosTable)
    .set({
      revision,
      revisionNota: revision === "error" ? nota || null : null,
      revisadoPor: revision ? user.id : null,
      revisadoEn: revision ? new Date() : null,
    })
    .where(eq(ingresosTable.id, id));

  revalidatePath(`/ventas/${id}`);
  revalidatePath("/ventas");
  return { ok: true };
}

/**
 * Cambia la base sobre la que se calculó la comisión de una venta ya cargada.
 *
 * La regla del salón es una sola: la comisión sale de lo que se cobró. Por eso
 * el formulario de venta ya no ofrece la alternativa — bastaba con olvidarse de
 * tocar un botón en una línea para que esa comisión saliera distinta a todas
 * las demás, y eso recién se veía al liquidar.
 *
 * Pero una o dos veces al año deciden lo contrario para una venta puntual. Eso
 * se resuelve acá: sobre la venta ya guardada, a propósito, por alguien que
 * mira el ticket entero y ve los dos montos antes de elegir. No en el
 * mostrador, con la clienta esperando.
 *
 * FRENO: si alguna línea ya se liquidó, no se toca. La comisión ya se pagó con
 * ese número; cambiarlo después dejaría la liquidación diciendo una cosa y la
 * venta otra, sin que nadie se entere.
 */
export async function cambiarBaseComisionVenta(
  ingresoId: string,
  sobreLoCobrado: boolean,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);

  const db = getDb();
  const [venta] = await db
    .select()
    .from(ingresosTable)
    .where(eq(ingresosTable.id, ingresoId))
    .limit(1);
  if (!venta) return failure("Venta no encontrada");
  if (!scope.sucursalIdsPermitidas.includes(venta.sucursalId)) {
    return failure("No tenés acceso a esa venta");
  }
  if (venta.anulado) return failure("Esta venta está anulada");

  const lineas = await db
    .select({
      id: ingresoLineasTable.id,
      servicioId: ingresoLineasTable.servicioId,
      precioEfectivo: ingresoLineasTable.precioEfectivo,
      subtotal: ingresoLineasTable.subtotal,
      comisionPct: ingresoLineasTable.comisionPct,
      soportaDescuento: ingresoLineasTable.soportaDescuento,
      yaLiquidada: liquidacionLineasTable.id,
    })
    .from(ingresoLineasTable)
    .leftJoin(
      liquidacionLineasTable,
      eq(liquidacionLineasTable.ingresoLineaId, ingresoLineasTable.id),
    )
    .where(eq(ingresoLineasTable.ingresoId, ingresoId));

  const deServicio = lineas.filter((l) => l.servicioId && l.comisionPct > 0);
  if (deServicio.length === 0) {
    return failure("Esta venta no tiene comisiones de servicio para recalcular");
  }
  if (deServicio.some((l) => l.yaLiquidada)) {
    return failure(
      "Esta venta ya entró en una liquidación: su comisión está pagada y no se puede recalcular.",
    );
  }

  await db.transaction(async (tx) => {
    for (const l of deServicio) {
      const monto = comisionMontoServicio({
        precioEfectivo: l.subtotal,
        comisionPct: l.comisionPct,
        soportaDescuento: sobreLoCobrado,
        subtotal: venta.subtotal,
        descuentoMonto: venta.descuentoMonto,
      });
      await tx
        .update(ingresoLineasTable)
        .set({ soportaDescuento: sobreLoCobrado, comisionMonto: monto })
        .where(eq(ingresoLineasTable.id, l.id));
    }
  });

  revalidatePath(`/ventas/${ingresoId}`);
  revalidatePath("/ventas");
  revalidatePath("/caja");
  revalidatePath("/liquidaciones");
  revalidatePath("/reportes/empleadas");
  return { ok: true };
}

/**
 * Cambia a quién está adjudicada una venta ya registrada.
 *
 * El caso real: se cobra rápido, se deja en Consumidor Final, y después hay
 * que ponerle el cliente para que le quede en su historial. Hasta ahora el
 * único camino era anular y volver a cargar, y ese camino se traba cuando la
 * caja del día ya se cerró — que es justo cuando se dan cuenta.
 *
 * Esta acción NO se frena con el cierre de caja, a propósito: no toca ni el
 * total, ni el medio de pago, ni el stock, así que el arqueo de ese día da
 * exactamente igual antes y después. Lo único que se mueve es de quién es la
 * venta, y —si se fió— de quién es la deuda.
 *
 * Es la única edición que se permite sobre una venta. Cualquier otra cosa
 * (importes, líneas, medio de pago) sigue siendo anular y volver a cargar:
 * esas sí cambian la caja y necesitan dejar rastro de qué cambió.
 */
export async function reasignarClienteVenta(
  ingresoId: string,
  clienteId: string | null,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);

  const db = getDb();
  const [venta] = await db
    .select()
    .from(ingresosTable)
    .where(eq(ingresosTable.id, ingresoId))
    .limit(1);
  if (!venta) return failure("Venta no encontrada");
  if (!scope.sucursalIdsPermitidas.includes(venta.sucursalId)) {
    return failure("No tenés acceso a esa venta");
  }
  if (venta.anulado) {
    return failure("Esta venta está anulada: no se le puede cambiar el cliente");
  }

  const nuevoId = clienteId?.trim() || null;
  if (nuevoId === (venta.clienteId ?? null)) {
    return failure("La venta ya está a nombre de ese cliente");
  }

  // Si se fió, la deuda tiene que cambiar de dueño junto con la venta.
  const cargos = await db
    .select()
    .from(movimientosCcTable)
    .where(eq(movimientosCcTable.refId, ingresoId));
  const fiada = cargos.length > 0;

  if (fiada && !nuevoId) {
    return failure(
      "Esta venta se fió a cuenta corriente: la deuda tiene que quedar a nombre de alguien. Si hay que sacarla, anulá la venta.",
    );
  }

  let nombreNuevo = "Consumidor Final";
  if (nuevoId) {
    const [cli] = await db
      .select()
      .from(clientesTable)
      .where(eq(clientesTable.id, nuevoId))
      .limit(1);
    if (!cli) return failure("Cliente no encontrado");
    if (!cli.activo) return failure("Ese cliente está dado de baja");
    // Misma regla que el formulario de venta: solo clientes de la sucursal.
    const [membresia] = await db
      .select({ id: clienteSucursalTable.id })
      .from(clienteSucursalTable)
      .where(
        and(
          eq(clienteSucursalTable.clienteId, nuevoId),
          eq(clienteSucursalTable.sucursalId, venta.sucursalId),
        ),
      )
      .limit(1);
    if (!membresia) {
      return failure("Ese cliente no está dado de alta en esta sucursal");
    }
    if (fiada && !cli.cuentaCorrienteHabilitada) {
      return failure(
        "Esta venta se fió y ese cliente no tiene cuenta corriente habilitada. Habilitásela en su ficha o anulá la venta.",
      );
    }
    nombreNuevo = cli.nombre;
  }

  const sello = `Cliente cambiado a ${nombreNuevo}`;

  try {
    await db.transaction(async (tx) => {
      for (const cargo of cargos) {
        // Se le saca la deuda al anterior y se le suma al nuevo. El movimiento
        // es el mismo (mismo monto, misma fecha): solo cambia de cuenta.
        const [viejo] = await tx
          .select({ saldoCc: clientesTable.saldoCc })
          .from(clientesTable)
          .where(eq(clientesTable.id, cargo.clienteId))
          .limit(1);
        if (viejo) {
          await tx
            .update(clientesTable)
            .set({ saldoCc: viejo.saldoCc - cargo.monto })
            .where(eq(clientesTable.id, cargo.clienteId));
        }
        const [nuevo] = await tx
          .select({ saldoCc: clientesTable.saldoCc })
          .from(clientesTable)
          .where(eq(clientesTable.id, nuevoId!))
          .limit(1);
        if (!nuevo) throw new Error("Cliente no encontrado");
        await tx
          .update(clientesTable)
          .set({ saldoCc: nuevo.saldoCc + cargo.monto })
          .where(eq(clientesTable.id, nuevoId!));
        await tx
          .update(movimientosCcTable)
          .set({ clienteId: nuevoId! })
          .where(eq(movimientosCcTable.id, cargo.id));
      }

      await tx
        .update(ingresosTable)
        .set({
          clienteId: nuevoId,
          observacion: venta.observacion
            ? `${venta.observacion} · ${sello}`
            : sello,
        })
        .where(eq(ingresosTable.id, ingresoId));
    });
  } catch (error) {
    return failure(
      error instanceof Error
        ? error.message
        : "No se pudo cambiar el cliente de la venta",
    );
  }

  revalidatePath(`/ventas/${ingresoId}`);
  revalidatePath("/ventas");
  revalidatePath("/catalogos/clientes");
  revalidatePath("/cuenta-corriente");
  return { ok: true };
}

/**
 * Anula una venta y deshace todo lo que movió.
 *
 * NO se edita ni se borra: la fila queda con `anulado = true`, y todas las
 * lecturas (listado, caja, reportes, dashboard, comisiones) ya filtran por esa
 * bandera, así que desaparece de los números pero queda el rastro de que
 * existió. Editar en el lugar dejaría una caja que no se puede explicar: un
 * total cambiado sin registro de qué cambió.
 *
 * Lo que revierte, que es todo lo que escribe createIngreso:
 *   · movimientos bancarios del cobro, y los impuestos que hayan generado
 *     (comparten ref_id, por eso se borran juntos)
 *   · el cargo de cuenta corriente y el saldo del cliente, si se fió
 *   · el saldo de la gift card, si se canjeó una
 *   · el stock consumido por receta, con un movimiento que lo devuelve
 *
 * El freno es el cierre de caja: si el día ya se cerró, sus totales quedaron
 * congelados y anular acá los dejaría sin respaldo. Primero hay que reabrir
 * ese cierre.
 */
export async function anularIngreso(
  ingresoId: string,
  motivo?: string,
): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);

  const db = getDb();
  const [venta] = await db
    .select()
    .from(ingresosTable)
    .where(eq(ingresosTable.id, ingresoId))
    .limit(1);
  if (!venta) return failure("Venta no encontrada");
  if (!scope.sucursalIdsPermitidas.includes(venta.sucursalId)) {
    return failure("No tenés acceso a esa venta");
  }
  if (venta.anulado) return failure("Esta venta ya estaba anulada");

  const cierre = await getCierreQueBloqueaFecha(
    venta.sucursalId,
    venta.fecha.toISOString(),
  );
  if (cierre) {
    return failure(
      `La caja del ${cierre.fecha} ya está cerrada y esta venta entró en ese arqueo. Reabrí ese cierre desde Caja y volvé a intentarlo.`,
    );
  }

  const nota = motivo?.trim();

  try {
    await db.transaction(async (tx) => {
      // 1. Plata: el cobro y sus impuestos comparten ref_id.
      await deleteMovimientosByRefTx(tx, "ingreso", ingresoId);

      // 2. Fiado: se borra el cargo y se le devuelve el saldo al cliente.
      const cargos = await tx
        .select()
        .from(movimientosCcTable)
        .where(eq(movimientosCcTable.refId, ingresoId));
      for (const cargo of cargos) {
        const [cli] = await tx
          .select({ saldoCc: clientesTable.saldoCc })
          .from(clientesTable)
          .where(eq(clientesTable.id, cargo.clienteId))
          .limit(1);
        if (cli) {
          await tx
            .update(clientesTable)
            .set({ saldoCc: cli.saldoCc - cargo.monto })
            .where(eq(clientesTable.id, cargo.clienteId));
        }
      }
      if (cargos.length > 0) {
        await tx
          .delete(movimientosCcTable)
          .where(eq(movimientosCcTable.refId, ingresoId));
      }

      // 3. Gift cards: vuelve el saldo que se había canjeado.
      const canjes = await tx
        .select()
        .from(giftCardMovimientosTable)
        .where(eq(giftCardMovimientosTable.ingresoId, ingresoId));
      for (const canje of canjes) {
        const [gc] = await tx
          .select({ saldo: giftCardsTable.saldo, importe: giftCardsTable.importe })
          .from(giftCardsTable)
          .where(eq(giftCardsTable.id, canje.giftCardId))
          .limit(1);
        if (!gc) continue;
        // El canje guardó el monto en positivo; se devuelve sin pasarse del
        // importe original de la tarjeta.
        const devuelto = Math.min(gc.saldo + Math.abs(canje.monto), gc.importe);
        await tx
          .update(giftCardsTable)
          .set({ saldo: devuelto })
          .where(eq(giftCardsTable.id, canje.giftCardId));
      }
      if (canjes.length > 0) {
        await tx
          .delete(giftCardMovimientosTable)
          .where(eq(giftCardMovimientosTable.ingresoId, ingresoId));
      }

      // 4. Stock: se devuelve con un movimiento propio en vez de borrar el de
      //    la venta. El stock es un libro: que se vea que salió y volvió.
      const consumos = await tx
        .select()
        .from(movimientosStockTable)
        .where(eq(movimientosStockTable.refId, ingresoId));
      for (const consumo of consumos) {
        await applyMovementTx(tx, {
          insumo_id: consumo.insumoId,
          sucursal_id: consumo.sucursalId,
          delta: -consumo.cantidad,
          tipo: "ajuste_manual",
          motivo: `Devolución por venta anulada`,
          ref_tipo: "ingreso_anulado",
          ref_id: ingresoId,
          usuario_id: user.id,
        });
      }

      // 5. La venta queda, marcada.
      await tx
        .update(ingresosTable)
        .set({
          anulado: true,
          observacion: nota
            ? `${venta.observacion ? `${venta.observacion} · ` : ""}ANULADA: ${nota}`
            : `${venta.observacion ? `${venta.observacion} · ` : ""}ANULADA`,
        })
        .where(eq(ingresosTable.id, ingresoId));
    });
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "No se pudo anular la venta",
    );
  }

  revalidatePath(`/ventas/${ingresoId}`);
  revalidatePath("/ventas");
  revalidatePath("/caja");
  revalidatePath("/bancos");
  revalidatePath("/stock");
  revalidatePath("/dashboard");
  revalidatePath("/catalogos/clientes");
  return { ok: true };
}
