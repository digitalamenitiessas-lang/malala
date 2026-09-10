/**
 * Horas de jornada a partir de las franjas semanales de una profesional.
 *
 * Vive fuera de liquidaciones.ts a propósito: el total que la encargada ve en
 * la ficha tiene que salir de la MISMA función con la que después se liquida.
 * Si fueran dos cálculos parecidos, el número de la pantalla dejaría de servir
 * como verificación, que es justamente para lo que lo piden.
 */

export interface Franja {
  /** 0 = domingo, 6 = sábado (igual que Date.getDay). */
  diaSemana: number;
  apertura: string; // HH:mm
  cierre: string; // HH:mm
}

export function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Minutos de cada día de la semana, sumando las franjas de ese día. */
function minutosPorDia(franjas: Franja[]): Map<number, number> {
  const porDia = new Map<number, number>();
  for (const f of franjas) {
    // Una franja invertida (cierre antes que apertura) suma cero en vez de
    // restar horas de otro día.
    const mins = Math.max(0, aMinutos(f.cierre) - aMinutos(f.apertura));
    porDia.set(f.diaSemana, (porDia.get(f.diaSemana) ?? 0) + mins);
  }
  return porDia;
}

/** Horas de una semana completa: la suma de todas las franjas cargadas. */
export function horasSemanales(franjas: Franja[]): number {
  let minutos = 0;
  for (const m of minutosPorDia(franjas).values()) minutos += m;
  return redondear2(minutos / 60);
}

/** Horas de un día puntual de la semana. */
export function horasDelDia(franjas: Franja[], diaSemana: number): number {
  return redondear2((minutosPorDia(franjas).get(diaSemana) ?? 0) / 60);
}

/**
 * Horas de jornada en el rango [desde, hasta], día por día.
 *
 * Se recorre fecha por fecha y no "semanas × horas semanales" porque los
 * períodos de liquidación no arrancan lunes ni duran siete días exactos: una
 * quincena del 1 al 15 tiene tres lunes y dos sábados, y multiplicar por
 * semanas redondas pagaría de menos o de más.
 */
export function horasDeFranjasEnRango(
  desde: string,
  hasta: string,
  franjas: Franja[],
): number {
  const porDia = minutosPorDia(franjas);
  let minutos = 0;
  // Mediodía para que ningún cambio de huso corra la fecha.
  const cur = new Date(`${desde}T12:00:00`);
  const fin = new Date(`${hasta}T12:00:00`);
  while (cur <= fin) {
    minutos += porDia.get(cur.getDay()) ?? 0;
    cur.setDate(cur.getDate() + 1);
  }
  return redondear2(minutos / 60);
}
