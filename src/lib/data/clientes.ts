"use server";

import { and, asc, count, eq, exists, ilike, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { requireSupabaseRuntime } from "@/lib/db/env";
import {
  clientes as clientesTable,
  clienteSucursal as clienteSucursalTable,
} from "@/lib/db/schema";
import type { Cliente } from "@/lib/types";
import { clienteSchema } from "@/lib/validations/cliente";
import { tryNormalizarTelefonoAR } from "@/lib/phone";
import { getActiveSucursalForUser, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import type { Usuario } from "@/lib/types";
import {
  fieldErrors,
  normPhone,
  requireRole,
  type ActionResult,
} from "./_helpers";

/** Asocia un cliente a la sucursal activa del usuario (membresía). */
async function asociarClienteASucursal(user: Usuario, clienteId: string) {
  const sucursalActiva = await getActiveSucursalForUser(user);
  if (!sucursalActiva) return;
  await getDb()
    .insert(clienteSucursalTable)
    .values({ id: crypto.randomUUID(), clienteId, sucursalId: sucursalActiva.id })
    .onConflictDoNothing();
}

function mapCliente(row: typeof clientesTable.$inferSelect): Cliente {
  return {
    id: row.id,
    nombre: row.nombre,
    telefono: row.telefono ?? undefined,
    telefono_e164: row.telefonoE164 ?? undefined,
    email: row.email ?? undefined,
    observacion: row.observacion ?? undefined,
    activo: row.activo,
    saldo_cc: row.saldoCc,
    cuenta_corriente_habilitada: row.cuentaCorrienteHabilitada,
    tipo_cabello: row.tipoCabello ?? undefined,
    salud_cabello: row.saludCabello ?? undefined,
    alergias: row.alergias ?? undefined,
    color_actual: row.colorActual ?? undefined,
    observaciones_tecnicas: row.observacionesTecnicas ?? undefined,
  };
}

export async function listClientes(opts?: {
  incluirInactivos?: boolean;
  q?: string;
  /** Si se pasa, solo clientes habilitados en esa sucursal (membresía). */
  sucursalId?: string;
  /**
   * Corta el resultado. Para los buscadores que se escriben a mano: son casi
   * 2000 clientes y un "a" los trae a todos por el cable. Se aplica después de
   * filtrar por sucursal, así que el tope es de filas realmente devueltas.
   */
  limit?: number;
}): Promise<Cliente[]> {
  const q = opts?.q?.trim();
  // Endpoint (este archivo es "use server"): sin sesión no se lista la base de
  // clientes. El recorte por sucursal sigue viniendo por opts.sucursalId, que es
  // lo que pasan las pantallas.
  await requireUser();
  requireSupabaseRuntime(
    "Los clientes del sistema solo se cargan desde Supabase.",
  );

  const db = getDb();
  const filters = [];
  if (!opts?.incluirInactivos) filters.push(eq(clientesTable.activo, true));
  if (q) {
    filters.push(
      or(
        ilike(clientesTable.nombre, `%${q}%`),
        ilike(clientesTable.telefono, `%${q}%`),
      )!,
    );
  }

  const rows =
    filters.length > 0
      ? await db
          .select()
          .from(clientesTable)
          .where(and(...filters))
          .orderBy(asc(clientesTable.nombre))
      : await db
          .select()
          .from(clientesTable)
          .orderBy(asc(clientesTable.nombre));

  const tope = (lista: typeof rows) =>
    opts?.limit != null ? lista.slice(0, opts.limit) : lista;

  if (opts?.sucursalId) {
    const miembros = await db
      .select({ clienteId: clienteSucursalTable.clienteId })
      .from(clienteSucursalTable)
      .where(eq(clienteSucursalTable.sucursalId, opts.sucursalId));
    const habilitados = new Set(miembros.map((m) => m.clienteId));
    return tope(rows.filter((r) => habilitados.has(r.id))).map(mapCliente);
  }

  return tope(rows).map(mapCliente);
}

/**
 * Cuántos clientes hay, sin traerlos.
 *
 * La portada de Catálogos sólo muestra el número, y para eso estaba usando
 * listClientes: casi 2000 filas y 645 KB por el cable para imprimir "1990
 * registros". Acá cuenta la base y viaja un entero.
 *
 * El predicado tiene que ser EL MISMO que el de listClientes de arriba —activo,
 * y membresía en la sucursal cuando se pasa—, por eso vive pegado a esa
 * función: si una cambia, la otra se ve en la misma pantalla.
 */
export async function contarClientes(opts?: {
  incluirInactivos?: boolean;
  sucursalId?: string;
}): Promise<number> {
  await requireUser();
  requireSupabaseRuntime(
    "Los clientes del sistema solo se cargan desde Supabase.",
  );

  const db = getDb();
  const filtros = [];
  if (!opts?.incluirInactivos) filtros.push(eq(clientesTable.activo, true));
  if (opts?.sucursalId) {
    filtros.push(
      exists(
        db
          .select({ uno: sql`1` })
          .from(clienteSucursalTable)
          .where(
            and(
              eq(clienteSucursalTable.clienteId, clientesTable.id),
              eq(clienteSucursalTable.sucursalId, opts.sucursalId),
            ),
          ),
      ),
    );
  }

  const [row] = await db
    .select({ n: count() })
    .from(clientesTable)
    .where(filtros.length > 0 ? and(...filtros) : undefined);
  return row?.n ?? 0;
}

/**
 * Ficha de un cliente.
 *
 * El chequeo de sesión y de sucursal NO es opcional acá: este archivo tiene
 * "use server" en la línea 1, así que cada export es un endpoint que se puede
 * llamar con cualquier id. Sin esto, entrar a /catalogos/clientes/<id> con el id
 * de un cliente de la otra sede devolvía la ficha completa — teléfono, email,
 * saldo de cuenta corriente y los campos de salud (alergias, estado del
 * cabello). Son datos de 1989 personas reales.
 *
 * La pertenencia sale de cliente_sucursal, igual que en listClientes. Se
 * verificó que los 1989 clientes tienen membresía y que no hay huérfanos, así
 * que este filtro no esconde a nadie que antes se viera.
 */
export async function getCliente(clienteId: string): Promise<Cliente | null> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  requireSupabaseRuntime(
    "Los clientes del sistema solo se cargan desde Supabase.",
  );

  const db = getDb();
  const [row] = await db
    .select()
    .from(clientesTable)
    .where(eq(clientesTable.id, clienteId))
    .limit(1);
  if (!row) return null;

  if (!scope.puedeVerGlobal) {
    const miembro = await db
      .select({ sucursalId: clienteSucursalTable.sucursalId })
      .from(clienteSucursalTable)
      .where(eq(clienteSucursalTable.clienteId, clienteId));
    const alcanzable = miembro.some((m) =>
      scope.sucursalIdsPermitidas.includes(m.sucursalId),
    );
    if (!alcanzable) return null;
  }

  return mapCliente(row);
}

function parse(formData: FormData) {
  return clienteSchema.safeParse({
    nombre: formData.get("nombre"),
    telefono: formData.get("telefono"),
    email: formData.get("email"),
    observacion: formData.get("observacion"),
    activo: formData.get("activo") === "on" || formData.get("activo") === "true",
  });
}

export async function createCliente(formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["admin", "encargada", "empleado"]);
  requireSupabaseRuntime(
    "La creacion de clientes requiere Supabase configurado.",
  );
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const db = getDb();
  const clienteId = crypto.randomUUID();
  const telefono = normPhone(parsed.data.telefono) ?? null;
  await db.insert(clientesTable).values({
    id: clienteId,
    nombre: parsed.data.nombre,
    telefono,
    telefonoE164: telefono ? tryNormalizarTelefonoAR(telefono) : null,
    email: parsed.data.email ?? null,
    observacion: parsed.data.observacion ?? null,
    activo: parsed.data.activo,
    saldoCc: 0,
  });
  await asociarClienteASucursal(user, clienteId);

  revalidatePath("/catalogos/clientes");
  revalidatePath("/ventas");
  revalidatePath("/ventas/nueva");
  return { ok: true };
}

