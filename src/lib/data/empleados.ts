"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb, getSqlClient } from "@/lib/db/client/postgres";
import { createSupabaseAdminClient } from "@/lib/db/client/supabase-admin";
import { requireSupabaseRuntime } from "@/lib/db/env";
import {
  empleados as empleadosTable,
  profiles as profilesTable,
} from "@/lib/db/schema";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import type { Empleado, Rol } from "@/lib/types";
import { empleadoSchema } from "@/lib/validations/empleado";
import { fieldErrors, requireRole, type ActionResult } from "./_helpers";

/** Roles que un usuario puede asignar al crear un acceso (anti escalamiento). */
function rolesAsignables(rol: Rol): Rol[] {
  if (rol === "superadmin") return ["empleado", "encargada", "admin"];
  if (rol === "admin") return ["empleado", "encargada"];
  return [];
}

const accesoSchema = z.object({
  email: z.string().email("Email inválido").transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  rol: z.enum(["empleado", "encargada", "admin"]),
});

export interface AccesoEmpleado {
  email: string;
  rol: Rol;
  activo: boolean;
  /**
   * Si tiene historia cargada (ventas, gastos, movimientos…), el acceso NO se
   * puede borrar: la base lo impide y con razón, porque esos registros dicen
   * quién los hizo. La pantalla usa esto para ofrecer desactivar en vez de
   * borrar, y explicar por qué.
   */
  tiene_historia: boolean;
}

export async function getAccesoDeEmpleado(
  empleadoId: string,
): Promise<AccesoEmpleado | null> {
  requireSupabaseRuntime("Los accesos solo se leen desde Supabase.");
  const db = getDb();
  const [row] = await db
    .select({
      userId: profilesTable.userId,
      email: profilesTable.email,
      rol: profilesTable.rol,
      activo: profilesTable.activo,
    })
    .from(profilesTable)
    .where(eq(profilesTable.empleadoId, empleadoId))
    .limit(1);
  if (!row) return null;
  return {
    email: row.email,
    rol: row.rol,
    activo: row.activo,
    tiene_historia: (await contarHistoriaDeUsuario(row.userId)) > 0,
  };
}

/**
 * Cuántos registros de la operación llevan la firma de este usuario.
 *
 * Casi todas las tablas referencian profiles con ON DELETE NO ACTION, así que
 * esto no es una precaución cosmética: si da distinto de cero, el DELETE lo
 * rechaza la base. Se consulta todo junto para no pagar una ida y vuelta por
 * tabla.
 */
async function contarHistoriaDeUsuario(userId: string): Promise<number> {
  const sql = getSqlClient();
  const [row] = await sql<{ n: number }[]>`
    select (
      (select count(*) from ingresos where usuario_id = ${userId}) +
      (select count(*) from ingresos where revisado_por = ${userId}) +
      (select count(*) from egresos where usuario_id = ${userId}) +
      (select count(*) from movimientos_bancarios where usuario_id = ${userId}) +
      (select count(*) from movimientos_cc where usuario_id = ${userId}) +
      (select count(*) from movimientos_stock where usuario_id = ${userId}) +
      (select count(*) from anticipos where usuario_id = ${userId}) +
      (select count(*) from viaticos where usuario_id = ${userId}) +
      (select count(*) from liquidaciones where usuario_id = ${userId}) +
      (select count(*) from gift_cards where usuario_id = ${userId}) +
      (select count(*) from gift_card_movimientos where usuario_id = ${userId}) +
      (select count(*) from aperturas_caja where abierto_por = ${userId}) +
      (select count(*) from cierres_caja where cerrado_por = ${userId}) +
      (select count(*) from cliente_ficha_registros where usuario_id = ${userId}) +
      (select count(*) from turnos where creado_por_usuario_id = ${userId}) +
      (select count(*) from turnos where actualizado_por_usuario_id = ${userId}) +
      (select count(*) from turno_eventos where actor_usuario_id = ${userId})
    )::int as n`;
  return row?.n ?? 0;
}

/**
 * Crea el usuario de Supabase Auth + el profile ligado a un empleado.
 * La contraseña es temporal/aleatoria (la definición real queda para un paso
 * posterior). Si falla la inserción del profile, borra el usuario de Auth.
 */
