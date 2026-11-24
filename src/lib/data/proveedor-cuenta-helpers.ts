import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client/postgres";
import {
  egresos as egresosTable,
  pagosProveedor as pagosProveedorTable,
} from "@/lib/db/schema";
import {
  imputarPagosACuenta,
  type Cobertura,
  type FacturaImpaga,
} from "@/lib/proveedor-cuenta";

type DbOrTx = ReturnType<typeof getDb> | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Cuánto cubren los pagos a cuenta de cada factura impaga del proveedor.
 *
 * Por sucursal: cada salón le paga sus propias facturas. Lo que se reparte es lo
 * pagado a cuenta menos lo que ya se usó para saldar facturas marcadas pagadas
 * (egresos.cubierto_a_cuenta), así la misma plata no cubre dos facturas.
 */
export async function coberturaFacturasTx(
  db: DbOrTx,
  proveedorId: string,
): Promise<Map<string, Cobertura>> {
  const [impagas, pagos, usados] = await Promise.all([
    db
      .select({
        id: egresosTable.id,
        fecha: egresosTable.fecha,
        valor: egresosTable.valor,
        sucursalId: egresosTable.sucursalId,
      })
      .from(egresosTable)
      .where(
        and(
          eq(egresosTable.proveedorId, proveedorId),
          eq(egresosTable.pagado, false),
          eq(egresosTable.anulado, false),
        ),
      ),
    db
      .select({
        sucursalId: pagosProveedorTable.sucursalId,
        total: sql<number>`coalesce(sum(${pagosProveedorTable.monto}), 0)::float8`,
      })
      .from(pagosProveedorTable)
      .where(
        and(
          eq(pagosProveedorTable.proveedorId, proveedorId),
          eq(pagosProveedorTable.anulado, false),
        ),
      )
      .groupBy(pagosProveedorTable.sucursalId),
    db
      .select({
        sucursalId: egresosTable.sucursalId,
        total: sql<number>`coalesce(sum(${egresosTable.cubiertoACuenta}), 0)::float8`,
      })
      .from(egresosTable)
      .where(
        and(
          eq(egresosTable.proveedorId, proveedorId),
          eq(egresosTable.pagado, true),
          eq(egresosTable.anulado, false),
          isNotNull(egresosTable.cubiertoACuenta),
        ),
      )
      .groupBy(egresosTable.sucursalId),
  ]);

  const disponible = new Map<string, number>();
  for (const p of pagos) disponible.set(p.sucursalId, Number(p.total));
  for (const u of usados) {
    disponible.set(u.sucursalId, (disponible.get(u.sucursalId) ?? 0) - Number(u.total));
  }

  const porSucursal = new Map<string, FacturaImpaga[]>();
  for (const f of impagas) {
    const lista = porSucursal.get(f.sucursalId) ?? [];
    lista.push({ id: f.id, fecha: f.fecha.toISOString(), valor: f.valor });
    porSucursal.set(f.sucursalId, lista);
  }

  const resultado = new Map<string, Cobertura>();
  for (const [sucursalId, facturas] of porSucursal) {
    for (const [id, c] of imputarPagosACuenta(facturas, disponible.get(sucursalId) ?? 0)) {
      resultado.set(id, c);
    }
  }
  return resultado;
}

/**
 * Lo que la sucursal le debe a cada proveedor: sus facturas impagas, menos sus
 * pagos a cuenta, más lo que de esos pagos ya se usó para saldar facturas
 * marcadas pagadas (egresos.cubierto_a_cuenta; esa plata no baja dos veces).
 *
 * proveedores.deuda_pendiente es UNA para las dos sucursales. Con los
 * proveedores compartidos eso mezclaba las cuentas: Yerba Buena veía a Walter
 * con $15.674 de deuda que era una factura de Centro, y a Question con
 * $54.632 cuando lo suyo eran $290 (24/11/2026). Sumando lo de cada sucursal
 * da exactamente la columna global.
 */
export async function deudaPorProveedorTx(
  db: DbOrTx,
  sucursalId: string,
  proveedorId?: string,
): Promise<Map<string, number>> {
  const deFacturas = [eq(egresosTable.sucursalId, sucursalId), eq(egresosTable.anulado, false), isNotNull(egresosTable.proveedorId)];
  const dePagos = [eq(pagosProveedorTable.sucursalId, sucursalId), eq(pagosProveedorTable.anulado, false)];
  if (proveedorId) {
    deFacturas.push(eq(egresosTable.proveedorId, proveedorId));
    dePagos.push(eq(pagosProveedorTable.proveedorId, proveedorId));
  }
  const [facturas, pagos] = await Promise.all([
    db
      .select({
        proveedorId: egresosTable.proveedorId,
        impagas: sql<number>`coalesce(sum(${egresosTable.valor}) filter (where not ${egresosTable.pagado}), 0)::float8`,
        cubierto: sql<number>`coalesce(sum(${egresosTable.cubiertoACuenta}) filter (where ${egresosTable.pagado}), 0)::float8`,
      })
      .from(egresosTable)
      .where(and(...deFacturas))
      .groupBy(egresosTable.proveedorId),
    db
      .select({
        proveedorId: pagosProveedorTable.proveedorId,
        total: sql<number>`coalesce(sum(${pagosProveedorTable.monto}), 0)::float8`,
      })
      .from(pagosProveedorTable)
      .where(and(...dePagos))
      .groupBy(pagosProveedorTable.proveedorId),
  ]);

  const deuda = new Map<string, number>();
  for (const f of facturas) {
    if (f.proveedorId) deuda.set(f.proveedorId, Number(f.impagas) + Number(f.cubierto));
  }
  for (const p of pagos) {
    deuda.set(p.proveedorId, (deuda.get(p.proveedorId) ?? 0) - Number(p.total));
  }
  // Centavos de redondeo de float: 0,0000001 no es deuda.
  for (const [id, v] of deuda) deuda.set(id, Math.round(v * 100) / 100);
  return deuda;
}
