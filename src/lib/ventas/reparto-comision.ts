/**
 * Un servicio que hicieron dos personas y se reparte la comisión.
 *
 * La base de datos sigue teniendo UNA empleada por línea: repartir es una forma
 * de cargar, no una forma de guardar. Al enviar la venta, la línea con reparto
 * se convierte en las dos líneas que realmente se guardan.
 *
 * Lo que se parte es la CANTIDAD, no el precio ni el porcentaje.
 *
 * Suena indirecto y es lo único que funciona. Una línea arrastra tres cosas
 * que dependen de cuánto servicio se prestó: el subtotal (precio x cantidad),
 * el costo de insumos (receta x cantidad) y el descuento de stock (idem). Si
 * se parte el precio y se dejan dos líneas de cantidad 1, el sistema cree que
 * el servicio se hizo DOS VECES: cobra bien pero descuenta el doble de stock y
 * reporta el doble de costo. Paso en produccion — un ticket de $216.000 con
 * $83.188 de insumos, que era la receta contada dos veces.
 *
 * Partiendo la cantidad las tres cosas se acomodan solas, y la comisión
 * tambien: comisionMontoServicio toma precio_efectivo x cantidad, asi que cada
 * una cobra su porcentaje entero sobre su mitad y la suma da igual que antes.
 *
 * La segunda parte es el RESTO de la primera y no una segunda división, así
 * que las dos siempre suman exactamente la cantidad original.
 */
export interface LineaRepartible {
  tipo: "servicio" | "producto";
  tempId: string;
  empleado_id: string;
  precio: number;
  cantidad: number;
  comision_pct: number;
  reparto?: {
    empleado_id: string;
    /** Qué parte del 100% le toca a la empleada principal. */
    parte: number;
  };
}

export function expandirLineas<T extends LineaRepartible>(lineas: T[]): T[] {
  return lineas.flatMap((l): T[] => {
    if (l.tipo !== "servicio" || !l.reparto?.empleado_id) return [l];
    const parte = Math.min(100, Math.max(0, Number(l.reparto.parte) || 0)) / 100;
    const cantidad = Number(l.cantidad) || 0;
    // Seis decimales: suficiente para cualquier reparto entero y lejos de donde
    // el punto flotante empieza a mover el subtotal.
    const cantA = Math.round(cantidad * parte * 1e6) / 1e6;
    return [
      { ...l, reparto: undefined, cantidad: cantA },
      {
        ...l,
        reparto: undefined,
        tempId: `${l.tempId}-b`,
        empleado_id: l.reparto.empleado_id,
        cantidad: cantidad - cantA,
      },
    ];
  });
}
