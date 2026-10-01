import type { ID } from "@/lib/types";

/**
 * Ordena las sucursales de un superadmin dejando adelante la suya.
 *
 * El orden no es cosmético: clampSucursalId cae al primero del array cuando la
 * URL no trae sucursal, así que ese es el que decide dónde aterriza la persona
 * al abrir cada pantalla. Sin esto, un superadmin de Yerba Buena abría el
 * sistema parado en Centro.
 *
 * Vive en su propio módulo, y no en access.ts, para no cerrar un ciclo de
 * imports: access.ts ya importa getCurrentUser de session.ts, y session.ts es
 * quien necesita esta función.
 */
export function ordenarSucursalesPermitidas(
  activas: ID[],
  sucursalDefaultId: ID,
): ID[] {
  return [
    ...activas.filter((id) => id === sucursalDefaultId),
    ...activas.filter((id) => id !== sucursalDefaultId),
  ];
}