async function crearAccesoInterno(opts: {
  empleadoId: string;
  email: string;
  password: string;
  nombre: string;
  rol: Rol;
  sucursalId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  });
  if (error || !data?.user) {
    return {
      ok: false,
      error: error?.message ?? "No se pudo crear el usuario de acceso",
    };
  }
  const userId = data.user.id;
  try {
    const db = getDb();
    await db.insert(profilesTable).values({
      userId,
      email: opts.email,
      nombre: opts.nombre,
      rol: opts.rol,
      sucursalDefaultId: opts.sucursalId,
      empleadoId: opts.empleadoId,
      activo: true,
    });
    return { ok: true };
  } catch {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return { ok: false, error: "No se pudo crear el perfil de acceso" };
  }
}

function mapEmpleado(row: typeof empleadosTable.$inferSelect): Empleado {
  return {
    id: row.id,
    nombre: row.nombre,
    activo: row.activo,
    sucursal_principal_id: row.sucursalPrincipalId,
    tipo_comision: row.tipoComision,
    porcentaje_default: row.porcentajeDefault,
    sueldo_asegurado: row.sueldoAsegurado,
    valor_hora: row.valorHora,
    viatico_por_dia: row.viaticoPorDia,
    horas_por_dia: row.horasPorDia,
    dias_trabajo: row.diasTrabajo ?? [],
    observacion: row.observacion ?? undefined,
  };
}

export async function listEmpleados(opts?: {
  incluirInactivos?: boolean;
  sucursalId?: string;
  sucursalIds?: string[];
}): Promise<Empleado[]> {
  requireSupabaseRuntime(
    "Los empleados del back office solo se leen desde Supabase.",
  );

  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();
  const filters = [];
  if (!opts?.incluirInactivos) filters.push(eq(empleadosTable.activo, true));
  const sucursalIdsBase = opts?.sucursalIds?.length
    ? opts.sucursalIds.filter((id) => scope.sucursalIdsPermitidas.includes(id))
    : scope.sucursalIdsPermitidas;

  if (opts?.sucursalId) {
    if (!isSucursalAllowed(scope, opts.sucursalId)) return [];
    filters.push(eq(empleadosTable.sucursalPrincipalId, opts.sucursalId));
  } else if (!scope.puedeVerGlobal || sucursalIdsBase.length > 0) {
    filters.push(inArray(empleadosTable.sucursalPrincipalId, sucursalIdsBase));
  }

  const rows =
    filters.length > 0
      ? await db
          .select()
          .from(empleadosTable)
          .where(and(...filters))
          .orderBy(asc(empleadosTable.nombre))
      : await db.select().from(empleadosTable).orderBy(asc(empleadosTable.nombre));

  return rows.map(mapEmpleado);
}

export async function getEmpleado(empleadoId: string): Promise<Empleado | null> {
  requireSupabaseRuntime(
    "Los empleados del back office solo se leen desde Supabase.",
  );

  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();
  const [row] = await db
    .select()
    .from(empleadosTable)
    .where(eq(empleadosTable.id, empleadoId))
    .limit(1);

  if (!row) return null;
  if (
    !scope.puedeVerGlobal &&
    !scope.sucursalIdsPermitidas.includes(row.sucursalPrincipalId)
  ) {
    return null;
  }

  return mapEmpleado(row);
}

function parse(formData: FormData) {
  return empleadoSchema.safeParse({
    nombre: formData.get("nombre"),
    sucursal_principal_id: formData.get("sucursal_principal_id"),
    tipo_comision: formData.get("tipo_comision"),
    porcentaje_default: formData.get("porcentaje_default"),
    valor_hora: formData.get("valor_hora"),
    viatico_por_dia: formData.get("viatico_por_dia"),
    horas_por_dia: formData.get("horas_por_dia"),
    dias_trabajo: formData.getAll("dias_trabajo"),
    observacion: formData.get("observacion"),
    activo: formData.get("activo") === "on" || formData.get("activo") === "true",
  });
}

