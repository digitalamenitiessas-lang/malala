"use client";

import Image from "next/image";
import { useActionState, useDeferredValue, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock3,
  Search,
  WandSparkles,
  X,
} from "lucide-react";
import { createPublicTurnoAction } from "@/lib/data/turnos-actions";
import {
  buildAvailableSlots,
  filterProfesionalesByServicio,
  listOpenDatesForSucursal,
  listReservableDates,
  type ProfesionalReserva,
} from "@/lib/turnos-helpers";
import { HeroExperiencia } from "@/components/booking/hero-experiencia";
import { PromocionesBand } from "@/components/booking/promociones-band";
import { ServiciosShowcase } from "@/components/booking/servicios-showcase";
import { SucursalesShowcase } from "@/components/booking/sucursales-showcase";
import { cn, formatARS } from "@/lib/utils";
import { RESERVAS_PROPIAS, RESERVA_EXTERNA_POR_SUCURSAL } from "@/lib/features";
import type {
  HorarioSucursal,
  ProfesionalHorario,
  ProfesionalServicio,
  Servicio,
  ServicioHorario,
  Sucursal,
  TurnoOcupacion,
} from "@/lib/types";

interface Props {
  snapshot: {
    sucursales: Sucursal[];
    servicios: Servicio[];
    horarios: HorarioSucursal[];
    profesionales: ProfesionalReserva[];
    turnos: TurnoOcupacion[];
    serviciosHorarios: ServicioHorario[];
    profesionalesHorarios: ProfesionalHorario[];
    profesionalesServicios: ProfesionalServicio[];
    serviciosSucursales: { servicio_id: string; sucursal_id: string }[];
  };
  loggedInLabel?: string;
}

type ActionState =
  | {
      ok: true;
      turnoId: string;
      message: string;
      fecha_turno?: string;
      hora?: string;
      servicio_nombre?: string;
      profesional_nombre?: string;
    }
  | { ok: false; errors: Record<string, string[]> }
  | null;

const initialActionState: ActionState = null;
const storeUrl = "https://malala.ar/";
const whatsappUrl =
  "https://api.whatsapp.com/send/?phone=5493812393260&text&type=phone_number&app_absent=0";

const TOTAL_STEPS = 7;

