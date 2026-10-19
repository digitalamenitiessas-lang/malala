import Link from "next/link";
import { Eye, Pencil } from "lucide-react";

interface Props {
  href: string;
  /** "view" muestra ícono de ojo (default), "edit" muestra lápiz. */
  variant?: "view" | "edit";
  /** Texto del botón. Default: "Ver" / "Editar" según variant. */
  label?: string;
}

/**
 * Botón de acción para filas de tablas (Ver / Editar). Verde distintivo,
 * se llena al pasar el mouse para que se note que es clickeable.
 *
 * SIN PREFETCH, a propósito. Next prefetea cada Link apenas entra en el
 * viewport, y esto es el botón de CADA FILA de catorce listados: recetas tiene
 * 1.482 filas, insumos 343, gift cards 163. Abrir una de esas pantallas
 * disparaba cientos de pedidos.
 *
 * Medido en producción: 8.214 de 9.189 peticiones —el 89%— eran prefetch, con
 * ráfagas de 245 en un minuto. El servidor las contesta en 10-30 ms cada una y
 * no se queja, pero el salón está a 171 ms de ida y vuelta y el navegador abre
 * pocas conexiones a la vez: la navegación de verdad queda haciendo cola detrás
 * de la avalancha. Así apareció, como "entramos al shampoo, le damos guardar y
 * se queda cargando un montón y no se guarda" — el guardado había tardado
 * 106 ms y contestado 200; lo que no llegaba era la pantalla siguiente.
 *
 * El prefetch tiene sentido para dos o tres links fijos, no para el botón de
 * doscientas filas de las que se abre una. Con `false` tampoco prefetea al
 * pasar el mouse (doc de Link, App Router).
 */
export function TableActionLink({ href, variant = "view", label }: Props) {
  const Icon = variant === "edit" ? Pencil : Eye;
  return (
    <Link
      href={href}
      prefetch={false}
      className="inline-flex items-center gap-1.5 rounded-md bg-sage-50 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-sage-700 ring-1 ring-inset ring-sage-700/30 transition-colors hover:bg-sage-700 hover:text-white hover:ring-sage-700"
    >
      <Icon className="h-3.5 w-3.5 stroke-[1.5]" />
      {label ?? (variant === "edit" ? "Editar" : "Ver")}
    </Link>
  );
}
