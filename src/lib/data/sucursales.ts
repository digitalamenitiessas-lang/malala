"use server";

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client/postgres";
import { requireSupabaseRuntime } from "@/lib/db/env";
import { sucursales as sucursalesTable } from "@/lib/db/schema";
import type { Sucursal } from "@/lib/types";

function mapSucursal(row: typeof sucursalesTable.$inferSelect): Sucursal {
  return {
    id: row.id,
    nombre: row.nombre,
    activo: row.activo,
    slug: row.slug ?? undefined,
    direccion: row.direccion ?? undefined,
    telefono: row.telefono ?? undefined,
    horario_resumen: row.horarioResumen ?? undefined,
    rating: row.rating ?? undefined,
    reviews: row.reviews ?? undefined,
    mapa_url: row.mapaUrl ?? undefined,
    descripcion_corta: row.descripcionCorta ?? undefined,
    medio3_habilitado: row.medio3Habilitado,
    control_stock_habilitado: row.controlStockHabilitado,
  };
}

export async function listSucursales(opts?: {
  soloActivas?: boolean;
}): Promise<Sucursal[]> {
  requireSupabaseRuntime(
    "Las sucursales solo se cargan desde la base real en este runtime.",
  );

  const db = getDb();
  const rows = opts?.soloActivas
    ? await db
        .select()
        .from(sucursalesTable)
        .where(eq(sucursalesTable.activo, true))
        .orderBy(asc(sucursalesTable.nombre))
    : await db.select().from(sucursalesTable).orderBy(asc(sucursalesTable.nombre));

  return rows.map(mapSucursal);
}

export async function getSucursal(id: string): Promise<Sucursal | null> {
  requireSupabaseRuntime(
    "Las sucursales solo se cargan desde la base real en este runtime.",
  );

  const db = getDb();
  const [row] = await db
    .select()
    .from(sucursalesTable)
    .where(eq(sucursalesTable.id, id))
    .limit(1);
  return row ? mapSucursal(row) : null;
}
