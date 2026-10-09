import { SucursalSelect } from "./sucursal-select";
import { switchSucursal } from "@/lib/auth/actions";
import type { Sucursal, Usuario } from "@/lib/types";

interface Props {
  user: Usuario;
  active: Sucursal;
  sucursales: Sucursal[];
}

export function SucursalSwitcher({ user, active, sucursales }: Props) {
  const permitidasIds = user.sucursal_ids_permitidas?.length
    ? user.sucursal_ids_permitidas
    : [user.sucursal_default_id];
  const sucursalesPermitidas = sucursales.filter((s) =>
    permitidasIds.includes(s.id),
  );

  // Si solo tiene acceso a una sucursal, mostrar solo el nombre (sin selector)
  if (sucursalesPermitidas.length <= 1) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Sucursal
        </span>
        <span className="font-medium">{active.nombre}</span>
      </div>
    );
  }

  return (
    <form action={switchSucursalAndReload} className="flex items-center gap-2">
      <label
        htmlFor="sucursal"
        className="text-xs uppercase tracking-wider text-muted-foreground"
      >
        Sucursal
      </label>
      <SucursalSelect
        value={active.id}
        opciones={sucursalesPermitidas.map((s) => ({
          id: s.id,
          nombre: s.nombre,
        }))}
      />
      {/* Queda para el teclado y para el caso sin JavaScript, pero elegir en
          el desplegable ya cambia: ese botón chiquito al costado era todo lo
          que separaba "elegí la sucursal" de "cambié de sucursal". */}
      <button
        type="submit"
        className="text-xs uppercase tracking-wider text-sage-700 hover:text-sage-900"
      >
        Cambiar
      </button>
    </form>
  );
}

/**
 * Cambiar de sucursal tiene que dejar la pantalla en la sucursal elegida.
 *
 * El selector guardaba la elección en una cookie pero no tocaba la URL, y
 * Caja, Gastos, Empleadas y Liquidaciones leen la sucursal del `?sucursal=`.
 * Parada en /caja?sucursal=<yerba buena>, elegir Centro guardaba Centro y la
 * pantalla seguía mostrando Yerba Buena, porque el parámetro viejo le ganaba a
 * la cookie recién escrita. Lucía: "cambio a centro arriba y me sigue
 * apareciendo datos de yb".
 *
 * Se vuelve a la misma pantalla sin ese parámetro, así manda lo que acaba de
 * elegir.
 */
async function switchSucursalAndReload(formData: FormData) {
  "use server";
  const { revalidatePath } = await import("next/cache");
  const { headers } = await import("next/headers");
  const { redirect } = await import("next/navigation");

  const sucursalId = formData.get("sucursal_id");
  if (typeof sucursalId !== "string") return;

  await switchSucursal(sucursalId);
  revalidatePath("/", "layout");

  const referer = (await headers()).get("referer");
  if (!referer) return;
  let destino: string;
  try {
    const url = new URL(referer);
    url.searchParams.delete("sucursal");
    destino = url.pathname + url.search;
  } catch {
    return; // Sin un referer utilizable alcanza con el revalidate de arriba.
  }
  redirect(destino);
}