export async function createEmpleado(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin"]);
  requireSupabaseRuntime(
    "La creacion de empleados requiere Supabase configurado.",
  );
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, parsed.data.sucursal_principal_id)) {
    return {
      ok: false,
      errors: { sucursal_principal_id: ["No podés crear empleados en esa sucursal"] },
    };
  }

  // Acceso opcional al sistema (login)
  const crearAcceso =
    formData.get("crear_acceso") === "on" ||
    formData.get("crear_acceso") === "true";
  let acceso: { email: string; password: string; rol: Rol } | null = null;
  if (crearAcceso) {
    const parsedAcceso = accesoSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      rol: formData.get("rol"),
    });
    if (!parsedAcceso.success) {
      return { ok: false, errors: fieldErrors(parsedAcceso.error) };
    }
    if (!rolesAsignables(user.rol).includes(parsedAcceso.data.rol)) {
      return { ok: false, errors: { rol: ["No podés asignar ese rol"] } };
    }
    acceso = parsedAcceso.data;
  }

  const db = getDb();
  const empleadoId = crypto.randomUUID();
  await db.insert(empleadosTable).values({
    id: empleadoId,
    nombre: parsed.data.nombre,
    activo: parsed.data.activo,
    sucursalPrincipalId: parsed.data.sucursal_principal_id,
    tipoComision: parsed.data.tipo_comision,
    porcentajeDefault: parsed.data.porcentaje_default,
    valorHora: parsed.data.valor_hora,
    viaticoPorDia: parsed.data.viatico_por_dia,
    horasPorDia: parsed.data.horas_por_dia,
    diasTrabajo: parsed.data.dias_trabajo,
    observacion: parsed.data.observacion ?? null,
  });

  if (acceso) {
    const res = await crearAccesoInterno({
      empleadoId,
      email: acceso.email,
      password: acceso.password,
      nombre: parsed.data.nombre,
      rol: acceso.rol,
      sucursalId: parsed.data.sucursal_principal_id,
    });
    if (!res.ok) {
      // Compensar: el empleado quedó creado pero el acceso falló → revertir empleado
      await db.delete(empleadosTable).where(eq(empleadosTable.id, empleadoId));
      return { ok: false, errors: { _: [res.error] } };
    }
  }

  revalidatePath("/catalogos/empleados");
  return { ok: true };
}

/**
 * Crea acceso (login) para un empleado que ya existe y todavía no lo tiene.
 */
export async function crearAccesoEmpleado(
  empleadoId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin"]);
  requireSupabaseRuntime("La creación de accesos requiere Supabase configurado.");

  const empleado = await getEmpleado(empleadoId);
  if (!empleado) return { ok: false, errors: { _: ["Empleado no encontrado"] } };

  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, empleado.sucursal_principal_id)) {
    return { ok: false, errors: { _: ["No podés gestionar empleados de esa sucursal"] } };
  }

  const yaTiene = await getAccesoDeEmpleado(empleadoId);
  if (yaTiene) {
    return { ok: false, errors: { _: ["Este empleado ya tiene un acceso"] } };
  }

  const parsedAcceso = accesoSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    rol: formData.get("rol"),
  });
  if (!parsedAcceso.success) {
    return { ok: false, errors: fieldErrors(parsedAcceso.error) };
  }
  if (!rolesAsignables(user.rol).includes(parsedAcceso.data.rol)) {
    return { ok: false, errors: { rol: ["No podés asignar ese rol"] } };
  }

  const res = await crearAccesoInterno({
    empleadoId,
    email: parsedAcceso.data.email,
    password: parsedAcceso.data.password,
    nombre: empleado.nombre,
    rol: parsedAcceso.data.rol,
    sucursalId: empleado.sucursal_principal_id,
  });
  if (!res.ok) return { ok: false, errors: { _: [res.error] } };

  revalidatePath(`/catalogos/empleados/${empleadoId}`);
  revalidatePath("/catalogos/empleados");
  return { ok: true };
}

/**
 * Guardas comunes a toda gestión de un acceso ya creado.
 *
 * Las dos que importan de verdad son las de escalamiento: nadie se gestiona a
 * sí mismo (si no, alguien se sube el rol o se deja afuera sin querer), y sólo
 * se puede tocar un acceso cuyo rol uno podría haber asignado — o sea que un
 * admin no puede cambiarle la contraseña a otro admin.
 */
async function cargarAccesoParaGestion(empleadoId: string): Promise<
  | {
      ok: true;
      actor: Awaited<ReturnType<typeof requireUser>>;
      profile: typeof profilesTable.$inferSelect;
    }
  | { ok: false; errors: Record<string, string[]> }