export function BookingExperience({ snapshot, loggedInLabel }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createPublicTurnoAction,
    initialActionState,
  );
  const [modalOpen, setModalOpen] = useState(false);
  // Con la reserva propia apagada, "Reservá tu turno" lleva a Calendico. Si no
  // se sabe la sucursal, primero se pregunta cuál.
  const [elegirSucursalOpen, setElegirSucursalOpen] = useState(false);
  const [bookingSucursalId, setBookingSucursalId] = useState("");
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("TODOS");
  const [servicioId, setServicioId] = useState("");
  const [profesionalId, setProfesionalId] = useState("");
  const [fechaTurno, setFechaTurno] = useState("");
  const [slotKey, setSlotKey] = useState("");
  const deferredSearch = useDeferredValue(search);

  const bookingSucursal =
    snapshot.sucursales.find((item) => item.id === bookingSucursalId) ?? null;

  // Aislamiento por sucursal: cada servicio se ofrece solo en las sucursales
  // donde está habilitado (membresía servicio_sucursal). Sin sucursal elegida
  // aún, no mostramos servicios.
  const serviciosDeSucursal = useMemo(() => {
    if (!bookingSucursalId) return [];
    const habilitados = new Set(
      snapshot.serviciosSucursales
        .filter((m) => m.sucursal_id === bookingSucursalId)
        .map((m) => m.servicio_id),
    );
    return snapshot.servicios.filter((item) => habilitados.has(item.id));
  }, [bookingSucursalId, snapshot.servicios, snapshot.serviciosSucursales]);

  const categorias = useMemo(
    () => ["TODOS", ...new Set(serviciosDeSucursal.map((item) => item.rubro))],
    [serviciosDeSucursal],
  );

  // Los tiles de la landing preseleccionan un rubro antes de elegir sucursal, y
  // ese rubro puede no existir en la sucursal que el cliente termine eligiendo.
  // En ese caso caemos a TODOS en vez de mostrar un catálogo vacío.
  const categoriaEfectiva = categorias.includes(categoria) ? categoria : "TODOS";

  const servicios = useMemo(
    () =>
      serviciosDeSucursal.filter((item) => {
        const matchesCategory =
          categoriaEfectiva === "TODOS" || item.rubro === categoriaEfectiva;
        const term = deferredSearch.trim().toLowerCase();
        const matchesText =
          term.length === 0 ||
          item.nombre.toLowerCase().includes(term) ||
          item.rubro.toLowerCase().includes(term) ||
          item.descripcion_corta?.toLowerCase().includes(term);
        return matchesCategory && matchesText;
      }),
    [categoriaEfectiva, deferredSearch, serviciosDeSucursal],
  );

  const profesionales = useMemo(
    () => {
      if (!bookingSucursalId) return [];
      if (!servicioId) {
        return snapshot.profesionales.filter(
          (item) => item.sucursal_id === bookingSucursalId,
        );
      }
      return filterProfesionalesByServicio({
        sucursalId: bookingSucursalId,
        servicioId,
        profesionales: snapshot.profesionales,
        servicios: snapshot.servicios,
        profesionalesServicios: snapshot.profesionalesServicios,
      });
    },
    [
      bookingSucursalId,
      servicioId,
      snapshot.profesionales,
      snapshot.profesionalesServicios,
      snapshot.servicios,
    ],
  );

  const servicioSeleccionado = useMemo(
    () => snapshot.servicios.find((item) => item.id === servicioId) ?? null,
    [servicioId, snapshot.servicios],
  );

  const profesionalSeleccionado =
    profesionales.find((item) => item.empleado_id === profesionalId) ?? null;

  const fechasDisponibles = useMemo(
    () => {
      if (!bookingSucursalId) return [];
      const fechas =
        servicioSeleccionado && profesionalId
          ? listReservableDates({
              count: 6,
              sucursalId: bookingSucursalId,
              servicioId: servicioSeleccionado.id,
              profesionalId: profesionalId === "any" ? undefined : profesionalId,
              horarios: snapshot.horarios,
              profesionales: snapshot.profesionales,
              servicios: snapshot.servicios,
              turnos: snapshot.turnos,
              serviciosHorarios: snapshot.serviciosHorarios,
              profesionalesHorarios: snapshot.profesionalesHorarios,
              profesionalesServicios: snapshot.profesionalesServicios,
            })
          : listOpenDatesForSucursal(snapshot.horarios, bookingSucursalId, 6);
      // Una promo no se puede reservar para una fecha posterior a su vencimiento.
      const vence = servicioSeleccionado?.es_promo
        ? servicioSeleccionado.vence_el
        : undefined;
      return vence ? fechas.filter((f) => f <= vence) : fechas;
    },
    [
      bookingSucursalId,
      profesionalId,
      servicioSeleccionado,
      snapshot.horarios,
      snapshot.profesionales,
      snapshot.profesionalesHorarios,
      snapshot.profesionalesServicios,
      snapshot.servicios,
      snapshot.serviciosHorarios,
      snapshot.turnos,
    ],
  );

  const slots = useMemo(() => {
    if (!servicioSeleccionado || !fechaTurno || !profesionalId || !bookingSucursalId) {
      return [];
    }

    return buildAvailableSlots({
      fecha: fechaTurno,
      sucursalId: bookingSucursalId,
      servicioId: servicioSeleccionado.id,
      profesionalId: profesionalId === "any" ? undefined : profesionalId,
      horarios: snapshot.horarios,
      profesionales: snapshot.profesionales,
      servicios: snapshot.servicios,
      turnos: snapshot.turnos,
      serviciosHorarios: snapshot.serviciosHorarios,
      profesionalesHorarios: snapshot.profesionalesHorarios,
      profesionalesServicios: snapshot.profesionalesServicios,
    });
  }, [
    bookingSucursalId,
    fechaTurno,
    profesionalId,
    servicioSeleccionado,
    snapshot.horarios,
    snapshot.profesionalesHorarios,
    snapshot.profesionalesServicios,
    snapshot.serviciosHorarios,
    snapshot.profesionales,
    snapshot.servicios,
    snapshot.turnos,
  ]);

  const selectedSlot =
    slots.find((item) => `${item.profesional_id}-${item.hora}` === slotKey) ?? null;

  const currentStep = state?.ok
    ? 7
    : !bookingSucursalId
      ? 1
      : !servicioId
        ? 2
        : !profesionalId
          ? 3
          : !fechaTurno
            ? 4
            : !selectedSlot
              ? 5
              : 6;

  const currentStepMeta = getStepMeta(currentStep);

  function resetBooking(keepSucursal = false) {
    setSearch("");
    setCategoria("TODOS");
    setServicioId("");
    setProfesionalId("");
    setFechaTurno("");
    setSlotKey("");
    if (!keepSucursal) {
      setBookingSucursalId("");
    }
  }

  function openBooking(nextSucursalId?: string, nextServicioId?: string) {
    if (!RESERVAS_PROPIAS) {
      const link = nextSucursalId ? RESERVA_EXTERNA_POR_SUCURSAL[nextSucursalId] : undefined;
      if (link) window.open(link, "_blank", "noopener,noreferrer");
      else setElegirSucursalOpen(true);
      return;
    }
    if (nextSucursalId) {
      setBookingSucursalId(nextSucursalId);
      resetBooking(true);
      setBookingSucursalId(nextSucursalId);
    }
    if (nextServicioId) {
      setServicioId(nextServicioId);
      setProfesionalId("");
      setFechaTurno("");
      setSlotKey("");
    }
    setModalOpen(true);
  }

  /** Un tile de la sección Servicios: abre la reserva con el rubro precargado. */
  function openBookingConRubro(rubro: string | null) {
    if (!RESERVAS_PROPIAS) {
      setElegirSucursalOpen(true);
      return;
    }
    setCategoria(rubro ?? "TODOS");
    setModalOpen(true);
  }

  function closeBooking() {
    setModalOpen(false);
  }

  function handleSucursalChange(nextSucursalId: string) {
    setBookingSucursalId(nextSucursalId);
    setServicioId("");
    setProfesionalId("");
    setFechaTurno("");
    setSlotKey("");
  }

  function handleServicioChange(nextServicioId: string) {
    setServicioId(nextServicioId);
    setProfesionalId("");
    setFechaTurno("");
    setSlotKey("");
  }

  function handleProfesionalChange(nextProfesionalId: string) {
    setProfesionalId(nextProfesionalId);
    setFechaTurno("");
    setSlotKey("");
  }

  function handleFechaChange(nextFecha: string) {
    setFechaTurno(nextFecha);
    setSlotKey("");
  }

  function goBack() {
    if (state?.ok) return;
    if (currentStep === 6) {
      setSlotKey("");
      return;
    }
    if (currentStep === 5) {
      setFechaTurno("");
      return;
    }
    if (currentStep === 4) {
      setProfesionalId("");
      return;
    }
    if (currentStep === 3) {
      setServicioId("");
      return;
    }
    if (currentStep === 2) {
      setBookingSucursalId("");
    }
  }

  const totalServicios = snapshot.servicios.length;

  return (
    <div className="min-h-screen bg-sand text-foreground">
      <header className="sticky top-0 z-40 border-b border-stone-100 bg-sand/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <a href="#" className="flex items-center">
            <Image
              src="/landing/logo-wordmark.png"
              alt="MALALA Hair and Nails"
              width={1045}
              height={219}
              priority
              className="h-7 w-auto sm:h-9"
            />
          </a>

          <nav className="hidden items-center gap-8 text-[0.68rem] uppercase tracking-[0.22em] text-stone-700 md:flex">
            <a href="#servicios" className="transition hover:text-ink">
              Servicios
            </a>
            <a href="#sucursales" className="transition hover:text-ink">
              Sucursales
            </a>
            <a href="#contacto" className="transition hover:text-ink">
              Contacto
            </a>
          </nav>

          <button
            type="button"
            onClick={() => openBooking()}
            className="shrink-0 rounded-lg bg-ink px-5 py-3 text-[0.62rem] font-medium uppercase tracking-[0.18em] text-white transition hover:bg-brown-500"
          >
            Reserva tu turno
          </button>
        </div>
      </header>

      <main>
        <HeroExperiencia
          onReserve={() => openBooking()}
          whatsappUrl={whatsappUrl}
          totalServicios={totalServicios}
        />

        <SucursalesShowcase
          sucursales={snapshot.sucursales}
          onReserve={(sucursalId) => openBooking(sucursalId)}
        />

        <ServiciosShowcase
          servicios={snapshot.servicios}
          onSelectRubro={openBookingConRubro}
        />

        <PromocionesBand />
      </main>

      <footer id="contacto" className="bg-ink text-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
          <div className="grid gap-10 md:grid-cols-[1fr_1fr]">
            <div>
              <Image
                src="/landing/logo-wordmark-light.png"
                alt="MALALA Hair and Nails"
                width={1045}
                height={219}
                className="h-9 w-auto"
              />
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[0.68rem] uppercase tracking-[0.2em] text-white/80">
                <a href={storeUrl} target="_blank" rel="noreferrer" className="transition hover:text-white">
                  Tienda online
                </a>
                <a href={whatsappUrl} target="_blank" rel="noreferrer" className="transition hover:text-white">
                  WhatsApp
                </a>
                <a href={loggedInLabel ? "/dashboard" : "/dev/login"} className="transition hover:text-white">
                  {loggedInLabel ?? "Acceso interno"}
                </a>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {snapshot.sucursales.map((item) => (
                <div key={item.id} className="space-y-2">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em]">
                    {item.nombre}
                  </p>
                  {item.direccion ? (
                    <p className="text-xs leading-5 text-white/70">{item.direccion}</p>
                  ) : null}
                  {item.telefono ? (
                    <p className="text-xs text-white/70">{item.telefono}</p>
                  ) : null}
                  {item.horario_resumen ? (
                    <p className="text-xs leading-5 text-white/50">{item.horario_resumen}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {modalOpen ? (
        <BookingModal
          currentStep={currentStep}
          currentStepMeta={currentStepMeta}
          state={state}
          pending={pending}
          formAction={formAction}
          sucursales={snapshot.sucursales}
          sucursalId={bookingSucursalId}
          onSucursalChange={handleSucursalChange}
          categorias={categorias}
          categoria={categoriaEfectiva}
          onCategoriaChange={setCategoria}
          search={search}
          onSearchChange={setSearch}
          servicios={servicios}
          servicioId={servicioId}
          onServicioChange={handleServicioChange}
          profesionales={profesionales}
          profesionalId={profesionalId}
          onProfesionalChange={handleProfesionalChange}
          fechasDisponibles={fechasDisponibles}
          fechaTurno={fechaTurno}
          onFechaChange={handleFechaChange}
          slotKey={slotKey}
          onSlotChange={setSlotKey}
          slots={slots}
          selectedSlot={selectedSlot}
          sucursal={bookingSucursal}
          servicio={servicioSeleccionado}
          profesional={profesionalSeleccionado}
          onClose={closeBooking}
          onBack={goBack}
          onResetStep={(step) => {
            if (step <= 1) {
              setBookingSucursalId("");
              resetBooking();
              return;
            }
            if (step === 2) {
              setServicioId("");
              setProfesionalId("");
              setFechaTurno("");
              setSlotKey("");
              return;
            }
            if (step === 3) {
              setProfesionalId("");
              setFechaTurno("");
              setSlotKey("");
              return;
            }
            if (step === 4) {
              setFechaTurno("");
              setSlotKey("");
              return;
            }
            if (step === 5) {
              setSlotKey("");
            }
          }}
        />
      ) : null}

      {elegirSucursalOpen ? (
        <ElegirSucursalExterna
          sucursales={snapshot.sucursales}
          onClose={() => setElegirSucursalOpen(false)}
        />
      ) : null}

      {!modalOpen && !elegirSucursalOpen ? (
        <button
          type="button"
          onClick={() => openBooking()}
          className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-center rounded-lg bg-ink px-5 py-3 text-[0.68rem] font-medium uppercase tracking-[0.2em] text-white shadow-[0_18px_40px_rgba(43,34,26,0.35)] transition hover:bg-brown-500 lg:hidden"
        >
          Reserva tu turno
        </button>
      ) : null}
    </div>
  );
}
/**
 * Con la reserva propia apagada: elegir la sucursal y seguir en su Calendico.
 */
function ElegirSucursalExterna({
  sucursales,
  onClose,
}: {
  sucursales: Sucursal[];
  onClose: () => void;
}) {
  const conLink = sucursales.filter((s) => RESERVA_EXTERNA_POR_SUCURSAL[s.id]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Elegí la sucursal"
        className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-[0_30px_90px_rgba(43,34,26,0.28)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-[0.7rem] uppercase tracking-[0.3em] text-brown-500">
              Reserva tu turno
            </p>
            <p className="mt-1.5 text-sm font-medium text-ink">¿En qué sucursal?</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg border border-stone-200 p-2 text-stone-600 transition hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 grid gap-3">
          {conLink.map((s) => (
            <a
              key={s.id}
              href={RESERVA_EXTERNA_POR_SUCURSAL[s.id]}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-4 py-3 transition hover:border-sage-500"
            >
              <span>
                <span className="block text-sm font-medium text-ink">{s.nombre}</span>
                {s.direccion ? (
                  <span className="block text-xs text-stone-500">{s.direccion}</span>
                ) : null}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-stone-500" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

interface BookingModalProps {
  currentStep: number;
  currentStepMeta: { title: string; text: string };
  state: ActionState;
  pending: boolean;
  formAction: (payload: FormData) => void;
  sucursales: Sucursal[];
  sucursalId: string;
  onSucursalChange: (value: string) => void;
  categorias: string[];
  categoria: string;
  onCategoriaChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  servicios: Servicio[];
  servicioId: string;
  onServicioChange: (value: string) => void;
  profesionales: ProfesionalReserva[];
  profesionalId: string;
  onProfesionalChange: (value: string) => void;
  fechasDisponibles: string[];
  fechaTurno: string;
  onFechaChange: (value: string) => void;
  slotKey: string;
  onSlotChange: (value: string) => void;
  slots: ReturnType<typeof buildAvailableSlots>;
  selectedSlot: ReturnType<typeof buildAvailableSlots>[number] | null;
  sucursal: Sucursal | null;
  servicio: Servicio | null;
  profesional: ProfesionalReserva | null;
  onClose: () => void;
  onBack: () => void;
  onResetStep: (step: number) => void;
}

function BookingModal({
  currentStep,
  currentStepMeta,
  state,
  pending,
  formAction,
  sucursales,
  sucursalId,
  onSucursalChange,
  categorias,
  categoria,
  onCategoriaChange,
  search,
  onSearchChange,
  servicios,
  servicioId,
  onServicioChange,
  profesionales,
  profesionalId,
  onProfesionalChange,
  fechasDisponibles,
  fechaTurno,
  onFechaChange,
  slotKey,
  onSlotChange,
  slots,
  selectedSlot,
  sucursal,
  servicio,
  profesional,
  onClose,
  onBack,
  onResetStep,
}: BookingModalProps) {
  const progress = Math.min((currentStep / TOTAL_STEPS) * 100, 100);
  const canGoBack = currentStep > 1 && !state?.ok;
  const canSubmit = Boolean(selectedSlot);
  const showReview = currentStep >= 6 || Boolean(state?.ok);

  return (
    <div className="fixed inset-0 z-50 bg-ink/55 backdrop-blur-[2px]">
      <div className="absolute inset-x-0 bottom-0 top-8 overflow-hidden rounded-t-2xl bg-white shadow-[0_30px_90px_rgba(43,34,26,0.28)] lg:left-1/2 lg:top-1/2 lg:h-[min(920px,94vh)] lg:w-[min(920px,94vw)] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl">
        <div className="flex h-full flex-col overflow-hidden">
          <div className="sticky top-0 z-10 border-b border-stone-100 bg-white px-5 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-display text-[0.7rem] uppercase tracking-[0.3em] text-brown-500">
                  Reserva tu turno
                </p>
                <p className="mt-1.5 text-sm font-medium text-ink">
                  {currentStepMeta.title}
                </p>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-sand">
                  <div
                    className="h-full rounded-full bg-sage-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                {canGoBack ? (
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-[0.7rem] uppercase tracking-[0.16em] text-stone-700 transition hover:border-sage-500 hover:text-ink"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Volver
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-stone-200 bg-white p-2 text-stone-500 transition hover:border-sage-500 hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <form
            action={formAction}
            className="flex-1 overflow-y-auto"
          >
            <input type="hidden" name="sucursal_id" value={sucursalId} />
            <input type="hidden" name="servicio_id" value={servicioId} />
            <input
              type="hidden"
              name="profesional_id"
              value={
                selectedSlot?.profesional_id ??
                (profesionalId === "any" ? "" : profesionalId)
              }
            />
            <input type="hidden" name="fecha_turno" value={fechaTurno} />
            <input type="hidden" name="hora" value={selectedSlot?.hora ?? ""} />
            <input
              type="hidden"
              name="sin_preferencia"
              value={String(profesionalId === "any")}
            />
            <input type="hidden" name="canal" value="web" />
            <input type="hidden" name="origen" value="publico" />

            <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-5 sm:p-6 lg:px-8 lg:py-7">
              {state?.ok ? (
                (() => {
                  // La agenda se revalida al confirmar y el slot deja de estar
                  // disponible, así que tomamos los datos del resultado del
                  // servidor (con fallback al estado del cliente).
                  const fechaConfirmada = state.fecha_turno ?? fechaTurno;
                  const horaConfirmada = state.hora ?? selectedSlot?.hora ?? "";
                  const servicioConfirmado =
                    state.servicio_nombre ?? servicio?.nombre ?? "-";
                  const profesionalConfirmado =
                    state.profesional_nombre ??
                    (profesionalId === "any"
                      ? "Sin preferencia"
                      : profesional?.empleado.nombre ?? "-");
                  const fechaHora = fechaConfirmada
                    ? `${new Date(`${fechaConfirmada}T12:00:00`).toLocaleDateString(
                        "es-AR",
                        { weekday: "short", day: "numeric", month: "short" },
                      )}${horaConfirmada ? ` · ${horaConfirmada}` : ""}`
                    : "-";
                  return (
                    <ModalStep title={currentStepMeta.title} text={currentStepMeta.text}>
                      <div className="space-y-4">
                        <div className="rounded-lg border border-sage-200 bg-sage-50 px-4 py-4 text-sm text-sage-900">
                          <p className="font-medium">{state.message}</p>
                          <p className="mt-2">
                            {sucursal?.nombre} · {servicioConfirmado} · {fechaHora} con{" "}
                            {profesionalConfirmado}
                          </p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <SummaryLine label="Sucursal" value={sucursal?.nombre ?? "-"} />
                          <SummaryLine label="Servicio" value={servicioConfirmado} />
                          <SummaryLine label="Profesional" value={profesionalConfirmado} />
                          <SummaryLine label="Fecha y hora" value={fechaHora} />
                        </div>
                      </div>
                    </ModalStep>
                  );
                })()
              ) : (
                <ModalStep title={currentStepMeta.title} text={currentStepMeta.text}>
                  {renderStepContent({
                    currentStep,
                    sucursales,
                    sucursalId,
                    onSucursalChange,
                    categorias,
                    categoria,
                    onCategoriaChange,
                    search,
                    onSearchChange,
                    servicios,
                    servicioId,
                    onServicioChange,
                    profesionales,
                    profesionalId,
                    onProfesionalChange,
                    fechasDisponibles,
                    fechaTurno,
                    onFechaChange,
                    slots,
                    slotKey,
                    onSlotChange,
                  })}
                </ModalStep>
              )}

              {showReview && !state?.ok ? (
                <section className="space-y-4 border border-stone-200 bg-sand p-5 sm:p-6">
                  <div className="space-y-2 border-b border-stone-300/60 pb-4">
                    <p className="font-display text-[0.7rem] uppercase tracking-[0.3em] text-brown-500">
                      Revisa tu reserva
                    </p>
                    <h3 className="text-2xl font-semibold text-ink">
                      {servicio?.nombre ?? "Tu reserva"}
                    </h3>
                    <p className="text-sm text-stone-700">
                      {servicio
                        ? [
                            servicio.duracion_min ? `${servicio.duracion_min} min` : null,
                            `desde ${formatARS(servicio.precio_efectivo)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "Estas a un paso de confirmar tu cita."}
                    </p>
                    {servicio?.promo_componentes &&
                    servicio.promo_componentes.length > 0 ? (
                      <p className="text-sm text-sage-800">
                        Incluye: {servicio.promo_componentes.join(" · ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <SummaryLine
                      label="Sucursal"
                      value={sucursal?.nombre ?? "Elige una sucursal"}
                      editable={Boolean(sucursalId)}
                      onEdit={() => onResetStep(1)}
                    />
                    <SummaryLine
                      label="Servicio"
                      value={servicio?.nombre ?? "Elige un servicio"}
                      editable={Boolean(servicioId)}
                      onEdit={() => onResetStep(2)}
                    />
                    <SummaryLine
                      label="Profesional"
                      value={
                        profesionalId === "any"
                          ? "Sin preferencia"
                          : profesional?.empleado.nombre ?? "Elige profesional"
                      }
                      editable={Boolean(profesionalId)}
                      onEdit={() => onResetStep(3)}
                    />
                    <SummaryLine
                      label="Fecha"
                      value={
                        fechaTurno
                          ? new Date(`${fechaTurno}T12:00:00`).toLocaleDateString(
                              "es-AR",
                              {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              },
                            )
                          : "Elige una fecha"
                      }
                      editable={Boolean(fechaTurno)}
                      onEdit={() => onResetStep(4)}
                    />
                    <SummaryLine
                      label="Horario"
                      value={
                        selectedSlot
                          ? `${selectedSlot.hora} · ${selectedSlot.profesional_nombre}`
                          : "Elige un horario"
                      }
                      editable={Boolean(selectedSlot)}
                      onEdit={() => onResetStep(5)}
                    />
                  </div>
                </section>
              ) : null}

              {state && !state.ok ? (
                <div className="border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {Object.values(state.errors).flat()[0]}
                </div>
              ) : null}

              {currentStep >= 6 && !state?.ok ? (
                <button
                  type="submit"
                  disabled={!canSubmit || pending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-4 text-[0.72rem] font-medium uppercase tracking-[0.2em] text-white transition hover:bg-brown-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? "Reservando..." : "Confirmar turno"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function renderStepContent(args: {
  currentStep: number;
  sucursales: Sucursal[];
  sucursalId: string;
  onSucursalChange: (value: string) => void;
  categorias: string[];
  categoria: string;
  onCategoriaChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  servicios: Servicio[];
  servicioId: string;
  onServicioChange: (value: string) => void;
  profesionales: ProfesionalReserva[];
  profesionalId: string;
  onProfesionalChange: (value: string) => void;
  fechasDisponibles: string[];
  fechaTurno: string;
  onFechaChange: (value: string) => void;
  slots: ReturnType<typeof buildAvailableSlots>;
  slotKey: string;
  onSlotChange: (value: string) => void;
}) {
  if (args.currentStep === 1) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {args.sucursales.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => args.onSucursalChange(item.id)}
            className={cn(
              "rounded-lg border px-4 py-4 text-left transition",
              args.sucursalId === item.id
                ? "border-sage-500 bg-sage-50"
                : "border-stone-200 bg-white hover:border-sage-500 hover:bg-sage-50/50",
            )}
          >
            <p className="text-lg font-semibold text-ink">{item.nombre}</p>
            <p className="mt-2 text-sm leading-6 text-stone-700">{item.direccion}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
              {item.horario_resumen}
            </p>
          </button>
        ))}
      </div>
    );
  }

  if (args.currentStep === 2) {
    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={args.search}
            onChange={(event) => args.onSearchChange(event.target.value)}
            placeholder="Buscar servicio..."
            className="w-full rounded-lg border border-stone-200 bg-white px-11 py-3 text-sm outline-none transition focus:border-sage-500"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {args.categorias.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => args.onCategoriaChange(item)}
              className={cn(
                "rounded-full border px-4 py-2 text-[0.72rem] uppercase tracking-[0.14em] transition",
                args.categoria === item
                  ? "border-ink bg-ink text-white"
                  : "border-stone-200 bg-white text-stone-700 hover:border-sage-500 hover:text-ink",
              )}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="grid gap-3">
          {args.servicios.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => args.onServicioChange(item.id)}
              className={cn(
                "relative overflow-hidden rounded-lg border p-4 text-left transition",
                args.servicioId === item.id
                  ? "border-sage-500 bg-sage-50 shadow-sm"
                  : "border-stone-200 bg-white hover:border-sage-500 hover:bg-sage-50/50",
              )}
            >
              {item.destacado_pct ? (
                <span className="absolute right-0 top-0 rounded-bl-lg bg-ink px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-white">
                  {item.destacado_pct}% OFF
                </span>
              ) : null}
              <div className="space-y-3">
                <div>
                  <p className="text-lg font-semibold text-ink">
                    {item.nombre}
                    {item.es_promo ? (
                      <span className="ml-2 rounded-full bg-sage-500 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white align-middle">
                        Promo
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-stone-700">
                    {item.descripcion_corta}
                  </p>
                  {item.promo_componentes && item.promo_componentes.length > 0 ? (
                    <p className="mt-1 text-sm text-sage-800">
                      Incluye: {item.promo_componentes.join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-stone-700">
                  <span className="font-semibold text-ink">
                    Desde {formatARS(item.precio_efectivo)}
                  </span>
                  <span className="line-through text-stone-400">
                    {formatARS(item.precio_lista)}
                  </span>
                  {/* Sin duración cargada no se muestra el reloj: si no, queda
                      un " min" suelto sin número. */}
                  {item.duracion_min ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-4 w-4 text-sage-700" />
                      {item.duracion_min} min
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (args.currentStep === 3) {
    if (args.profesionales.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-stone-200 bg-cream/60 px-4 py-5 text-sm text-stone-700">
          No hay profesionales configurados para este servicio en esta sucursal.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => args.onProfesionalChange("any")}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border px-4 py-4 text-left transition",
            args.profesionalId === "any"
              ? "border-sage-500 bg-sage-50"
              : "border-stone-200 bg-white hover:border-sage-500 hover:bg-sage-50/50",
          )}
        >
          <span className="inline-flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage-50 text-sage-900">
              <WandSparkles className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-medium text-ink">Sin preferencia</span>
              <span className="block text-sm text-stone-700">
                Te mostramos la mejor disponibilidad
              </span>
            </span>
          </span>
          {args.profesionalId === "any" ? (
            <Check className="h-4 w-4 text-sage-700" />
          ) : null}
        </button>

        <div className="grid gap-3 md:grid-cols-2">
          {args.profesionales.map((prof) => (
            <button
              key={prof.id}
              type="button"
              onClick={() => args.onProfesionalChange(prof.empleado_id)}
              className={cn(
                "rounded-lg border px-4 py-4 text-left transition",
                args.profesionalId === prof.empleado_id
                  ? "border-sage-500 bg-sage-50"
                  : "border-stone-200 bg-white hover:border-sage-500 hover:bg-sage-50/50",
              )}
            >
              <div className="flex items-center gap-3">
                {prof.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={prof.avatar_url}
                    alt={prof.empleado.nombre}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: prof.color }}
                  >
                    {prof.empleado.nombre
                      .split(" ")
                      .map((item) => item[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                )}
                <span>
                  <span className="block font-medium text-ink">
                    {prof.empleado.nombre}
                  </span>
                  <span className="block text-sm text-stone-700">
                    {prof.especialidad}
                  </span>
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-stone-700">{prof.bio}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (args.currentStep === 4) {
    if (args.fechasDisponibles.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-stone-200 bg-cream/60 px-4 py-5 text-sm text-stone-700">
          No hay fechas disponibles para esta selección. Si es una promoción,
          puede estar vencida. Volvé y elegí otro servicio.
        </div>
      );
    }

    return (
      <div className="grid gap-3 md:grid-cols-2">
        {args.fechasDisponibles.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => args.onFechaChange(item)}
            className={cn(
              "rounded-lg border px-4 py-4 text-left transition",
              args.fechaTurno === item
                ? "border-sage-500 bg-sage-50"
                : "border-stone-200 bg-white hover:border-sage-500 hover:bg-sage-50/50",
            )}
          >
            <span className="block text-xs uppercase tracking-[0.22em] text-muted-foreground">
              <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
              Disponible
            </span>
            <span className="mt-2 block text-sm font-medium capitalize text-ink">
              {new Date(`${item}T12:00:00`).toLocaleDateString("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
          </button>
        ))}
      </div>
    );
  }

  if (args.currentStep === 5) {
    if (args.slots.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-stone-200 bg-cream/60 px-4 py-5 text-sm text-stone-700">
          No encontramos horarios para esa combinacion. Puedes volver y cambiar
          profesional o fecha.
        </div>
      );
    }

    return (
      <div className="grid gap-2">
        {args.slots.map((slot) => (
          <button
            key={`${slot.profesional_id}-${slot.hora}`}
            type="button"
            onClick={() => args.onSlotChange(`${slot.profesional_id}-${slot.hora}`)}
            className={cn(
              "rounded-lg border px-4 py-3 text-left transition",
              args.slotKey === `${slot.profesional_id}-${slot.hora}`
                ? "border-sage-500 bg-sage-50"
                : "border-stone-200 bg-white hover:border-sage-500 hover:bg-sage-50/50",
            )}
          >
            <span className="block text-base font-medium text-ink">
              {slot.hora} con {slot.profesional_nombre}
            </span>
            <span className="text-xs text-stone-600">
              {args.profesionalId === "any"
                ? "Horario sugerido por disponibilidad"
                : "Horario disponible para tu seleccion"}
            </span>
          </button>
        ))}
      </div>
    );
  }

  if (args.currentStep === 6) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-stone-700">Nombre y apellido</span>
          <input
            name="cliente_nombre"
            required
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 outline-none focus:border-sage-500"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-stone-700">Telefono</span>
          <input
            name="cliente_telefono"
            required
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 outline-none focus:border-sage-500"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-stone-700">Email (opcional)</span>
          <input
            name="cliente_email"
            type="email"
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 outline-none focus:border-sage-500"
          />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-stone-700">Observaciones (opcional)</span>
          <textarea
            name="observacion"
            rows={3}
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 outline-none focus:border-sage-500"
          />
        </label>
      </div>
    );
  }

  return null;
}

function ModalStep({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 border border-stone-200 bg-white p-5 sm:p-6">
      <div className="space-y-1">
        <h3 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h3>
        <p className="text-sm leading-6 text-stone-700">{text}</p>
      </div>
      {children}
    </section>
  );
}

function SummaryLine({
  label,
  value,
  editable,
  onEdit,
}: {
  label: string;
  value: string;
  editable?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.7rem] uppercase tracking-[0.22em] text-stone-500">
          {label}
        </p>
        {editable && onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-sage-700 transition hover:text-brown-500"
          >
            Cambiar
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function getStepMeta(step: number) {
  switch (step) {
    case 1:
      return {
        title: "Elige la sucursal",
        text: "Selecciona la sede que te resulte mas comoda para empezar tu reserva.",
      };
    case 2:
      return {
        title: "Tu servicio",
        text: "Recorre las categorias y elige el servicio que mejor acompane tu idea.",
      };
    case 3:
      return {
        title: "Elige profesional",
        text: "Puedes elegir alguien del equipo o dejar que te sugiramos la mejor disponibilidad.",
      };
    case 4:
      return {
        title: "Elige la fecha",
        text: "Te mostramos las proximas fechas abiertas para la sucursal seleccionada.",
      };
    case 5:
      return {
        title: "Elige el horario",
        text: "Los horarios cambian segun el servicio y la disponibilidad del equipo.",
      };
    case 6:
      return {
        title: "Completa tus datos",
        text: "Ya casi terminamos. Solo necesitamos tus datos para confirmar la reserva.",
      };
    default:
      return {
        title: "Reserva confirmada",
        text: "Tu turno ya quedo registrado en la maqueta.",
      };
  }
}
