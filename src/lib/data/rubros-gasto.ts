"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { requireSupabaseRuntime } from "@/lib/db/env";
import {
  rubrosGasto as rubrosGastoTable,
  rubroSucursal as rubroSucursalTable,
} from "@/lib/db/schema";
import type { RubroGasto } from "@/lib/types";
import { rubroGastoSchema } from "@/lib/validations/rubro-gasto";
import { getActiveSucursalForUser } from "@/lib/auth/session";
import { fieldErrors, requireRole, type ActionResult } from "./_helpers";

function mapRubroGasto(row: typeof rubrosGastoTable.$inferSelect): RubroGasto {
  return {
    id: row.id,
    rubro: row.rubro,
    subrubro: row.subrubro ?? undefined,
    activo: row.activo,
    grupo: row.grupo ?? undefined,
  };
}

export async function listRubrosGasto(opts?: {
  sucursalId?: string;
}): Promise<RubroGasto[]> {
  requireSupabaseRuntime(
    "Los rubros de gasto del sistema solo se cargan desde Supabase.",
  );

  const db = getDb();
  const rows = await db
    .select()
    .from(rubrosGastoTable)
    .orderBy(asc(rubrosGastoTable.rubro), asc(rubrosGastoTable.subrubro));
  if (opts?.sucursalId) {
    const miembros = await db
      .select({ rubroId: rubroSucursalTable.rubroId })
      .from(rubroSucursalTable)
      .where(eq(rubroSucursalTable.sucursalId, opts.sucursalId));
    const habilitados = new Set(miembros.map((m) => m.rubroId));
    return rows.filter((r) => habilitados.has(r.id)).map(mapRubroGasto);
  }
  return rows.map(mapRubroGasto);
}

/**
 * Asigna el grupo de un rubro (1 a 6).
 *
 * De esto depende que el gasto entre o no en el resultado operativo, así que
 * lo toca sólo un admin y queda a la vista en la tabla de rubros.
 */
export async function setRubroGastoGrupo(
  rubroId: string,
  grupo: number | null,
): Promise<ActionResult> {
  await requireRole(["admin"]);
  requireSupabaseRuntime("Los rubros de gasto requieren Supabase configurado.");
  if (grupo != null && (grupo < 1 || grupo > 6)) {
    return { ok: false, errors: { grupo: ["Grupo invalido"] } };
  }

  const db = getDb();
  await db
    .update(rubrosGastoTable)
    .set({ grupo })
    .where(eq(rubrosGastoTable.id, rubroId));

  revalidatePath("/catalogos/rubros-gasto");
  revalidatePath("/reportes/resultados");
  revalidatePath("/reportes/flujo-caja");
  return { ok: true };
}

export async function createRubroGasto(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(["admin"]);
  requireSupabaseRuntime(
    "La creacion de rubros requiere Supabase configurado.",
  );
  const parsed = rubroGastoSchema.safeParse({
    rubro: formData.get("rubro"),
    subrubro: formData.get("subrubro"),
    activo: true,
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const db = getDb();
  const rubroId = crypto.randomUUID();
  await db.insert(rubrosGastoTable).values({
    id: rubroId,
    rubro: parsed.data.rubro,
    subrubro: parsed.data.subrubro ?? null,
    activo: true,
  });

  const sucursalActiva = await getActiveSucursalForUser(user);
  if (sucursalActiva) {
    await db.insert(rubroSucursalTable).values({
      id: crypto.randomUUID(),
      rubroId,
      sucursalId: sucursalActiva.id,
    });
  }

  revalidatePath("/catalogos/rubros-gasto");
  revalidatePath("/egresos");
  return { ok: true };
}

/**
 * Rubros que el código necesita que existan sí o sí.
 *
 * "Sueldos" lo buscan por nombre anticipos.ts y liquidaciones.ts para armar el
 * egreso del pago. Si no está, el salón no puede cargar un anticipo ni pagarle
 * una liquidación a nadie, y el error recién aparece al intentar hacerlo.
 */
function esRubroDelSistema(nombre: string): boolean {
  return nombre.trim().toLowerCase() === "sueldos";
}

export async function toggleRubroGastoActivo(
  rgId: string,
): Promise<ActionResult> {
  await requireRole(["admin"]);
  requireSupabaseRuntime(
    "La activacion de rubros requiere Supabase configurado.",
  );

  const db = getDb();
  const [rubro] = await db
    .select()
    .from(rubrosGastoTable)
    .where(eq(rubrosGastoTable.id, rgId))
    .limit(1);
  if (!rubro) return { ok: false, errors: { _: ["No encontrado"] } };

  // "Sueldos" no se desactiva: los anticipos y el pago de liquidaciones lo
  // buscan POR NOMBRE para armar el egreso (anticipos.ts, liquidaciones.ts) y
  // fallan si no está. Sin este guard, un clic acá deja al salón sin poder
  // pagarle a nadie, y el error aparece recién al intentar cargar el anticipo.
  if (esRubroDelSistema(rubro.rubro) && rubro.activo) {
    return {
      ok: false,
      errors: {
        _: [
          "El rubro Sueldos no se puede desactivar: lo usan los anticipos y el pago de liquidaciones.",
        ],
      },
    };
  }

  await db
    .update(rubrosGastoTable)
    .set({ activo: !rubro.activo })
    .where(eq(rubrosGastoTable.id, rgId));

  revalidatePath("/catalogos/rubros-gasto");
  revalidatePath("/egresos");
  return { ok: true };
}
