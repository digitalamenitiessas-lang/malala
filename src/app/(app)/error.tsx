"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Pantalla de error del back office.
 *
 * Antes no había ninguna, así que cualquier error mostraba la pantalla cruda de
 * Next: fondo blanco, "Application error", y nada que hacer. Desde el mostrador
 * eso se lee como "se rompió el sistema" y termina en un mensaje por WhatsApp
 * con una foto de la pantalla.
 *
 * La causa más común, por lejos, es la pestaña vieja: cada vez que se actualiza
 * el sistema cambian los identificadores internos de los formularios, y una
 * pestaña abierta de antes sigue mandando los viejos. El servidor contesta
 * "Failed to find Server Action ... This request might be from an older or
 * newer deployment" y la pantalla se cae. Le pasó a Yerba Buena cargando una
 * compra en cuenta corriente, siete minutos después de una actualización.
 *
 * Por eso la acción principal es RECARGAR, no reintentar: reintentar vuelve a
 * mandar el identificador viejo y falla igual. En producción Next no deja leer
 * el mensaje del error —llega genérico, con un digest— así que no se puede
 * distinguir ese caso de los demás: se ofrece la recarga siempre, que además es
 * lo primero que conviene probar con casi cualquier error.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Queda en la consola del navegador con el digest, que es lo único que
    // permite cruzarlo contra el log del servidor cuando nos lo reportan.
    console.error("[malala] error de pantalla", error.digest, error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl space-y-5 rounded-md border border-border bg-card p-6">
      <div className="space-y-2">
        <h1 className="font-display text-2xl uppercase tracking-[0.15em]">
          Se cortó algo
        </h1>
        <p className="text-sm text-muted-foreground">
          No se pudo completar lo que estabas haciendo.{" "}
          <strong className="text-foreground">
            Casi siempre es porque actualizamos el sistema mientras tenías esta
            pantalla abierta.
          </strong>{" "}
          Se arregla recargando.
        </p>
      </div>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
      >
        <RefreshCw className="h-4 w-4 stroke-[1.5]" />
        Recargar la pantalla
      </button>

      <div className="space-y-2 rounded-md border border-border bg-cream/40 p-4 text-sm">
        <p className="font-medium">Si vuelve a pasar, recargá a fondo:</p>
        {/* Los dos atajos siempre: Yerba Buena trabaja en Mac y Centro en
            Windows, y dar sólo uno manda a la mitad del salón a preguntar. */}
        <ul className="space-y-1 text-muted-foreground">
          <li>
            En Mac: <kbd className="font-sans font-semibold">Cmd + Shift + R</kbd>
          </li>
          <li>
            En Windows: <kbd className="font-sans font-semibold">Ctrl + F5</kbd>
          </li>
        </ul>
        <p className="text-muted-foreground">
          Si después de recargar sigue igual, avisanos y pasanos este código:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {error.digest ?? "sin código"}
          </code>
        </p>
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        <button
          type="button"
          onClick={reset}
          className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Reintentar sin recargar
        </button>
        <a
          href="/dashboard"
          className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Volver al inicio
        </a>
      </div>
    </div>
  );
}
