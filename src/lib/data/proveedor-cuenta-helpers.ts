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
