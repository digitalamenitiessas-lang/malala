import Link from "next/link";
import { Trash2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AgregarInsumoReceta } from "@/components/forms/agregar-insumo-receta";
import {
  getRecetaItems,
  removeRecetaItem,
  upsertRecetaItem,
} from "@/lib/data/recetas";
import { getServicio } from "@/lib/data/servicios";
import { listInsumos } from "@/lib/data/insumos";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { esAdmin } from "@/lib/auth/access";
import { formatARS } from "@/lib/utils";
import {
  BadgeAConfirmar,
  BadgeLineaPropuesta,
  BadgeLineaSinPrecio,
  BadgeSinPrecio,
} from "../receta-badges";
import { ConfirmarRecetaButton } from "./confirmar-receta-button";

const UNIDAD_LABEL: Record<string, string> = {
  ud: "ud",
  ml: "ml",
  g: "g",
  aplicacion: "apl.",
};

export default async function EditarRecetaPage({
  params,
}: {
  params: Promise<{ servicioId: string }>;
}) {
  const user = await requireUser();
  const { servicioId } = await params;

  // La receta y los insumos disponibles son los de la sucursal activa.
  const sucursal = await getActiveSucursal();
  if (!sucursal) redirect("/catalogos/recetas");

  const [servicio, items, insumos] = await Promise.all([
    getServicio(servicioId),
    getRecetaItems(servicioId, sucursal.id),
    // Las recetas solo consumen productos de bacha (uso interno).
    listInsumos({ sucursalId: sucursal.id, tipo: "bacha" }),
  ]);
  if (!servicio) notFound();

  const isAdmin = esAdmin(user.rol);
  // La server action de confirmar también la puede correr la encargada.
  const puedeConfirmar = esAdmin(user.rol) || user.rol === "encargada";

  // Insumos disponibles para agregar (los que no están ya en la receta)
  const insumosUsados = new Set(items.map((i) => i.insumo.id));
  const insumosDisponibles = insumos.filter((i) => !insumosUsados.has(i.id));

  // Líneas que el sistema propuso desde la planilla y nadie validó, y líneas
  // que no suman al costo porque el insumo no tiene precio cargado.
  const propuestas = items.filter((i) => i.receta.confirmada === false).length;
  const sinPrecio = items.filter(
    (i) => i.insumo.precio_unitario == null,
  ).length;

  const costoTotal = items.reduce((acc, i) => acc + i.costo, 0);
  // Comisión estimada de la empleada: % del precio efectivo (precio pleno).
  const comision =
    servicio.precio_efectivo * (servicio.comision_default_pct / 100);
  // Margen de contribución: lo que queda después de insumos Y comisión.
  const margen = servicio.precio_efectivo - costoTotal - comision;
  const margenPct =
    servicio.precio_efectivo > 0
      ? (margen / servicio.precio_efectivo) * 100
      : 0;

  async function add(formData: FormData) {
    "use server";
    if (!isAdmin) redirect(`/catalogos/recetas/${servicioId}`);
    formData.set("servicio_id", servicioId);
    await upsertRecetaItem(formData);
  }

  async function update(formData: FormData) {
    "use server";
    if (!isAdmin) redirect(`/catalogos/recetas/${servicioId}`);
    formData.set("servicio_id", servicioId);
    await upsertRecetaItem(formData);
  }

  async function remove(formData: FormData) {
    "use server";
    if (!isAdmin) redirect(`/catalogos/recetas/${servicioId}`);
    const id = formData.get("receta_id");
    if (typeof id === "string") await removeRecetaItem(id);
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Receta
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {servicio.codigo && (
            <span className="tabular-nums font-medium text-foreground">
              {servicio.codigo}
            </span>
          )}
          <span>
            {servicio.rubro} ·{" "}
            <span className="font-medium text-foreground">
              {servicio.nombre}
            </span>
          </span>
          <BadgeAConfirmar cantidad={propuestas} />
          <BadgeSinPrecio cantidad={sinPrecio} />
        </p>
      </header>

      {propuestas > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-brown-900">
          <div className="space-y-1">
            <p className="font-medium">
              {propuestas}{" "}
              {propuestas === 1 ? "línea propuesta" : "líneas propuestas"} sin
              confirmar
            </p>
            <p className="text-xs">
              Las armó el sistema a partir de la planilla. Revisá las cantidades
              y confirmá la receta; editar una cantidad también confirma esa
              línea.
            </p>
          </div>
          {puedeConfirmar && (
            <ConfirmarRecetaButton
              servicioId={servicioId}
              sucursalId={sucursal.id}
              pendientes={propuestas}
            />
          )}
        </div>
      )}

      {sinPrecio > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive space-y-1">
          <p className="font-medium">
            Costo incompleto: {sinPrecio}{" "}
            {sinPrecio === 1
              ? "insumo sin precio cargado"
              : "insumos sin precio cargado"}
          </p>
          <p className="text-xs">
            Esas líneas suman $ 0 al costo, así que el costo real de esta receta
            es mayor y el margen menor que el que ves acá. Cargá el precio en{" "}
            <Link href="/catalogos/insumos" className="underline">
              Catálogos → Insumos
            </Link>
            .
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-md p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Precio efectivo
          </p>
          <p className="font-display text-2xl mt-2 tabular-nums">
            {formatARS(servicio.precio_efectivo)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-md p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Costo insumos
          </p>
          <p className="font-display text-2xl mt-2 tabular-nums">
            −{formatARS(costoTotal)}
          </p>
          {sinPrecio > 0 && (
            <p className="text-xs text-destructive mt-1">
              Incompleto: falta el precio de {sinPrecio}{" "}
              {sinPrecio === 1 ? "insumo" : "insumos"}
            </p>
          )}
        </div>
        <div className="bg-card border border-border rounded-md p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Comisión ({servicio.comision_default_pct}%)
          </p>
          <p className="font-display text-2xl mt-2 tabular-nums">
            −{formatARS(comision)}
          </p>
          {servicio.comision_default_pct === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              El servicio no tiene % cargado: la comisión la define el % de cada
              empleada
            </p>
          )}
        </div>
        <div className="bg-card border border-border rounded-md p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Margen real
          </p>
          <p
            className="font-display text-2xl mt-2 tabular-nums"
            style={{
              color: margen >= 0 ? "var(--sage-700)" : "var(--danger)",
            }}
          >
            {sinPrecio > 0 ? "≤ " : ""}
            {formatARS(margen)}
          </p>
          {/* Con comisión en 0 el margen no descuenta nada de la empleada:
              decirlo evita leer este número como el margen final. */}
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            {margenPct.toFixed(0)}% ·{" "}
            {servicio.comision_default_pct > 0
              ? "después de insumos y comisión"
              : "después de insumos, sin comisión"}
          </p>
          {sinPrecio > 0 && (
            <p className="text-xs text-destructive mt-1">
              Es el margen máximo: el real es menor
            </p>
          )}
        </div>
      </div>

      {/* Lista de insumos en la receta */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Insumos de la receta
        </h2>
        <div className="bg-card border border-border rounded-md overflow-hidden">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Sin insumos cargados todavía.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Insumo</th>
                  <th className="text-right font-medium px-4 py-3 w-40">
                    Cantidad
                  </th>
                  <th className="text-right font-medium px-4 py-3">$ unit.</th>
                  <th className="text-right font-medium px-4 py-3">Costo</th>
                  {isAdmin && <th className="px-4 py-3 w-20"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map(({ receta, insumo, costo }) => {
                  const esPropuesta = receta.confirmada === false;
                  const insumoSinPrecio = insumo.precio_unitario == null;
                  return (
                    <tr
                      key={receta.id}
                      className={
                        esPropuesta
                          ? "bg-warning/5 hover:bg-warning/10"
                          : "hover:bg-cream/30"
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {insumo.codigo && (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {insumo.codigo}
                            </span>
                          )}
                          <span className="font-medium">{insumo.nombre}</span>
                          {esPropuesta && <BadgeLineaPropuesta />}
                          {insumoSinPrecio && <BadgeLineaSinPrecio />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {isAdmin ? (
                          <form
                            action={update}
                            className="flex items-center gap-1 justify-end"
                          >
                            <input
                              type="hidden"
                              name="insumo_id"
                              value={insumo.id}
                            />
                            <input
                              type="number"
                              name="cantidad"
                              step="0.01"
                              min="0.01"
                              defaultValue={receta.cantidad}
                              className="w-20 px-2 py-1 text-right border border-border rounded-md text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            <span className="text-xs text-muted-foreground">
                              {UNIDAD_LABEL[insumo.unidad_medida]}
                            </span>
                            <button
                              type="submit"
                              className="text-xs uppercase tracking-wider text-sage-700 hover:text-sage-900 ml-1"
                            >
                              ↻
                            </button>
                          </form>
                        ) : (
                          <>
                            {receta.cantidad}{" "}
                            <span className="text-xs text-muted-foreground">
                              {UNIDAD_LABEL[insumo.unidad_medida]}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {insumo.precio_unitario != null ? (
                          formatARS(insumo.precio_unitario)
                        ) : (
                          <span className="text-destructive">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {/* Sin precio no se muestra $ 0: sería mentir sobre el costo. */}
                        {insumoSinPrecio ? (
                          <span className="text-destructive">—</span>
                        ) : (
                          formatARS(costo)
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <form action={remove}>
                            <input
                              type="hidden"
                              name="receta_id"
                              value={receta.id}
                            />
                            <button
                              type="submit"
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Quitar"
                            >
                              <Trash2 className="h-4 w-4 stroke-[1.5]" />
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Form para agregar */}
      {isAdmin && insumosDisponibles.length > 0 && (
        <section className="bg-card border border-border rounded-md p-5 space-y-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
            Agregar insumo
          </h2>
          <p className="text-xs text-muted-foreground">
            La cantidad es lo que consume <strong>un</strong> servicio, en la
            unidad de cada insumo (ml, g o ud) — no en envases.
          </p>
          <AgregarInsumoReceta insumosDisponibles={insumosDisponibles} action={add} />
        </section>
      )}

      {isAdmin && insumosDisponibles.length === 0 && items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Todos los insumos disponibles ya están en la receta.
        </p>
      )}
    </div>
  );
}
