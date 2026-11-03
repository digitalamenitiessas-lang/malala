"use client";

import { useState } from "react";
import { useActionStateFeedback } from "@/components/feedback/action-feedback";
import { Field, GlobalError, LoadingButton } from "@/components/forms/field";
import type { ActionResult } from "@/lib/data/_helpers";

type Accion = (
  state: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

/**
 * Corrección del código impreso.
 *
 * Va detrás de un "Corregir" y no suelto en la pantalla: es una operación rara,
 * pero cuando hace falta no hay ninguna otra salida. El número está escrito en
 * una tarjeta que se llevó otra persona; si no coincide con el sistema, el
 * problema aparece semanas después con la clienta enfrente.
 */
export function CorregirCodigo({
  giftCardId,
  codigo,
  action,
}: {
  giftCardId: string;
  codigo: string;
  action: Accion;
}) {
  const [abierto, setAbierto] = useState(false);
  const [state, formAction, pending] = useActionStateFeedback(action, {
    successMessage: "Código corregido",
    refreshOnSuccess: true,
    onSuccess: () => setAbierto(false),
  });
  const errors = state && !state.ok ? state.errors : {};

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        Corregir código
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="gift_card_id" value={giftCardId} />
      <Field
        label="Código correcto"
        name="codigo"
        defaultValue={codigo}
        error={errors.codigo}
        required
        autoFocus
      />
      <Field
        label="Por qué se corrige"
        name="motivo"
        error={errors.motivo}
        hint="Queda en el historial de la tarjeta."
        required
      />
      <GlobalError error={errors._} />
      <div className="flex items-center gap-3">
        <LoadingButton
          type="submit"
          pending={pending}
          pendingLabel="Guardando..."
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
        >
          Guardar código
        </LoadingButton>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * Anular: deja la tarjeta sin valor. Solo admin. Su cobro sale de la caja del
 * día en que se vendió (anularGiftCard borra el movimiento de la venta), así
 * que NO hay que cargar además un gasto: el texto viejo decía eso y la plata
 * se descontaba dos veces.
 */
export function AnularGiftCard({
  giftCardId,
  action,
}: {
  giftCardId: string;
  action: Accion;
}) {
  const [abierto, setAbierto] = useState(false);
  const [state, formAction, pending] = useActionStateFeedback(action, {
    successMessage: "Gift card anulada",
    refreshOnSuccess: true,
    onSuccess: () => setAbierto(false),
  });
  const errors = state && !state.ok ? state.errors : {};

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-xs font-medium uppercase tracking-wider text-destructive transition-opacity hover:opacity-70"
      >
        Anular
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="gift_card_id" value={giftCardId} />
      <p className="text-sm text-muted-foreground">
        La tarjeta queda sin saldo y no se va a poder canjear. Su cobro sale de
        la caja del día en que se vendió, como si no se hubiera vendido: no
        cargues además un gasto.
      </p>
      <Field
        label="Motivo"
        name="motivo"
        error={errors.motivo}
        required
        autoFocus
      />
      <GlobalError error={errors._} />
      <div className="flex items-center gap-3">
        <LoadingButton
          type="submit"
          pending={pending}
          pendingLabel="Anulando..."
          className="rounded-md bg-destructive px-4 py-2 text-sm font-medium uppercase tracking-wider text-destructive-foreground transition-opacity hover:opacity-90"
        >
          Anular
        </LoadingButton>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