> {
  const actor = await requireRole(["admin"]);
  requireSupabaseRuntime("La gestión de accesos requiere Supabase configurado.");

  const empleado = await getEmpleado(empleadoId);
  if (!empleado) return { ok: false, errors: { _: ["Empleado no encontrado"] } };

  const scope = buildAccessScope(actor);
  if (!isSucursalAllowed(scope, empleado.sucursal_principal_id)) {
    return {
      ok: false,
      errors: { _: ["No podés gestionar empleados de esa sucursal"] },
    };
  }

  const db = getDb();
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.empleadoId, empleadoId))
    .limit(1);
  if (!profile) {
    return { ok: false, errors: { _: ["Este empleado no tiene acceso"] } };
  }
  if (profile.userId === actor.id) {
    return {
      ok: false,
      errors: {
        _: ["Este es tu propio acceso: pedile a otro administrador que lo cambie."],
      },
    };
  }
  if (!rolesAsignables(actor.rol).includes(profile.rol as Rol)) {
    return {
      ok: false,
      errors: {
        _: [`No tenés permiso para gestionar un acceso de rol ${profile.rol}.`],
      },
    };
  }

  return { ok: true, actor, profile };
}

function revalidarAcceso(empleadoId: string) {
  revalidatePath(`/catalogos/empleados/${empleadoId}`);
  revalidatePath("/catalogos/empleados");
}

/** Cambia la contraseña de un empleado. La define el administrador y se la pasa. */
export async function cambiarPasswordAcceso(
  empleadoId: string,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await cargarAccesoParaGestion(empleadoId);
  if (!guard.ok) return guard;

  const parsed = z
    .object({
      password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    })
    .safeParse({ password: formData.get("password") });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(guard.profile.userId, {
    password: parsed.data.password,
  });
  if (error) {
    return { ok: false, errors: { password: [error.message] } };
  }

  revalidarAcceso(empleadoId);
  return { ok: true };
}

/** Cambia el email con el que entra al sistema. */
export async function cambiarEmailAcceso(
  empleadoId: string,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await cargarAccesoParaGestion(empleadoId);
  if (!guard.ok) return guard;

  const parsed = z
    .object({
      email: z
        .string()
        .email("Email inválido")
        .transform((s) => s.trim().toLowerCase()),
    })
    .safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const email = parsed.data.email;
  if (email === guard.profile.email) return { ok: true };

  // Auth primero: es el que puede rechazar por email repetido. Si se actualizara
  // el profile antes, un choque ahí dejaría las dos tablas diciendo cosas
  // distintas sobre con qué email entra esta persona.
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(guard.profile.userId, {
    email,
    email_confirm: true,
  });
  if (error) {
    const repetido = /already|exists|registered/i.test(error.message);
    return {
      ok: false,
      errors: {
        email: [
          repetido ? "Ya hay un acceso con ese email" : error.message,
        ],
      },
    };
  }

  const db = getDb();
  await db
    .update(profilesTable)
    .set({ email })
    .where(eq(profilesTable.userId, guard.profile.userId));

  revalidarAcceso(empleadoId);
  return { ok: true };
}

/** Cambia el rol (empleado / encargada / admin, según quién lo pida). */
export async function cambiarRolAcceso(
  empleadoId: string,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await cargarAccesoParaGestion(empleadoId);
  if (!guard.ok) return guard;

  const parsed = z
    .object({ rol: z.enum(["empleado", "encargada", "admin"]) })
    .safeParse({ rol: formData.get("rol") });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  if (!rolesAsignables(guard.actor.rol).includes(parsed.data.rol)) {
    return { ok: false, errors: { rol: ["No podés asignar ese rol"] } };
  }

  const db = getDb();
  await db
    .update(profilesTable)
    .set({ rol: parsed.data.rol })
    .where(eq(profilesTable.userId, guard.profile.userId));

  revalidarAcceso(empleadoId);
  return { ok: true };
}

/**
 * Suspende o rehabilita el acceso sin borrar nada.
 *
 * Es la forma correcta de sacarle el sistema a alguien que ya trabajó: su
 * historia queda intacta y las ventas que cargó siguen diciendo quién las hizo.
 * Con `activo` en false la sesión deja de validar en el primer chequeo; además
 * se banea en Auth para cortar cualquier sesión que siguiera abierta, pero eso
 * es refuerzo: si Auth falla, el acceso ya quedó bloqueado igual.
 */
export async function toggleAccesoActivo(
  empleadoId: string,
): Promise<ActionResult> {
  const guard = await cargarAccesoParaGestion(empleadoId);
  if (!guard.ok) return guard;

  const activar = !guard.profile.activo;
  const db = getDb();
  await db
    .update(profilesTable)
    .set({ activo: activar })
    .where(eq(profilesTable.userId, guard.profile.userId));

  const admin = createSupabaseAdminClient();
  await admin.auth.admin
    .updateUserById(guard.profile.userId, {
      ban_duration: activar ? "none" : "876000h",
    })
    .catch(() => {});

  revalidarAcceso(empleadoId);
  return { ok: true };
}

