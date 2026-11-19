/**
 * Interruptores de partes enteras del sistema.
 *
 * RESERVAS_PROPIAS: la reserva online de la landing y la agenda de turnos del
 * back office. Los salones siguen tomando turnos por Calendico y no usaron la
 * agenda propia, así que queda apagada (19/11/2026): sin "Turnos" en el menú
 * ni en el dashboard, /turnos redirige al dashboard, y en la landing "Reservá
 * tu turno" lleva al Calendico de cada sucursal.
 *
 * No se borra nada: los datos y el código siguen. Para volver a usarla alcanza
 * con poner `true` y desplegar.
 */
export const RESERVAS_PROPIAS = false;

/**
 * Dónde reservan hoy las clientas cuando la reserva propia está apagada.
 * La clave es el id de la sucursal.
 */
export const RESERVA_EXTERNA_POR_SUCURSAL: Record<string, string> = {
  "seed-000001": "https://calendico.com/malala-centro/malala-centro",
  "seed-000002": "https://calendico.com/malala-yerba-buena/malala-yerba-buena",
};
