import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Trash2 } from "lucide-react";
import { ServicioForm } from "@/components/forms/servicio-form";
import {
  getServicio,
  listRubrosServicios,
  toggleServicioActivo,
  updateServicio,
} from "@/lib/data/servicios";
import {
  addServicioHorario,
  deleteServicioHorario,
  listServicioHorarios,
} from "@/lib/data/servicios-horarios";
import { requireUser } from "@/lib/auth/session";
import { formatARS } from "@/lib/utils";
import { esAdmin } from "@/lib/auth/access";

const DIAS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

const DIA_LABEL: Record<number, string> = Object.fromEntries(
  DIAS.map((d) => [d.value, d.label]),
);

export default async function EditarServicioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!esAdmin(user.rol) && user.rol !== "encargada") {
    redirect("/catalogos/servicios");
  }
  const puedeEditar = esAdmin(user.rol);

  const { id } = await params;
  const [servicio, horarios, rubros] = await Promise.all([
    getServicio(id),
    listServicioHorarios(id),
    listRubrosServicios(),
  ]);
  if (!servicio) notFound();

  async function update(_prev: unknown, formData: FormData) {
    "use server";
    return await updateServicio(id, formData);
  }

  async function toggle() {
    "use server";
    await toggleServicioActivo(id);
  }

  async function addHorario(formData: FormData) {
    "use server";
    await addServicioHorario(id, formData);
  }

  async function delHorario(formData: FormData) {
    "use server";
    await deleteServicioHorario(String(formData.get("id") ?? ""));
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          {puedeEditar ? "Editar servicio" : "Servicio"}
        </h1>
        <p className="text-sm text-muted-foreground">{servicio.nombre}</p>
      </header>

      {puedeEditar && (
        <Link
          href={`/catalogos/recetas/${id}`}
          className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-4 transition-colors hover:bg-cream/40"
        >
          <div>
            <p className="text-sm font-medium">Receta de este servicio</p>
            <p className="text-xs text-muted-foreground">
              Definí qué insumos consume y cuánto, para costo, margen y descuento
              de stock al vender.
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-sage-700">
            Editar receta
            <ArrowRight className="h-4 w-4 stroke-[1.5]" />
          </span>
        </Link>
      )}

      {puedeEditar ? (
        <ServicioForm
          servicio={servicio}
          rubros={rubros}
          action={update}
          submitLabel="Guardar"
        />
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-md border border-border bg-card p-5">
          <Dato label="Rubro" value={servicio.rubro} />
          {/* La encargada ve la ficha en modo lectura: el código es como el
              salón identifica el servicio en la planilla. */}
          <Dato label="Código" value={servicio.codigo ?? "—"} />
          <Dato label="Nombre" value={servicio.nombre} />
          <Dato label="Precio lista" value={formatARS(servicio.precio_lista)} />
          <Dato label="Precio efectivo" value={formatARS(servicio.precio_efectivo)} />
          <Dato
            label="Duración"
            value={servicio.duracion_min ? `${servicio.duracion_min} min` : "—"}
          />
          <Dato label="Estado" value={servicio.activo ? "Activo" : "Inactivo"} />
        </dl>
      )}

      <section className="space-y-3 border-t border-border pt-6">
        <div className="space-y-1">
          <h2 className="font-display text-xl tracking-[0.15em] uppercase">
            Disponibilidad
          </h2>
          <p className="text-xs text-muted-foreground">
            Días y franjas en que se puede reservar este servicio online. Si no
            cargás ninguna, queda disponible en todo el horario de la sucursal.
          </p>
        </div>

        {horarios.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            Sin restricción: disponible siempre que la sucursal esté abierta.
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
            {horarios.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span>
                  <span className="font-medium">{DIA_LABEL[h.dia_semana]}</span>
                  <span className="ml-2 tabular-nums text-muted-foreground">
                    {h.apertura} – {h.cierre}
                  </span>
                </span>
                <form action={delHorario}>
                  <input type="hidden" name="id" value={h.id} />
                  <button
                    type="submit"
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    aria-label="Quitar franja"
                  >
                    <Trash2 className="h-4 w-4 stroke-[1.5]" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form
          action={addHorario}
          className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-4"
        >
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Día
            </label>
            <select
              name="dia_semana"
              required
              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              {DIAS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Desde
            </label>
            <input
              type="time"
              name="apertura"
              required
              defaultValue="10:00"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Hasta
            </label>
            <input
              type="time"
              name="cierre"
              required
              defaultValue="18:00"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
          >
            Agregar franja
          </button>
        </form>
      </section>

      {puedeEditar && (
        <div className="border-t border-border pt-6">
          <form action={toggle}>
            <button
              type="submit"
              className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              {servicio.activo ? "Marcar inactivo" : "Reactivar"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
