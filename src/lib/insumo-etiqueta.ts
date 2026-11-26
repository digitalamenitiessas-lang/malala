import type { Insumo } from "@/lib/types";

const UNIDAD: Record<string, string> = { ml: "ml", g: "g", ud: "ud", aplicacion: "apl." };

/** ¿El nombre ya dice el contenido? "Shampoo 300 ml", "Removedor (1 Litro)". */
function nombreTieneContenido(nombre: string): boolean {
  return /\d+([.,]\d+)?\s*(ml|cc|l|lt|lts|litros?|g|gr|grs|kg)\b/i.test(nombre);
}

/**
 * Cómo se muestra un producto en la lista para elegirlo al cargar una compra.
 *
 * Pedido de Yerba Buena el 26/11/2026 cargando la factura de Loreal: "hay
 * productos que no tienen en el nombre el contenido en ml ... si los ml no
 * están en el nombre no es posible hacerlo". El mismo producto existe en
 * 300 ml para reventa y en 1500 ml para bacha. Se agrega el envase (si el
 * nombre no lo dice) y si es de bacha o reventa.
 */
export function etiquetaInsumo(
  i: Pick<Insumo, "nombre" | "tamano_envase" | "unidad_medida" | "tipo">,
): string {
  const partes = [i.nombre.trim()];
  if (!nombreTieneContenido(i.nombre) && i.tamano_envase > 1 && i.unidad_medida !== "ud") {
    const tam = Number.isInteger(i.tamano_envase)
      ? String(i.tamano_envase)
      : i.tamano_envase.toLocaleString("es-AR");
    partes.push(`${tam} ${UNIDAD[i.unidad_medida] ?? i.unidad_medida}`);
  }
  partes.push(i.tipo === "venta" ? "reventa" : "bacha");
  return partes.join(" · ");
}
