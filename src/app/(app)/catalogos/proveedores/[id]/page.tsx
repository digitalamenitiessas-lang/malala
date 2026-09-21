import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { TableActionLink } from "@/components/table-action-link";
import { ProveedorForm } from "@/components/forms/proveedor-form";
import { AumentoPreciosProveedorForm } from "@/components/forms/aumento-precios-proveedor";
import {
  getProveedor,
  updateProveedor,
} from "@/lib/data/proveedores";
import { listEgresos } from "@/lib/data/egresos";
import { listInsumosByProveedor } from "@/lib/data/insumos";
import { requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { formatARS, formatDateShort } from "@/lib/utils";
import type { EgresoConDetalle } from "@/lib/data/egresos-helpers";

interface SearchParams {
  rango?: "mes" | "3meses" | "anio" | "todo";
}

const RANGOS: Array<{
  value: NonNullable<SearchParams["rango"]>;
  label: string;
}> = [
  { value: "mes", label: "Últimos 30 días" },
  { value: "3meses", label: "Últimos 3 meses" },
  { value: "anio", label: "Último año" },
  { value: "todo", label: "Todo" },
];

function rangoToFechas(rango: NonNullable<SearchParams["rango"]>) {
  const now = new Date();
  const desde = new Date(now);
  if (rango === "mes") desde.setDate(desde.getDate() - 30);
  else if (rango === "3meses") desde.setDate(desde.getDate() - 90);
  else if (rango === "anio") desde.setDate(desde.getDate() - 365);
  else return { desde: undefined, hasta: undefined };
  return { desde: desde.toISOString(), hasta: now.toISOString() };
}

export default async function EditarProveedorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCatalogos) redirect("/dashboard");
  const puedeRegistrarCompra = user.rol === "admin" || user.rol === "encargada";
  const { id } = await params;
  const sp = await searchParams;
  const rango = sp.rango ?? "3meses";
  const { desde, hasta } = rangoToFechas(rango);

  const [proveedor, egresos, insumosDelProveedor] = await Promise.all([
    getProveedor(id),
    listEgresos({ proveedorId: id, desde, hasta }),
    listInsumosByProveedor(id),
  ]);
  if (!proveedor) notFound();

  const UNIDAD_LABEL: Record<string, string> = {
    ud: "ud",
    ml: "ml",
    g: "g",
    aplicacion: "apl.",
  };

  async function update(_prev: unknown, formData: FormData) {
    "use server";
    return await updateProveedor(id, formData);
  }

  const { totales, porInsumo } = computarHistorial(egresos);

  return (
    <div className="space-y-10 max-w-5xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
            {proveedor.nombre}
          </h1>
          <p className="text-sm text-muted-foreground">
            {proveedor.cuit ? `CUIT ${proveedor.cuit} · ` : ""}
            {proveedor.telefono ?? "Sin teléfono"}
          </p>
        </div>
        {puedeRegistrarCompra && (
          <Link
            href={`/egresos/nuevo?proveedor=${proveedor.id}&compra=1`}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
          >
            <Plus className="h-4 w-4 stroke-[1.5]" />
            Registrar compra
          </Link>
        )}
      </header>

      {/* KPIs */}
      <section className="space-y-3">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Resumen de compras
          </h2>
          <form action={`/catalogos/proveedores/${id}`} method="get">
            <select
              name="rango"
              defaultValue={rango}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs"
              onChange={undefined}
            >
              {RANGOS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button type="submit" className="sr-only">
              Filtrar
            </button>
            <noscript>
              <button
                type="submit"
                className="ml-2 rounded-md bg-primary px-3 py-1.5 text-xs uppercase tracking-wider text-primary-foreground"
              >
                Aplicar
              </button>
            </noscript>
          </form>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi
            label="Total comprado"
            value={formatARS(totales.total)}
            hint={`${totales.cantidad} compra${totales.cantidad !== 1 ? "s" : ""}`}
          />
          <Kpi
            label="Ticket promedio"
            value={formatARS(totales.ticketPromedio)}
          />
          <Kpi
            label="Pagado"
            value={formatARS(totales.pagado)}
            color="sage-700"
          />
          <Kpi
            label="Deuda pendiente"
            value={formatARS(proveedor.deuda_pendiente)}
            color={proveedor.deuda_pendiente > 0 ? "danger" : undefined}
            hint="Total histórico, no por rango"
          />
        </div>
      </section>

      {/* Insumos del proveedor (catálogo) */}
      {insumosDelProveedor.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Insumos del proveedor
          </h2>
          <p className="text-xs text-muted-foreground">
            Insumos del catálogo vinculados a este proveedor.
          </p>
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Insumo</th>
                  <th className="px-4 py-3 text-left font-medium">Envase</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Precio envase
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    $ unitario
                  </th>
                  <th className="px-4 py-3 text-center font-medium w-28">
                    Estado
                  </th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {insumosDelProveedor.map((insumo) => (
                  <tr key={insumo.id} className="hover:bg-cream/30">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{insumo.nombre}</span>
                        {insumo.vendible && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sage-100 text-sage-700">
                            Vendible
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {insumo.tamano_envase}{" "}
                      {UNIDAD_LABEL[insumo.unidad_medida] ??
                        insumo.unidad_medida}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatARS(insumo.precio_envase)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {insumo.precio_unitario != null
                        ? formatARS(insumo.precio_unitario)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {insumo.activo ? (
                        <span className="bg-sage-100 text-sage-900 px-2 py-0.5 rounded text-xs font-medium">
                          Activo
                        </span>
                      ) : (
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TableActionLink
                        href={`/catalogos/insumos/${insumo.id}`}
                        variant="edit"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Aumento masivo de precios */}
      {puedeRegistrarCompra && insumosDelProveedor.length > 0 && (
        <AumentoPreciosProveedorForm
          proveedorId={proveedor.id}
          proveedorNombre={proveedor.nombre}
          cantidadInsumos={insumosDelProveedor.length}
          cantidadVendibles={
            insumosDelProveedor.filter(
              (i) => i.vendible && i.precio_venta != null,
            ).length
          }
        />
      )}

      {/* Compras por insumo */}
      {porInsumo.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Compras por insumo
          </h2>
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Insumo</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Compras
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Unidades acum.
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Último precio
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {porInsumo.map((row) => (
                  <tr key={row.insumoId} className="hover:bg-cream/30">
                    <td className="px-4 py-3 font-medium">{row.nombre}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {row.compras}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.unidadesTotales > 0
                        ? row.unidadesTotales.toLocaleString("es-AR")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {row.ultimoPrecioUnitario != null
                        ? formatARS(row.ultimoPrecioUnitario)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatARS(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Histórico */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Histórico de egresos
        </h2>
        {egresos.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No hay compras a este proveedor en el rango seleccionado.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium">Detalle</th>
                  <th className="px-4 py-3 text-right font-medium">Cant.</th>
                  <th className="px-4 py-3 text-right font-medium">Monto</th>
                  <th className="px-4 py-3 text-left font-medium">MP</th>
                  <th className="px-4 py-3 text-center font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {egresos.map((row) => (
                  <tr key={row.egreso.id} className="hover:bg-cream/30">
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {formatDateShort(row.egreso.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      {row.insumo ? (
                        <span className="font-medium">{row.insumo.nombre}</span>
                      ) : row.egreso.observacion ? (
                        <span className="text-muted-foreground">
                          {row.egreso.observacion}
                        </span>
                      ) : (
                        <span className="italic text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {row.egreso.cantidad ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatARS(row.egreso.valor)}
                    </td>
                    <td className="px-4 py-3 text-xs uppercase text-muted-foreground">
                      {row.mp?.codigo ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.egreso.pagado ? (
                        <span
                          className="text-xs uppercase tracking-wider"
                          style={{ color: "var(--sage-700)" }}
                        >
                          Pagado
                        </span>
                      ) : (
                        <span
                          className="text-xs uppercase tracking-wider"
                          style={{ color: "var(--danger)" }}
                        >
                          Pendiente
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Form de edición */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Datos del proveedor
        </h2>
        <ProveedorForm
          proveedor={proveedor}
          action={update}
          submitLabel="Guardar"
        />
      </section>
    </div>
  );
}

function computarHistorial(egresos: EgresoConDetalle[]) {
  const total = egresos.reduce((acc, r) => acc + r.egreso.valor, 0);
  const pagado = egresos
    .filter((r) => r.egreso.pagado)
    .reduce((acc, r) => acc + r.egreso.valor, 0);
  const cantidad = egresos.length;
  const ticketPromedio = cantidad > 0 ? total / cantidad : 0;

  const insumoMap = new Map<
    string,
    {
      insumoId: string;
      nombre: string;
      compras: number;
      unidadesTotales: number;
      total: number;
      ultimoPrecioUnitario: number | null;
      ultimaFecha: number;
    }
  >();

  // recorrer por fecha desc (ya vienen ordenados así desde listEgresos)
  for (const row of egresos) {
    if (!row.insumo) continue;
    const insumoId = row.insumo.id;
    const fechaMs = new Date(row.egreso.fecha).getTime();
    const cant = row.egreso.cantidad ?? 0;
    const precioUnit = cant > 0 ? row.egreso.valor / cant : null;

    const cur = insumoMap.get(insumoId) ?? {
      insumoId,
      nombre: row.insumo.nombre,
      compras: 0,
      unidadesTotales: 0,
      total: 0,
      ultimoPrecioUnitario: null as number | null,
      ultimaFecha: 0,
    };
    cur.compras += 1;
    cur.unidadesTotales += cant;
    cur.total += row.egreso.valor;
    if (fechaMs >= cur.ultimaFecha && precioUnit != null) {
      cur.ultimoPrecioUnitario = precioUnit;
      cur.ultimaFecha = fechaMs;
    }
    insumoMap.set(insumoId, cur);
  }

  const porInsumo = Array.from(insumoMap.values()).sort(
    (a, b) => b.total - a.total,
  );

  return {
    totales: { total, pagado, cantidad, ticketPromedio },
    porInsumo,
  };
}

function Kpi({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: "sage-700" | "danger";
}) {
  const valueStyle =
    color === "sage-700"
      ? { color: "var(--sage-700)" }
      : color === "danger"
        ? { color: "var(--danger)" }
        : undefined;
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className="mt-2 font-display text-2xl tabular-nums"
        style={valueStyle}
      >
        {value}
      </p>
      {hint && (
        <p className="text-xs text-muted-foreground mt-1 tabular-nums">
          {hint}
        </p>
      )}
    </div>
  );
}
