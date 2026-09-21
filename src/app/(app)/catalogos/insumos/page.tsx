import Link from "next/link";
import { Plus } from "lucide-react";
import { listInsumos } from "@/lib/data/insumos";
import { listMediosPago } from "@/lib/data/medios-pago";
import { listProveedores } from "@/lib/data/proveedores";
import { listSucursales } from "@/lib/data/sucursales";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { redirect } from "next/navigation";
import { formatARS } from "@/lib/utils";
import { RegistrarCompraInsumoModal } from "@/components/forms/registrar-compra-insumo-modal";
import { InsumosSearch } from "./insumos-search";

const UNIDAD_LABEL: Record<string, string> = {
  ud: "ud",
  ml: "ml",
  g: "g",
  aplicacion: "apl.",
};

export default async function InsumosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCatalogos) redirect("/dashboard");
  const sucursalActiva = await getActiveSucursal();
  const sp = await searchParams;
  // Next entrega un array si el parámetro viene repetido (?q=a&q=b): nos
  // quedamos con el primero para no llamar .trim() sobre un array.
  const qParam = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = qParam?.trim() || undefined;
  const [insumos, proveedores, sucursales, mediosPago] = await Promise.all([
    listInsumos({ incluirInactivos: true, sucursalId: sucursalActiva?.id, q }),
    listProveedores(),
    listSucursales({ soloActivas: true }),
    listMediosPago({ soloActivos: true, excluirGiftCard: true }),
  ]);
  const provMap = new Map(proveedores.map((p) => [p.id, p]));
  // Se cuenta sobre la lista que se está mostrando, así el número no contradice
  // a la búsqueda activa. Son los insumos que dejan corto el costo de la receta.
  const sinPrecio = insumos.filter((i) => i.precio_unitario == null).length;
  const puedeCargarCompra = user.rol === "admin" || user.rol === "encargada";
  // Las compras se cargan solo en la sucursal activa (sucursales aisladas).
  const sucursalesParaCompra = sucursalActiva
    ? sucursales.filter((s) => s.id === sucursalActiva.id)
    : sucursales;

  return (
    <div className="space-y-8 max-w-6xl">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            Insumos
          </h1>
          <p className="text-sm text-muted-foreground">
            {q
              ? `${insumos.length} ${insumos.length === 1 ? "resultado" : "resultados"} para “${q}”`
              : `${insumos.length} insumos`}{" "}
            · {sucursalActiva?.nombre ?? "sucursal"}
          </p>
          {sinPrecio > 0 && (
            <p className="text-xs text-destructive">
              {sinPrecio}{" "}
              {sinPrecio === 1
                ? "insumo sin precio cargado"
                : "insumos sin precio cargado"}
              : las recetas que los usan muestran un costo más bajo que el real.
            </p>
          )}
        </div>
        {user.rol === "admin" && (
          <Link
            href="/catalogos/insumos/nuevo"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4 stroke-[1.5]" />
            Nuevo
          </Link>
        )}
      </header>

      <InsumosSearch />

      {/* La tabla ya venía justa de ancho; con la columna de código scrollea en
          pantallas chicas en vez de apretar las celdas. */}
      <div className="bg-card border border-border rounded-md overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-3 w-24">Código</th>
              <th className="text-left font-medium px-4 py-3">Nombre</th>
              <th className="text-left font-medium px-4 py-3">Tipo</th>
              <th className="text-left font-medium px-4 py-3">Proveedor</th>
              <th className="text-right font-medium px-4 py-3">Envase</th>
              <th className="text-right font-medium px-4 py-3">$ envase</th>
              <th className="text-right font-medium px-4 py-3">Umbral</th>
              <th className="text-center font-medium px-4 py-3">Estado</th>
              <th className="px-4 py-3 w-48 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {insumos.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {q
                    ? `Sin resultados para “${q}”.`
                    : "No hay insumos cargados."}
                </td>
              </tr>
            ) : null}
            {insumos.map((i) => {
              const proveedoresDelInsumo = (i.proveedor_ids ?? [])
                .map((id) => provMap.get(id))
                .filter((p): p is NonNullable<typeof p> => p != null);
              return (
                <tr key={i.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 font-medium tabular-nums">
                    {i.codigo ?? (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{i.nombre}</td>
                  <td className="px-4 py-3">
                    {i.tipo === "venta" ? (
                      <span className="bg-cream text-sage-900 border border-border px-2 py-0.5 rounded text-xs">
                        Venta{i.precio_venta != null ? ` · ${formatARS(i.precio_venta)}` : ""}
                        {i.precio_venta_efectivo != null
                          ? ` / ${formatARS(i.precio_venta_efectivo)} ef.`
                          : ""}
                      </span>
                    ) : (
                      <span className="bg-stone-100 text-stone-600 px-2 py-0.5 rounded text-xs">
                        Bacha
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {proveedoresDelInsumo.length > 0
                      ? proveedoresDelInsumo.map((p) => p.nombre).join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {i.tamano_envase} {UNIDAD_LABEL[i.unidad_medida]}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {/* Los insumos importados de la planilla vienen sin precio:
                        mostrar "$ 0,00" los haría pasar por gratis y son los
                        que dejan incompleto el costo de las recetas. */}
                    {i.precio_unitario != null ? (
                      formatARS(i.precio_envase)
                    ) : (
                      <span
                        className="text-destructive font-medium"
                        title="Sin precio cargado: este insumo no suma al costo de las recetas que lo usan"
                      >
                        Sin precio
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {i.umbral_stock_bajo}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {i.activo ? (
                      <span className="bg-sage-100 text-sage-900 px-2 py-0.5 rounded text-xs">
                        Activo
                      </span>
                    ) : (
                      <span className="bg-stone-100 text-stone-500 px-2 py-0.5 rounded text-xs">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {puedeCargarCompra &&
                        i.activo &&
                        sucursalActiva &&
                        sucursales.length > 0 && (
                          <RegistrarCompraInsumoModal
                            insumo={i}
                            proveedores={proveedoresDelInsumo}
                            sucursales={sucursalesParaCompra}
                            mediosPago={mediosPago}
                            defaultSucursalId={sucursalActiva.id}
                          />
                        )}
                      {user.rol === "admin" && (
                        <Link
                          href={`/catalogos/insumos/${i.id}`}
                          className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        >
                          Editar
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
