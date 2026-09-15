"use server";

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client/postgres";
import {
  servicios as serviciosTable,
  servicioSucursal as servicioSucursalTable,
} from "@/lib/db/schema";
import { getActiveSucursalForUser } from "@/lib/auth/session";
import { requireRole, revalidarCatalogoServicios } from "./_helpers";
import { aplicarAumento, pctValido } from "@/lib/aumento-precios";

/**
 * Aumento porcentual masivo de precios de servicios.
 *
 * Está en su propio archivo y no en servicios.ts porque servicios.ts sigue el
 * patrón viejo (ActionResult local, "use server" por función) y esto necesita el
 * moderno; mezclarlos haría más difícil de leer los dos.
 *
 * TRES DECISIONES QUE VALE EXPLICAR:
 *
 * 1. Se escalan `precio_lista` y `precio_efectivo` por el MISMO factor, y cada
 *    servicio conserva su propia relación entre los dos. No se hardcodea el 20%
 *    de descuento: 268 servicios lo tienen, pero 6 tienen el efectivo igual al de
 *    lista, y fijar 0,8 se los rompería.
 *
 * 2. Los dos precios se redondean a $100. Es lo que pidió el salón y es lo que
 *    hace que una lista de precios se pueda leer. El redondeo mueve la relación
 *    unos pocos pesos sobre decenas de miles, o sea menos del 0,2%; el preview
 *    muestra la relación resultante para que no sea una sorpresa.
 *
 * 3. Hay preview obligatorio antes de aplicar. Son cientos de precios de un solo
 *    golpe y no existe deshacer: quien aprieta el botón tiene que haber visto
 *    antes qué va a pasar.
 */

export interface FilaAumento {
  id: string;
  codigo?: string;
  nombre: string;
  rubro: string;
  listaAntes: number;
  listaDespues: number;
  efectivoAntes: number;
  efectivoDespues: number;
}

export interface PreviewAumento {
  ok: true;
  filas: FilaAumento[];
  /** Rubros disponibles para filtrar, con cuántos servicios tiene cada uno. */
  rubros: Array<{ rubro: string; cantidad: number }>;
  totalListaAntes: number;
  totalListaDespues: number;
}

export type AumentoServiciosResult =
  | { ok: true; actualizados: number; message?: string }
  | { ok: false; errors: Record<string, string[]> };

interface OpcionesAumento {
  pct: number;
  /** Vacío = todos los rubros. */
  rubro?: string;
  /** Las promos tienen precio de combo pensado aparte; por defecto no se tocan. */
  incluirPromos?: boolean;
}

async function serviciosAlcanzados(opts: OpcionesAumento) {
  const user = await requireRole(["admin"]);
  const sucursal = await getActiveSucursalForUser(user);
  if (!sucursal)
    return { ok: false as const, error: "No hay una sucursal activa seleccionada" };

  const db = getDb();
  // servicios no tiene sucursal_id: la pertenencia vive en servicio_sucursal.
  const filas = (
    await db
      .select()
      .from(serviciosTable)
      .innerJoin(
        servicioSucursalTable,
        eq(servicioSucursalTable.servicioId, serviciosTable.id),
      )
      .where(
        and(
          eq(servicioSucursalTable.sucursalId, sucursal.id),
          eq(serviciosTable.activo, true),
        ),
      )
      .orderBy(asc(serviciosTable.rubro), asc(serviciosTable.nombre))
  ).map((r) => r.servicios);

  const elegibles = filas
    .filter((s) => (opts.incluirPromos ? true : !s.esPromo))
    .filter((s) => (opts.rubro ? s.rubro === opts.rubro : true))
    .filter((s) => s.precioLista > 0);

  return { ok: true as const, sucursalId: sucursal.id, todos: filas, elegibles };
}

/** Qué pasaría. No toca nada. */
export async function previewAumentoServicios(
  opts: OpcionesAumento,
): Promise<PreviewAumento | { ok: false; errors: Record<string, string[]> }> {
  if (!pctValido(opts.pct)) {
    return {
      ok: false,
      errors: { pct: ["Poné un porcentaje distinto de 0 y dentro de rango"] },
    };
  }

  const res = await serviciosAlcanzados(opts);
  if (!res.ok) return { ok: false, errors: { _: [res.error] } };

  const filas: FilaAumento[] = res.elegibles.map((s) => {
    const nuevo = aplicarAumento(s, opts.pct);
    return {
      id: s.id,
      codigo: s.codigo ?? undefined,
      nombre: s.nombre,
      rubro: s.rubro,
      listaAntes: s.precioLista,
      listaDespues: nuevo.lista,
      efectivoAntes: s.precioEfectivo,
      efectivoDespues: nuevo.efectivo,
    };
  });

  const porRubro = new Map<string, number>();
  for (const s of res.todos.filter((x) => !x.esPromo && x.precioLista > 0)) {
    porRubro.set(s.rubro, (porRubro.get(s.rubro) ?? 0) + 1);
  }

  return {
    ok: true,
    filas,
    rubros: [...porRubro]
      .map(([rubro, cantidad]) => ({ rubro, cantidad }))
      .sort((a, b) => a.rubro.localeCompare(b.rubro)),
    totalListaAntes: filas.reduce((acc, f) => acc + f.listaAntes, 0),
    totalListaDespues: filas.reduce((acc, f) => acc + f.listaDespues, 0),
  };
}

/**
 * Aplica el aumento. Recalcula todo del lado del servidor a partir del mismo
 * porcentaje: no confía en los precios que vengan del formulario, porque entre
 * el preview y el clic alguien pudo haber editado un servicio.
 */
export async function aplicarAumentoServicios(
  _prev: AumentoServiciosResult | null,
  formData: FormData,
): Promise<AumentoServiciosResult> {
  const pct = Number(formData.get("pct"));
  const rubro = String(formData.get("rubro") ?? "").trim() || undefined;
  const incluirPromos = formData.get("incluir_promos") === "on";
  // Guarda contra el doble submit y contra aplicar sin haber mirado el preview.
  if (formData.get("confirmado") !== "si") {
    return { ok: false, errors: { _: ["Revisá el preview antes de aplicar"] } };
  }

  const opts = { pct, rubro, incluirPromos };
  const preview = await previewAumentoServicios(opts);
  if (!preview.ok) return preview;
  if (preview.filas.length === 0) {
    return { ok: false, errors: { _: ["No hay servicios que entren en ese filtro"] } };
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    for (const f of preview.filas) {
      await tx
        .update(serviciosTable)
        .set({ precioLista: f.listaDespues, precioEfectivo: f.efectivoDespues })
        .where(eq(serviciosTable.id, f.id));
    }
  });

  revalidarCatalogoServicios();
  return {
    ok: true,
    actualizados: preview.filas.length,
    message: `${preview.filas.length} servicios actualizados`,
  };
}
