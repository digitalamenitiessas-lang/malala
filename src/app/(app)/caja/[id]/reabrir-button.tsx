"use client";

import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "@/components/forms/field";
import { reabrirCierre } from "@/lib/data/caja-actions";

/**
 * Nombrar el día que se va a reabrir.
 *
 * Elu: "lo que también a veces es confuso es entrar a reabrir una caja. Se
 * modifican, no sabés si estás en la caja que abriste o en la caja del día".
 * Reabrir borra el cierre, así que equivocarse de día cuesta un arqueo.
 */
export function ReabrirCierreButton({
  cierreId,
  fecha,
}: {
  cierreId: string;
  fecha: string;
}) {
  const { pending, run } = useTransitionFeedback();

  return (
    <LoadingButton
      type="button"
      pending={pending}
      pendingLabel="Reabriendo..."
      onClick={() => {
        if (
          !confirm(
            `¿Reabrir el cierre del ${fecha}? Se va a borrar y vas a poder cargar más movimientos en ESE día.`,
          )
        ) {
          return;
        }
        run(() => reabrirCierre(cierreId), {
          redirectTo: "/caja",
          successMessage: "Cierre reabierto",
        });
      }}
      className="rounded-md border px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors disabled:opacity-50"
      style={{
        borderColor: "var(--danger)",
        color: "var(--danger)",
      }}
    >
      Reabrir cierre
    </LoadingButton>
  );
}
