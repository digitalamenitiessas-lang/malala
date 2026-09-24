"use server";

import type { ActionResult } from "./_helpers";
import { togglePagadoEgreso as togglePagadoEgresoImpl } from "./egresos";

export async function togglePagadoEgreso(
  egresoId: string,
  mpId?: string,
  mpCuentaId?: string,
): Promise<ActionResult> {
  return togglePagadoEgresoImpl(egresoId, mpId, mpCuentaId);
}
