import { and, eq, inArray, ne } from "drizzle-orm";
import type { getDb } from "@/lib/db/client/postgres";
import {
  clienteFichaRegistros as fichaRegistrosTable,
  clienteSucursal as clienteSucursalTable,
  clientes as clientesTable,
  giftCards as giftCardsTable,
  ingresos as ingresosTable,
  movimientosCc as movimientosCcTable,
  turnos as turnosTable,
  whatsappEnvios as whatsappEnviosTable,
} from "@/lib/db/schema";
import { tryNormalizarTelefonoAR } from "@/lib/phone";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Une clientas repetidas: todo lo de las otras pasa a la que queda y las otras
 * se borran. Lo usa scripts/unir-clientes-duplicadas.ts; el criterio de qué
 * se une está en src/lib/clientes-duplicadas.ts.
 *
 * Pasa todo lo que apunta a una clienta (las FK a clientes): ventas, turnos,
 * cuenta corriente, ficha técnica, gift cards que compró, mensajes de WhatsApp
 * y las sucursales donde está habilitada. El saldo total (saldo_cc) se suma;
 * el de cada sucursal sale de los movimientos, que pasan enteros.
 *
 * De la ficha queda lo de la elegida; lo que ella no tiene (teléfono, email,
 * datos del cabello) se completa con lo de las otras, y las observaciones se
 * juntan.
 *
 * Devuelve las filas como estaban antes, para dejar registro.
 */
export async function unirClientasEnTx(
  tx: Tx,
  conservarId: string,
  unirIds: string[],
) {
  const ids = [...new Set(unirIds)].filter((id) => id !== conservarId);
  if (ids.length === 0) throw new Error("No hay otra clienta para unir");

  const filas = await tx
    .select()
    .from(clientesTable)
    .where(inArray(clientesTable.id, [conservarId, ...ids]))
    .for("update");
  const queda = filas.find((f) => f.id === conservarId);
  const otras = ids.map((id) => filas.find((f) => f.id === id));
  if (!queda || otras.some((o) => !o)) throw new Error("Alguna clienta ya no existe");
  const resto = otras as NonNullable<(typeof otras)[number]>[];

  const de = <K extends keyof typeof queda>(campo: K) =>
    queda[campo] ?? resto.find((o) => o[campo] != null && o[campo] !== "")?.[campo] ?? null;

  // Teléfono: el de la que queda; si no tiene, el de otra. El normalizado es
  // único en la base: se libera de las otras antes de ponérselo.
  const telefono = de("telefono");
  let telefonoE164 =
    queda.telefonoE164 ??
    tryNormalizarTelefonoAR(queda.telefono) ??
    resto.map((o) => o.telefonoE164 ?? tryNormalizarTelefonoAR(o.telefono)).find(Boolean) ??
    null;
  await tx.update(clientesTable).set({ telefonoE164: null }).where(inArray(clientesTable.id, ids));
  if (telefonoE164 && telefonoE164 !== queda.telefonoE164) {
    const [ocupado] = await tx
      .select({ id: clientesTable.id })
      .from(clientesTable)
      .where(and(eq(clientesTable.telefonoE164, telefonoE164), ne(clientesTable.id, queda.id)))
      .limit(1);
    if (ocupado) telefonoE164 = queda.telefonoE164;
  }

  const observaciones = [queda.observacion, ...resto.map((o) => o.observacion)]
    .map((o) => o?.trim())
    .filter((o): o is string => !!o)
    .filter((o, i, arr) => arr.indexOf(o) === i);

  await tx
    .update(clientesTable)
    .set({
      telefono,
      telefonoE164,
      email: de("email"),
      observacion: observaciones.length ? observaciones.join(" · ") : null,
      activo: queda.activo || resto.some((o) => o.activo),
      saldoCc: queda.saldoCc + resto.reduce((s, o) => s + o.saldoCc, 0),
      tipoCabello: de("tipoCabello"),
      saludCabello: de("saludCabello"),
      alergias: de("alergias"),
      colorActual: de("colorActual"),
      observacionesTecnicas: de("observacionesTecnicas"),
    })
    .where(eq(clientesTable.id, queda.id));

  await tx.update(ingresosTable).set({ clienteId: queda.id }).where(inArray(ingresosTable.clienteId, ids));
  await tx.update(turnosTable).set({ clienteId: queda.id }).where(inArray(turnosTable.clienteId, ids));
  await tx
    .update(movimientosCcTable)
    .set({ clienteId: queda.id })
    .where(inArray(movimientosCcTable.clienteId, ids));
  await tx
    .update(fichaRegistrosTable)
    .set({ clienteId: queda.id })
    .where(inArray(fichaRegistrosTable.clienteId, ids));
  await tx
    .update(giftCardsTable)
    .set({ compradoraClienteId: queda.id })
    .where(inArray(giftCardsTable.compradoraClienteId, ids));
  await tx
    .update(whatsappEnviosTable)
    .set({ clienteId: queda.id })
    .where(inArray(whatsappEnviosTable.clienteId, ids));

  const sucursales = await tx
    .selectDistinct({ sucursalId: clienteSucursalTable.sucursalId })
    .from(clienteSucursalTable)
    .where(inArray(clienteSucursalTable.clienteId, ids));
  if (sucursales.length > 0) {
    await tx
      .insert(clienteSucursalTable)
      .values(
        sucursales.map((s) => ({
          id: crypto.randomUUID(),
          clienteId: queda.id,
          sucursalId: s.sucursalId,
        })),
      )
      .onConflictDoNothing();
  }

  // Sus filas de cliente_sucursal se van con ellas por el cascade.
  await tx.delete(clientesTable).where(inArray(clientesTable.id, ids));
  return filas;
}
