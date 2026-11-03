import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client/postgres";
import { profiles, reportesProblema, sucursales } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { buildAccessScope, esAdmin, isSucursalAllowed } from "@/lib/auth/access";

/**
 * Problemas que deja armados la IA conectada (ver drizzle/0073). Sin "use
 * server" a propósito: no son acciones del navegador, las llaman el MCP y la
 * pantalla "Conectar con IA".
 */

/** Tope por persona y día: una IA en loop no puede llenar la bandeja. */
export const MAX_REPORTES_POR_DIA = 10;

export interface ReporteProblema {
  id: string;
  usuarioNombre: string;
  sucursalNombre: string;
  fechaProblema: string | null;
  resumen: string;
  detalle: string;
  revisado: string | null;
  estado: "abierto" | "resuelto";
  creadoEn: Date;
  resueltoEn: Date | null;
}

export async function crearReporteProblema(input: {
  sucursalId: string;
  resumen: string;
  detalle: string;
  revisado?: string;
  fechaProblema?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!isSucursalAllowed(scope, input.sucursalId)) {
    return { ok: false, error: "No tenés acceso a esa sucursal." };
  }
  const resumen = input.resumen.trim().slice(0, 200);
  const detalle = input.detalle.trim().slice(0, 4000);
  if (!resumen || !detalle) {
    return { ok: false, error: "Hace falta un resumen y el detalle del problema." };
  }
  const fecha =
    input.fechaProblema && /^\d{4}-\d{2}-\d{2}$/.test(input.fechaProblema)
      ? input.fechaProblema
      : null;

  const db = getDb();
  const [{ hoy }] = await db
    .select({ hoy: sql<number>`count(*)::int` })
    .from(reportesProblema)
    .where(
      and(
        eq(reportesProblema.usuarioId, user.id),
        gt(reportesProblema.creadoEn, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ),
    );
  if (hoy >= MAX_REPORTES_POR_DIA) {
    return {
      ok: false,
      error: "Ya se mandaron muchos reportes hoy. Escribile directamente a soporte.",
    };
  }

  const id = crypto.randomUUID();
  await db.insert(reportesProblema).values({
    id,
    usuarioId: user.id,
    sucursalId: input.sucursalId,
    fechaProblema: fecha,
    resumen,
    detalle,
    revisado: input.revisado?.trim().slice(0, 4000) || null,
  });
  return { ok: true, id };
}

/** Los admin ven todos los de sus sucursales; una encargada, los suyos. */
export async function listReportesProblema(limite = 50): Promise<ReporteProblema[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  return getDb()
    .select({
      id: reportesProblema.id,
      usuarioNombre: profiles.nombre,
      sucursalNombre: sucursales.nombre,
      fechaProblema: reportesProblema.fechaProblema,
      resumen: reportesProblema.resumen,
      detalle: reportesProblema.detalle,
      revisado: reportesProblema.revisado,
      estado: reportesProblema.estado,
      creadoEn: reportesProblema.creadoEn,
      resueltoEn: reportesProblema.resueltoEn,
    })
    .from(reportesProblema)
    .innerJoin(profiles, eq(profiles.userId, reportesProblema.usuarioId))
    .innerJoin(sucursales, eq(sucursales.id, reportesProblema.sucursalId))
    .where(
      and(
        inArray(reportesProblema.sucursalId, scope.sucursalIdsPermitidas),
        esAdmin(user.rol) ? undefined : eq(reportesProblema.usuarioId, user.id),
      ),
    )
    .orderBy(desc(reportesProblema.creadoEn))
    .limit(limite);
}

export async function marcarReporteResuelto(id: string): Promise<void> {
  const user = await requireUser();
  if (!esAdmin(user.rol)) return;
  const scope = buildAccessScope(user);
  await getDb()
    .update(reportesProblema)
    .set({ estado: "resuelto", resueltoEn: new Date(), resueltoPor: user.id })
    .where(
      and(
        eq(reportesProblema.id, id),
        inArray(reportesProblema.sucursalId, scope.sucursalIdsPermitidas),
      ),
    );
}
