import Link from "next/link";
import { Trash2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AnticiposPanel } from "@/components/anticipos-panel";
import { ServiciosProfesionalForm } from "@/components/forms/servicios-profesional-form";
import { ViaticosPanel } from "@/components/viaticos-panel";
import { EmpleadoForm } from "@/components/forms/empleado-form";
import { AccesoEmpleadoPanel } from "@/components/forms/acceso-empleado-panel";
import { buildAccessScope } from "@/lib/auth/access";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { listAnticipos } from "@/lib/data/anticipos";
import { listViaticos } from "@/lib/data/viaticos";
import {
  crearAccesoEmpleado,
  getAccesoDeEmpleado,
  getEmpleado,
  toggleEmpleadoActivo,
  updateEmpleado,
} from "@/lib/data/empleados";
import { listMediosPago } from "@/lib/data/medios-pago";
import {
  addProfesionalHorario,
  deleteProfesionalHorario,
  listProfesionalAgendaConfigsByEmpleado,
  listProfesionalHorarios,
} from "@/lib/data/profesionales-horarios";
import {
  listProfesionalServicios,
  listServiciosPublicosElegibles,
  replaceProfesionalServicios,
} from "@/lib/data/profesionales-servicios";
import {
  createProfesionalAgenda,
  toggleProfesionalAgendaActivo,
} from "@/lib/data/profesionales-agenda";
import { listSucursales } from "@/lib/data/sucursales";
import { aMinutos, horasSemanales } from "@/lib/horas-franjas";
import { SubmitButton } from "@/components/forms/field";

const ROL_LABEL: Record<string, string> = {
  empleado: "Empleado",
  encargada: "Encargada",
  admin: "Admin",
};

const DIAS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

/** "8 hs", "7,5 hs" — sin decimales cuando no hacen falta. */
function fmtHoras(h: number): string {
  const txt = Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0$/, "");
  return `${txt.replace(".", ",")} hs`;
}

const DIA_LABEL: Record<number, string> = Object.fromEntries(
  DIAS.map((dia) => [dia.value, dia.label]),
);

