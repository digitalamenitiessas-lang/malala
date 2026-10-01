/**
 * Un servicio que hicieron dos personas y se reparte la comisión.
 *
 * La base de datos sigue teniendo UNA empleada por línea: repartir es una forma
 * de cargar, no una forma de guardar. Al enviar la venta, la línea con reparto
 * se convierte en las dos líneas que realmente se guardan.
 *
 * Lo que importa es que el reparto se hace sobre el PORCENTAJE, no sobre el
 * precio. La comisión se calcula sobre el precio de efectivo del catálogo (ver
 * comisionMontoServicio), así que partir el precio a la mitad y dejar el 30% en
 * las dos líneas hace que cada una comisione sobre el servicio ENTERO: un
 * servicio de $30.000 al 30% pagaría $18.000 en vez de $9.000. Fue el primer
 * intento que se hizo a mano en el mostrador, y es la razón por la que esto
 * existe en vez de explicarle a alguien que divida los dos números.
 *
 * El precio igual se parte, para que en el ticket se vea la parte de cada una.
 * La segunda parte es el RESTO de la primera y no una segunda división, así que
 * las dos siempre suman exactamente el precio original aunque sea impar.
 */
export interface LineaRepartible {
  tipo: "servicio" | "producto";
  tempId: string;
  empleado_id: string;
  precio: number;
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
    const precio = Number(l.precio) || 0;
    const pct = Number(l.comision_pct) || 0;
    const precioA = Math.round(precio * parte);
    const pctA = pct * parte;
    return [
      { ...l, reparto: undefined, precio: precioA, comision_pct: pctA },
      {
        ...l,
        reparto: undefined,
        tempId: `${l.tempId}-b`,
        empleado_id: l.reparto.empleado_id,
        precio: precio - precioA,
        comision_pct: pct - pctA,
      },
    ];
  });
}