export type CreateClienteQuickResult =
  | { ok: true; cliente: Cliente }
  | { ok: false; errors: Record<string, string[]> };

export async function createClienteQuick(input: {
  nombre: string;
  telefono?: string;
  observacion?: string;
}): Promise<CreateClienteQuickResult> {
  const user = await requireRole(["admin", "encargada", "empleado"]);
  requireSupabaseRuntime(
    "La creacion de clientes requiere Supabase configurado.",
  );
  const parsed = clienteSchema.safeParse({
    nombre: input.nombre,
    telefono: input.telefono,
    observacion: input.observacion,
    activo: true,
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const id = crypto.randomUUID();
  const telefono = normPhone(parsed.data.telefono) ?? null;
  const telefonoE164 = telefono ? tryNormalizarTelefonoAR(telefono) : null;
  const db = getDb();
  await db.insert(clientesTable).values({
    id,
    nombre: parsed.data.nombre,
    telefono,
    telefonoE164,
    email: null,
    observacion: parsed.data.observacion ?? null,
    activo: parsed.data.activo,
    saldoCc: 0,
  });
  await asociarClienteASucursal(user, id);

  revalidatePath("/catalogos/clientes");
  revalidatePath("/ventas");
  revalidatePath("/ventas/nueva");

  return {
    ok: true,
    cliente: {
      id,
      nombre: parsed.data.nombre,
      telefono: telefono ?? undefined,
      telefono_e164: telefonoE164 ?? undefined,
      email: undefined,
      observacion: parsed.data.observacion ?? undefined,
      activo: true,
      saldo_cc: 0,
      cuenta_corriente_habilitada: true,
    },
  };
}

export async function updateCliente(
  clienteId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime(
    "La edicion de clientes requiere Supabase configurado.",
  );
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const db = getDb();
  const existing = await getCliente(clienteId);
  if (!existing) return { ok: false, errors: { _: ["No encontrado"] } };

  const telefono = normPhone(parsed.data.telefono) ?? null;
  await db
    .update(clientesTable)
    .set({
      nombre: parsed.data.nombre,
      telefono,
      telefonoE164: telefono ? tryNormalizarTelefonoAR(telefono) : null,
      email: parsed.data.email ?? null,
      observacion: parsed.data.observacion ?? null,
      activo: parsed.data.activo,
    })
    .where(eq(clientesTable.id, clienteId));

  revalidatePath("/catalogos/clientes");
  revalidatePath("/ventas");
  revalidatePath("/ventas/nueva");
  return { ok: true };
}

export async function toggleClienteActivo(
  clienteId: string,
): Promise<ActionResult> {
  await requireRole(["admin", "encargada"]);
  requireSupabaseRuntime(
    "La activacion de clientes requiere Supabase configurado.",
  );

  const cliente = await getCliente(clienteId);
  if (!cliente) return { ok: false, errors: { _: ["No encontrado"] } };

  const db = getDb();
  await db
    .update(clientesTable)
    .set({ activo: !cliente.activo })
    .where(eq(clientesTable.id, clienteId));

  revalidatePath("/catalogos/clientes");
  revalidatePath("/ventas");
  revalidatePath("/ventas/nueva");
  return { ok: true };
}
