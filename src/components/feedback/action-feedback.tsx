"use client";

import { useActionState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  persistFlashToast,
  useToast,
} from "@/components/feedback/toast-provider";

type FeedbackResultLike = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string[]>;
};

interface FeedbackOptions<T extends FeedbackResultLike> {
  redirectTo?: string | ((result: T) => string);
  successMessage?: string;
  errorMessage?: string;
  refreshOnSuccess?: boolean;
  /**
   * Ir a redirectTo recargando la página entera en vez de navegar con el
   * router. Para destinos cuya navegación del lado del cliente se cuelga (la
   * lista de insumos): el botón quedaba en "Guardando..." aunque ya se había
   * guardado.
   */
  recargar?: boolean;
  onSuccess?: (result: T) => void;
  onError?: (result: T) => void;
}

function resolveErrorMessage(
  result: FeedbackResultLike,
  fallback = "No se pudo guardar",
) {
  const inline = result.errors
    ? Object.values(result.errors).flat().filter(Boolean)
    : [];
  return inline[0] ?? result.message ?? fallback;
}

function resolveSuccessMessage(
  result: FeedbackResultLike,
  fallback = "Guardado correctamente",
) {
  return result.message ?? fallback;
}

function useFeedbackDispatcher() {
  const router = useRouter();
  const { notifyError, notifySuccess } = useToast();

  return useCallback(
    <T extends FeedbackResultLike>(result: T, options: FeedbackOptions<T>) => {
      if (result.ok) {
        const message = resolveSuccessMessage(
          result,
          options.successMessage ?? "Guardado correctamente",
        );
        options.onSuccess?.(result);
        const redirectTo =
          typeof options.redirectTo === "function"
            ? options.redirectTo(result)
            : options.redirectTo;
        if (redirectTo) {
          persistFlashToast({ type: "success", message });
          if (options.recargar) {
            window.location.assign(redirectTo);
            return result;
          }
          router.push(redirectTo);
          if (options.refreshOnSuccess !== false) {
            router.refresh();
          }
          return result;
        }
        notifySuccess(message);
        if (options.refreshOnSuccess) {
          router.refresh();
        }
        return result;
      }

      options.onError?.(result);
      notifyError(
        resolveErrorMessage(result, options.errorMessage ?? "No se pudo guardar"),
      );
      return result;
    },
    [notifyError, notifySuccess, router],
  );
}

export function useActionStateFeedback<T extends FeedbackResultLike>(
  action: (state: T | null, formData: FormData) => Promise<T>,
  options: FeedbackOptions<T>,
) {
  const dispatchFeedback = useFeedbackDispatcher();

  return useActionState<T | null, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    return dispatchFeedback(result, options);
  }, null);
}

export function useTransitionFeedback<T extends FeedbackResultLike>() {
  const [pending, startTransition] = useTransition();
  const dispatchFeedback = useFeedbackDispatcher();

  const run = useCallback(
    (task: () => Promise<T>, options: FeedbackOptions<T> = {}) => {
      startTransition(async () => {
        const result = await task();
        dispatchFeedback(result, options);
      });
    },
    [dispatchFeedback],
  );

  return { pending, run };
}