export default async function EditarEmpleadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (user.rol !== "admin" && user.rol !== "superadmin") {
    redirect("/catalogos/empleados");
  }

  const { id } = await params;
  const empleado = await getEmpleado(id);
  if (!empleado) notFound();

  const scope = buildAccessScope(user);
  const sucursalesAll = await listSucursales();
  const sucursales = sucursalesAll.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );
  const sucursal = await getActiveSucursal();

  const [anticipos, viaticos, mediosPago, acceso, agendas] = await Promise.all([
    listAnticipos(id),
    listViaticos({ empleadoId: id }),
    sucursal
      ? listMediosPago({ sucursalId: sucursal.id, soloActivos: true, excluirGiftCard: true })
      : Promise.resolve([]),
    getAccesoDeEmpleado(id),
    listProfesionalAgendaConfigsByEmpleado(id, {
      sucursalIds: sucursales.map((item) => item.id),
    }),
  ]);
  // Los servicios elegibles se filtran por la sucursal de cada agenda
  // (membresía servicio_sucursal): un profesional solo ve los servicios
  // habilitados en su sucursal, no los de otras.
  const agendasConHorarios = await Promise.all(
    agendas.map(async (agenda) => ({
      agenda,
      horarios: await listProfesionalHorarios(
        agenda.empleado_id,
        agenda.sucursal_id,
      ),
      servicios: await listProfesionalServicios(
        agenda.empleado_id,
        agenda.sucursal_id,
      ),
      serviciosPublicos: await listServiciosPublicosElegibles(
        agenda.sucursal_id,
      ),
    })),
  );

  const rolesPermitidos =
    user.rol === "superadmin"
      ? ["empleado", "encargada", "admin"]
      : ["empleado", "encargada"];
  const rolesDisponibles = rolesPermitidos.map((value) => ({
    value,
    label: ROL_LABEL[value] ?? value,
  }));

  async function update(_prev: unknown, formData: FormData) {
    "use server";
    return await updateEmpleado(id, formData);
  }
  async function toggle() {
    "use server";
    await toggleEmpleadoActivo(id);
  }
  async function crearAcceso(_prev: unknown, formData: FormData) {
    "use server";
    return await crearAccesoEmpleado(id, formData);
  }
  async function habilitarProfesional(formData: FormData) {
    "use server";
    await createProfesionalAgenda(id, formData);
  }
  async function toggleAgenda(formData: FormData) {
    "use server";
    await toggleProfesionalAgendaActivo(String(formData.get("agenda_id") ?? ""));
  }

  // Sucursales (permitidas) donde el empleado todavía no está habilitado como
  // profesional, para ofrecerlas en el alta de agenda.
  const sucursalesConAgenda = new Set(
    agendasConHorarios.map(({ agenda }) => agenda.sucursal_id),
  );
  const sucursalesParaHabilitar = sucursales.filter(
    (s) => !sucursalesConAgenda.has(s.id),
  );

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Editar empleado
        </h1>
        <p className="text-sm text-muted-foreground">{empleado.nombre}</p>
      </header>
      <EmpleadoForm
        empleado={empleado}
        sucursales={sucursales}
        action={update}
        submitLabel="Guardar"
      />

      <AccesoEmpleadoPanel
        acceso={acceso}
        rolesDisponibles={rolesDisponibles}
        action={crearAcceso}
      />

      <DisponibilidadPublicaPanel
        agendas={agendasConHorarios}
        sucursalesParaHabilitar={sucursalesParaHabilitar}
        habilitarProfesional={habilitarProfesional}
        toggleAgenda={toggleAgenda}
      />

      <AnticiposPanel
        empleadoId={empleado.id}
        anticipos={anticipos}
        mediosPago={mediosPago}
      />

      <ViaticosPanel
        empleadoId={empleado.id}
        empleadoNombre={empleado.nombre}
        viaticos={viaticos}
        mediosPago={mediosPago}
      />

      <div className="border-t border-border pt-6">
        <form action={toggle}>
          <button
            type="submit"
            className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {empleado.activo ? "Marcar inactivo" : "Reactivar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function DisponibilidadPublicaPanel({
  agendas,
  sucursalesParaHabilitar,
  habilitarProfesional,
  toggleAgenda,
}: {
  agendas: Array<{
    agenda: {
      id: string;
      sucursal_nombre: string;
      especialidad: string;
      activo_publico: boolean;
      avatar_url: string;
      color: string;
    };
    horarios: Array<{
      id: string;
      dia_semana: number;
        apertura: string;
        cierre: string;
      }>;
      servicios: Array<{ servicio_id: string }>;
      serviciosPublicos: Array<{ id: string; nombre: string; rubro: string }>;
    }>;
  sucursalesParaHabilitar: Array<{ id: string; nombre: string }>;
  habilitarProfesional: (formData: FormData) => Promise<void>;
  toggleAgenda: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="space-y-4 rounded-md border border-border bg-card p-5">
      <div className="space-y-1">
        <h2 className="font-display text-xl tracking-[0.15em] uppercase">
          Disponibilidad pública
        </h2>
        <p className="text-xs text-muted-foreground">
          El horario semanal de cada sucursal se usa para <strong>dos cosas</strong>:
          qué turnos se ofrecen en la reserva online, y cuántas horas se proponen
          al liquidarle el sueldo. Cargalo con la jornada real.
        </p>
        <p className="text-xs text-muted-foreground">
          <strong>Se carga una sola vez y queda.</strong> Semana a semana no hay
          que volver a cargar nada: el total de acá abajo es el que se propone
          al liquidar, y sólo se toca cuando le cambia la jornada.
        </p>
        <p className="text-xs text-muted-foreground">
          Si no hay franjas, la reserva ofrece todo el horario de la sucursal y
          las horas de la liquidación se calculan con la jornada de la ficha.
        </p>
      </div>

      {agendas.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          Sin configuración de agenda pública visible para este empleado.
        </div>
      ) : (
        <div className="space-y-4">
          {agendas.map(({ agenda, horarios, servicios, serviciosPublicos }) => (
            <div
              key={agenda.id}
              className="space-y-4 rounded-md border border-border p-4"
            >
              {(() => {
                const serviciosAsignadosIds = new Set(
                  servicios.map((item) => item.servicio_id),
                );
                return (
                  <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {/* La foto que ve la clienta al reservar. Se sube en la vista
                      completa; se muestra acá porque si no, nadie encuentra
                      dónde se carga. */}
                  <Link
                    href={`/turnos/profesionales/${agenda.id}`}
                    className="shrink-0"
                    title={
                      agenda.avatar_url
                        ? "Cambiar la foto de perfil"
                        : "Subir la foto de perfil"
                    }
                  >
                    {agenda.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={agenda.avatar_url}
                        alt=""
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className="flex h-12 w-12 items-center justify-center rounded-full text-[10px] font-medium uppercase tracking-wider text-white"
                        style={{ backgroundColor: agenda.color }}
                      >
                        Foto
                      </span>
                    )}
                  </Link>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{agenda.sucursal_nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {agenda.especialidad} ·{" "}
                      {agenda.activo_publico ? "Visible en reserva" : "Oculta en reserva"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {agenda.avatar_url ? (
                        <>La clienta ve esta foto al reservar.</>
                      ) : (
                        <>Sin foto: al reservar se muestra sólo su color.</>
                      )}{" "}
                      <Link
                        href={`/turnos/profesionales/${agenda.id}`}
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        {agenda.avatar_url ? "Cambiarla" : "Subir una foto"}
                      </Link>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <form action={toggleAgenda}>
                    <input type="hidden" name="agenda_id" value={agenda.id} />
                    <SubmitButton className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
                      {agenda.activo_publico
                        ? "Ocultar de reserva"
                        : "Mostrar en reserva"}
                    </SubmitButton>
                  </form>
                  <Link
                    href={`/turnos/profesionales/${agenda.id}`}
                    className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    Abrir vista completa
                  </Link>
                </div>
              </div>

              <ServiciosProfesionalForm
                agendaId={agenda.id}
                servicios={serviciosPublicos}
                asignados={[...serviciosAsignadosIds]}
                guardar={replaceProfesionalServicios}
              />

              {horarios.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                  Sin restricción adicional para esta sucursal.
                </div>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                  {horarios.map((horario) => (
                    <li
                      key={horario.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <span>
                        <span className="font-medium">
                          {DIA_LABEL[horario.dia_semana]}
                        </span>
                        <span className="ml-2 tabular-nums text-muted-foreground">
                          {horario.apertura} - {horario.cierre}
                        </span>
                        <span className="ml-2 tabular-nums text-xs text-muted-foreground">
                          ({fmtHoras(
                            Math.max(
                              0,
                              aMinutos(horario.cierre) - aMinutos(horario.apertura),
                            ) / 60,
                          )})
                        </span>
                      </span>
                      <form
                        action={async (formData) => {
                          "use server";
                          await deleteProfesionalHorario(
                            agenda.id,
                            String(formData.get("id") ?? ""),
                          );
                        }}
                      >
                        <input type="hidden" name="id" value={horario.id} />
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
                  {/* El total sale de la misma función con la que se liquida:
                      sirve como verificación de lo que se va a pagar, no como
                      un número decorativo aparte. */}
                  <li className="flex items-center justify-between gap-3 bg-cream/40 px-4 py-2.5 text-sm font-medium">
                    <span>Total semanal</span>
                    <span className="tabular-nums">
                      {fmtHoras(
                        horasSemanales(
                          horarios.map((h) => ({
                            diaSemana: h.dia_semana,
                            apertura: h.apertura,
                            cierre: h.cierre,
                          })),
                        ),
                      )}
                    </span>
                  </li>
                </ul>
              )}

              <form
                action={async (formData) => {
                  "use server";
                  await addProfesionalHorario(agenda.id, formData);
                }}
                className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-cream/20 p-4"
              >
                <label className="space-y-1.5 text-sm">
                  <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Día
                  </span>
                  <select
                    name="dia_semana"
                    required
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    {DIAS.map((dia) => (
                      <option key={dia.value} value={dia.value}>
                        {dia.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Desde
                  </span>
                  <input
                    type="time"
                    name="apertura"
                    required
                    defaultValue="10:00"
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Hasta
                  </span>
                  <input
                    type="time"
                    name="cierre"
                    required
                    defaultValue="18:00"
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
                >
                  Agregar franja
                </button>
              </form>
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {sucursalesParaHabilitar.length > 0 && (
        <form
          action={habilitarProfesional}
          className="flex flex-wrap items-end gap-3 rounded-md border border-dashed border-border bg-cream/20 p-4"
        >
          <div className="w-full">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Habilitar como profesional
            </p>
            <p className="text-xs text-muted-foreground">
              Crea la agenda del empleado en una sucursal para que aparezca al
              reservar online. Luego asignás servicios y franjas.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <strong>Prioridad</strong> es el orden en la reserva online: el
              número más chico aparece primero en la lista de profesionales, y
              es a quien se le asigna el turno cuando la clienta elige “sin
              preferencia”. Si dos tienen el mismo número, ordena por nombre.
            </p>
          </div>
          <label className="space-y-1.5 text-sm">
            <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Sucursal
            </span>
            <select
              name="sucursal_id"
              required
              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              {sucursalesParaHabilitar.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Especialidad
            </span>
            <input
              name="especialidad"
              required
              placeholder="Ej: Manicura, Estilista"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Color
            </span>
            <input
              type="color"
              name="color"
              defaultValue="#8a9a5b"
              className="h-10 w-16 rounded-md border border-border bg-card p-1"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Prioridad
            </span>
            <input
              type="number"
              name="prioridad"
              min={0}
              defaultValue={0}
              title="Orden en la reserva online: el número más chico aparece primero, y es a quien se le asigna el turno cuando la clienta elige “sin preferencia”. Empatados, ordena por nombre."
              className="w-24 rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <SubmitButton
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
            pendingLabel="Habilitando..."
          >
            Habilitar
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