/**
 * Borra el acceso de verdad: el perfil y el usuario de Auth.
 *
 * Sólo se puede si esa persona nunca cargó nada. Casi todas las tablas de la
 * operación referencian profiles con ON DELETE NO ACTION, así que con una sola
 * venta cargada la base rechaza el borrado — y hace bien: ese registro dice
 * quién lo hizo. En ese caso la salida es desactivar.
 */
export async function eliminarAcceso(empleadoId: string): Promise<ActionResult> {
  const guard = await cargarAccesoParaGestion(empleadoId);
  if (!guard.ok) return guard;

  const historia = await contarHistoriaDeUsuario(guard.profile.userId);
  if (historia > 0) {
    return {
      ok: false,
      errors: {
        _: [
          `No se puede borrar: este usuario tiene ${historia} registro${historia !== 1 ? "s" : ""} cargado${historia !== 1 ? "s" : ""} (ventas, gastos, movimientos). Borrarlo dejaría esos registros sin saber quién los hizo. Usá "Quitar acceso", que le corta la entrada y conserva la historia.`,
        ],
      },
    };
  }

  // El profile primero: si una referencia que no previmos lo frena, la base lo
  // rechaza y el usuario de Auth sigue existiendo (recuperable). Al revés
  // quedaría un perfil apuntando a un usuario que ya no existe.
  const db = getDb();
  try {
    await db
      .delete(profilesTable)
      .where(eq(profilesTable.userId, guard.profile.userId));
  } catch {
    return {
      ok: false,
      errors: {
        _: [
          'Este usuario tiene registros asociados y no se puede borrar. Usá "Quitar acceso".',
        ],
      },
    };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(guard.profile.userId);
  if (error) {
    return {
      ok: false,
      errors: {
        _: [
          `Se borró el perfil pero quedó el usuario en Auth (${error.message}). Avisá para limpiarlo a mano.`,
        ],
      },
    };
  }

  revalidarAcceso(empleadoId);
  return { ok: true };
}

export async function updateEmpleado(
  empleadoId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin"]);
  requireSupabaseRuntime(
    "La edicion de empleados requiere Supabase configurado.",
  );
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const db = getDb();
  const existing = await getEmpleado(empleadoId);
  if (!existing) return { ok: false, errors: { _: ["No encontrado"] } };
  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, existing.sucursal_principal_id)) {
    return { ok: false, errors: { _: ["No podes editar empleados de otra sucursal"] } };
  }
  if (!isSucursalAllowed(scope, parsed.data.sucursal_principal_id)) {
    return {
      ok: false,
      errors: { sucursal_principal_id: ["No podes mover el empleado a esa sucursal"] },
    };
  }

  await db
    .update(empleadosTable)
    .set({
      nombre: parsed.data.nombre,
      activo: parsed.data.activo,
      sucursalPrincipalId: parsed.data.sucursal_principal_id,
      tipoComision: parsed.data.tipo_comision,
      porcentajeDefault: parsed.data.porcentaje_default,
      valorHora: parsed.data.valor_hora,
      viaticoPorDia: parsed.data.viatico_por_dia,
      horasPorDia: parsed.data.horas_por_dia,
      diasTrabajo: parsed.data.dias_trabajo,
      observacion: parsed.data.observacion ?? null,
    })
    .where(eq(empleadosTable.id, empleadoId));

  revalidatePath("/catalogos/empleados");
  return { ok: true };
}

export async function toggleEmpleadoActivo(
  empleadoId: string,
): Promise<ActionResult> {
  const user = await requireRole(["admin"]);
  requireSupabaseRuntime(
    "La activacion de empleados requiere Supabase configurado.",
  );

  const empleado = await getEmpleado(empleadoId);
  if (!empleado) return { ok: false, errors: { _: ["No encontrado"] } };
  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, empleado.sucursal_principal_id)) {
    return { ok: false, errors: { _: ["No podes gestionar empleados de otra sucursal"] } };
  }

  const db = getDb();
  await db
    .update(empleadosTable)
    .set({ activo: !empleado.activo })
    .where(eq(empleadosTable.id, empleadoId));

  revalidatePath("/catalogos/empleados");
  return { ok: true };
}
