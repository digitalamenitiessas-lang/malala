"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { useTransitionFeedback } from "@/components/feedback/action-feedback";
import { LoadingButton } from "./field";
import { anularIngreso } from "@/lib/data/ingresos-actions";
import { formatARS } from "@/lib/utils";

interface Props {
  ingresoId: string;
  total: number;
  anulado: boolean;
}

/**
 * Anular en vez de editar: la venta no se toca ni se borra, se marca. Así la
 * caja de ese día sigue pudiendo explicarse, que es justamente lo que se
 * perdería si se pudiera cambiar un total sin dejar registro.
 */
export function AnularVenta({ ingresoId, total, anulado }: Props) {
  const { pending, run } = useTransitionFeedback();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (anulado) {
    return (
      <section className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">Venta anulada</p>
        <p className="mt-1 text-xs text-brown-700">
          No cuenta en la caja, los reportes ni las comisiones. Queda acá como
          registro de que existió.
        </p>
      </section>
    );
  }

  function anular() {
    setError(null);
    run(
      async () => {
        const res = await anularIngreso(ingresoId, motivo);
        if (!res.ok) setError(Object.values(res.errors).flat().join(" "));
        return res;
      },
      { refreshOnSuccess: true, successMessage: "Venta anulada" },
    );
  }

  return (
    <section className="space-y-3 border-t border-border pt-6">
      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-destructive transition-colors hover:bg-destructive/10"
        >
          <Ban className="h-3.5 w-3.5 stroke-[1.5]" />
          Anular venta
        </button>
      ) : (
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Anular esta venta de {formatARS(total)}
            </p>
            <p className="text-xs text-muted-foreground">
              Se descuenta de la caja del día, vuelve el stock que consumió y,
              si se usó, se devuelve el saldo de la gift card o de la cuenta
              corriente. La venta queda registrada como anulada y después
              cargás la correcta.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="motivo-anulacion"
              className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Motivo
            </label>
            <input
              id="motivo-anulacion"
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. precio mal cargado"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Queda guardado con la venta. Sirve para entender después por qué
              se anuló.
            </p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center gap-2">
            <LoadingButton
              type="button"
              onClick={anular}
              pending={pending}
              pendingLabel="Anulando..."
              className="rounded-md bg-destructive px-4 py-2 text-xs font-medium uppercase tracking-wider text-white transition-colors hover:opacity-90"
            >
              Confirmar anulación
            </LoadingButton>
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                setMotivo("");
                setError(null);
              }}
              className="rounded-md border border-border px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors hover:bg-cream"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
