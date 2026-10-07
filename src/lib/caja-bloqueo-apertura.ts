/**
 * Qué caja sin cerrar impide abrir otra.
 *
 * La regla existe para que no se arrastren días sin cerrar: si ayer quedó
 * abierto, hay que cerrarlo antes de abrir hoy. Para eso sólo importa lo que
 * quedó ATRÁS.
 *
 * Un día posterior abierto no bloquea nada, y confundir eso hacía imposible el
 * único caso en que alguien abre una fecha vieja: cargar un día que nunca se
 * registró. Centro, intentando cargar el 26/09 con la caja de hoy abierta:
 * "no esta grabando la caja 26/9... haciendo todos los pasos". La apertura se
 * rechazaba siempre, y como la venta después pedía abrir esa caja, parecía que
 * el sistema se contradecía solo.
 *
 * Todo lo que cuelga de una caja —el arqueo, los movimientos, el cierre— está
 * indexado por fecha, así que dos días abiertos a la vez no se pisan.
 */
export function cajaQueBloqueaApertura(
  aperturas: { fecha: string }[],
  fechasCerradas: Set<string>,
  fecha: string,
): string | null {
  const abierta = aperturas.find(
    (a) => !fechasCerradas.has(a.fecha) && a.fecha < fecha,
  );
  return abierta?.fecha ?? null;
}
