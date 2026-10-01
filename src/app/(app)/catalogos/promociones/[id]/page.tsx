import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Trash2 } from "lucide-react";
import { PromocionForm } from "@/components/forms/promocion-form";
import {
  getPromocion,
  togglePromocionActiva,
  updatePromocion,
} from "@/lib/data/promociones";
import { listServicios } from "@/lib/data/servicios";
import {
  addServicioHorario,
  deleteServicioHorario,
  listServicioHorarios,
} from "@/lib/data/servicios-horarios";
import { requireUser } from "@/lib/auth/session";
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

export default async function EditarPromocionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!esAdmin(user.rol)) redirect("/catalogos/promociones");

  const { id } = await params;
  const [promocion, servicios, horarios] = await Promise.all([
    getPromocion(id),
    listServicios(),
    listServicioHorarios(id),
  ]);
  if (!promocion) notFound();

  async function update(_prev: unknown, formData: FormData) {
    "use server";
    return await updatePromocion(id, formData);
  }

  async function toggle() {
    "use server";
    await togglePromocionActiva(id);
  }

  async function addHorario(formData: FormData) {
    "use server";
    await addServicioHorario(id, formData);
    revalidatePath(`/catalogos/promociones/${id}`);
  }

  async function delHorario(formData: FormData) {
    "use server";
    await deleteServicioHorario(String(formData.get("id") ?? ""));
    revalidatePath(`/catalogos/promociones/${id}`);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Editar promoción
        </h1>
        <p className="text-sm text-muted-foreground">{promocion.nombre}</p>
      </header>

      <PromocionForm
        promocion={promocion}
        servicios={servicios}
        action={update}
        submitLabel="Guardar"
      />

      <section className="space-y-3 border-t border-border pt-6">
        <div className="space-y-1">
          <h2 className="font-display text-xl tracking-[0.15em] uppercase">
            Franja horaria
          </h2>
          <p className="text-xs text-muted-foreground">
            Días y horarios de validez de la promo. En reservas online limita los
            turnos disponibles; en ventas solo muestra una advertencia fuera de
            franja. Sin franjas = válida siempre.
          </p>
        </div>

        {horarios.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            Sin restricción horaria.
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

      <div className="border-t border-border pt-6">
        <form action={toggle}>
          <button
            type="submit"
            className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {promocion.activo ? "Marcar inactiva" : "Reactivar"}
          </button>
        </form>
      </div>
    </div>
  );
}
