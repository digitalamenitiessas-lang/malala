"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import { hoyAr } from "@/lib/fecha-ar";
import { numeroFactura, planFactura, type LineaFactura } from "@/lib/factura-proveedor";
import { cargarFacturaTx, FacturaRepetida } from "./facturas-proveedor-tx";
import { requireRole } from "./_helpers";

export type FacturaProveedorResult =
  | { ok: true; proveedorId: string; total: number }
  | { ok: false; errors: Record<string, string[]> };

/**
 * Carga una factura de proveedor entera, todo o nada (ver
 * src/lib/factura-proveedor.ts):
 *
 * - Un gasto pendiente por cada línea, con su producto: suma stock igual que
 *   una compra suelta.
 * - Uno más por la diferencia con el total (IVA, percepciones y otros), así
 *   la deuda con el proveedor es exactamente la factura.
 * - Todos con el mismo número de factura. Si esa factura ya está cargada para
 *   el proveedor, avisa antes de cargarla otra vez.
 * - Si se pide, actualiza el costo de los productos con el precio de la
 *   factura, IVA incluido.
 *
 * La factura queda a pagar. El pago (un cheque, una transferencia) se carga
 * después desde el proveedor, con "Registrar pago": es un solo movimiento en
 * el banco, como en la realidad, aunque cubra varias facturas.
 */
export async function registrarFacturaProveedor(
  _prev: FacturaProveedorResult | null,
  formData: FormData,
): Promise<FacturaProveedorResult> {
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);

  const sucursalId = String(formData.get("sucursal_id") ?? "");
  const proveedorId = String(formData.get("proveedor_id") ?? "");
  const comprobante = String(formData.get("comprobante") ?? "").trim();
  const total = Number(formData.get("total") ?? 0);
  const fecha = String(formData.get("fecha") ?? "");
  const actualizarCosto = formData.get("actualizar_costo") === "on" || formData.get("actualizar_costo") === "true";
  const cargarIgual = formData.get("cargar_igual") === "on" || formData.get("cargar_igual") === "true";

  let lineas: LineaFactura[];
  try {
    const crudas = JSON.parse(String(formData.get("lineas") ?? "[]")) as unknown[];
    lineas = crudas.map((l) => {
      const o = (l ?? {}) as Record<string, unknown>;
      return { insumoId: String(o.insumoId ?? ""), cantidad: Number(o.cantidad), valor: Number(o.valor) };
    });
  } catch {
    return { ok: false, errors: { lineas: ["No se pudieron leer los productos de la factura"] } };
  }

  const errors: Record<string, string[]> = {};
  if (!isSucursalAllowed(scope, sucursalId)) errors._ = ["No tenés acceso a esa sucursal"];
  if (!proveedorId) errors.proveedor_id = ["Elegí el proveedor"];
  const numero = numeroFactura(comprobante);
  if (!numero) errors.comprobante = ["Poné el número de la factura"];
  const r = planFactura(total, lineas);
  if (!r.ok) Object.assign(errors, r.errors);
  if (Object.keys(errors).length > 0 || !r.ok || !numero) return { ok: false, errors };
  const plan = r.plan;

  const ymdFecha = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyAr();

  try {
    await getDb().transaction((tx) =>
      cargarFacturaTx(tx, {
        sucursalId,
        proveedorId,
        comprobante,
        numero,
        ymdFecha,
        total,
        lineas,
        plan,
        actualizarCosto,
        cargarIgual,
        usuarioId: user.id,
      }),
    );
  } catch (error) {
    if (error instanceof FacturaRepetida) {
      return { ok: false, errors: { factura_repetida: [error.message] } };
    }
    return {
      ok: false,
      errors: { _: [error instanceof Error ? error.message : "No se pudo cargar la factura"] },
    };
  }

  revalidatePath("/egresos");
  revalidatePath("/stock");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  revalidatePath("/catalogos/insumos");
  revalidatePath("/catalogos/proveedores");
  revalidatePath(`/catalogos/proveedores/${proveedorId}`);
  return { ok: true, proveedorId, total };
}
