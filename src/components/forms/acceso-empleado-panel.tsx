"use client";

import { useState } from "react";
import { KeyRound, Mail, ShieldCheck, Ban, Trash2 } from "lucide-react";
import {
  useActionStateFeedback,
  useTransitionFeedback,
} from "@/components/feedback/action-feedback";
import { Field, LoadingButton, SelectField } from "./field";
import {
  cambiarEmailAcceso,
  cambiarPasswordAcceso,
  cambiarRolAcceso,
  eliminarAcceso,
  toggleAccesoActivo,
  type AccesoEmpleado,
} from "@/lib/data/empleados";
import type { ActionResult } from "@/lib/data/_helpers";

const ROL_LABEL: Record<string, string> = {
  empleado: "Empleado",
  encargada: "Encargada",
  admin: "Admin",
  superadmin: "Superadmin",
};

interface Props {
  empleadoId: string;
  empleadoNombre: string;
  acceso: AccesoEmpleado | null;
  rolesDisponibles: { value: string; label: string }[];
  action: (
    state: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
}

type Modo = null | "email" | "password" | "rol";

export function AccesoEmpleadoPanel({
  empleadoId,
  empleadoNombre,
  acceso,
  rolesDisponibles,
  action,
}: Props) {
  if (!acceso) {
    return (
      <SinAcceso action={action} rolesDisponibles={rolesDisponibles} />
    );
  }
  return (
    <ConAcceso
      empleadoId={empleadoId}
      empleadoNombre={empleadoNombre}
      acceso={acceso}
      rolesDisponibles={rolesDisponibles}
    />
  );
}

function SinAcceso({
  action,
  rolesDisponibles,
}: Pick<Props, "action" | "rolesDisponibles">) {
  const [state, formAction, pending] = useActionStateFeedback(action, {
    successMessage: "Acceso creado",
    refreshOnSuccess: true,
  });
  const errors = state && !state.ok ? state.errors : {};

  return (
    <Seccion>
      <form
        action={formAction}
        className="space-y-3 rounded-md border border-border bg-card p-4"
      >
        <p className="text-xs text-muted-foreground">
          Este empleado todavía no tiene acceso. Creá su login con email,
          contraseña y rol. Después vas a poder cambiarlos o quitárselo.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Email de acceso"
            name="email"
            type="email"
            error={errors.email}
            required
          />
          <SelectField
            label="Rol"
            name="rol"
            error={errors.rol}
            options={rolesDisponibles}
            placeholder="Selecciona rol"
            required
          />
        </div>
        <Field
          label="Contraseña"
          name="password"
          type="password"
          error={errors.password}
          hint="Mínimo 8 caracteres."
          required
        />
        {errors._ && <p className="text-xs text-destructive">{errors._.join(", ")}</p>}
        <LoadingButton
          type="submit"
          pending={pending}
          pendingLabel="Creando..."
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
        >
          Crear acceso
        </LoadingButton>
      </form>
    </Seccion>
  );
}

function ConAcceso({
  empleadoId,
  empleadoNombre,
  acceso,
  rolesDisponibles,
}: {
  empleadoId: string;
  empleadoNombre: string;
  acceso: AccesoEmpleado;
  rolesDisponibles: { value: string; label: string }[];
}) {
  const { pending, run } = useTransitionFeedback();
  const [modo, setModo] = useState<Modo>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(acceso.email);
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState(acceso.rol);

  function cerrar() {
    setModo(null);
    setError(null);
    setPassword("");
    setEmail(acceso.email);
    setRol(acceso.rol);
  }

  function ejecutar(
    fn: () => Promise<ActionResult>,
    successMessage: string,
    onOk?: () => void,
  ) {
    setError(null);
    run(
      async () => {
        const res = await fn();
        if (!res.ok) setError(Object.values(res.errors).flat().join(" "));
        return res;
      },
      { refreshOnSuccess: true, successMessage, onSuccess: () => onOk?.() },
    );
  }

  function guardarEmail() {
    const fd = new FormData();
    fd.set("email", email);
    ejecutar(() => cambiarEmailAcceso(empleadoId, fd), "Email actualizado", cerrar);
  }

  function guardarPassword() {
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    const fd = new FormData();
    fd.set("password", password);
    ejecutar(
      () => cambiarPasswordAcceso(empleadoId, fd),
      "Contraseña actualizada",
      cerrar,
    );
  }

  function guardarRol() {
    const fd = new FormData();
    fd.set("rol", rol);
    ejecutar(() => cambiarRolAcceso(empleadoId, fd), "Rol actualizado", cerrar);
  }

  function quitarODevolver() {
    const quitando = acceso.activo;
    if (
      quitando &&
      !window.confirm(
        `${empleadoNombre} no va a poder entrar más al sistema. Su historial se conserva y podés devolverle el acceso cuando quieras. ¿Seguimos?`,
      )
    ) {
      return;
    }
    ejecutar(
      () => toggleAccesoActivo(empleadoId),
      quitando ? "Acceso quitado" : "Acceso devuelto",
    );
  }

  function borrar() {
    if (
      !window.confirm(
        `Se borra el usuario de ${empleadoNombre} para siempre, y el email queda libre para volver a usarlo. ¿Seguimos?`,
      )
    ) {
      return;
    }
    ejecutar(() => eliminarAcceso(empleadoId), "Acceso eliminado");
  }

  return (
    <Seccion>
      <div className="space-y-4 rounded-md border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <Dato label="Email">{acceso.email}</Dato>
          <Dato label="Rol">{ROL_LABEL[acceso.rol] ?? acceso.rol}</Dato>
          <Dato label="Estado">
            {acceso.activo ? (
              <span className="text-sage-700">Puede entrar</span>
            ) : (
              <span className="text-destructive">Sin acceso</span>
            )}
          </Dato>
        </div>

        {!acceso.activo && (
          <p className="rounded-md border border-border bg-cream/40 px-3 py-2 text-xs text-muted-foreground">
            El acceso está suspendido: no puede entrar, pero todo lo que cargó
            sigue en el sistema con su nombre.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Accion onClick={() => { cerrar(); setModo("email"); }} Icon={Mail}>
            Cambiar email
          </Accion>
          <Accion onClick={() => { cerrar(); setModo("password"); }} Icon={KeyRound}>
            Cambiar contraseña
          </Accion>
          {rolesDisponibles.length > 0 && (
            <Accion onClick={() => { cerrar(); setModo("rol"); }} Icon={ShieldCheck}>
              Cambiar rol
            </Accion>
          )}
          <Accion onClick={quitarODevolver} Icon={Ban} disabled={pending}>
            {acceso.activo ? "Quitar acceso" : "Devolver acceso"}
          </Accion>
          {/* Borrar de verdad sólo se ofrece cuando no hay nada que romper. Si
              esta persona ya cargó ventas, la base rechaza el borrado y lo que
              corresponde es quitarle el acceso. */}
          {!acceso.tiene_historia && (
            <Accion onClick={borrar} Icon={Trash2} disabled={pending} peligro>
              Eliminar
            </Accion>
          )}
        </div>

        {acceso.tiene_historia && (
          <p className="text-xs text-muted-foreground">
            No se puede eliminar porque ya cargó movimientos en el sistema:
            borrarlo dejaría esas ventas y gastos sin saber quién los hizo. Para
            que no entre más, usá <strong>Quitar acceso</strong>.
          </p>
        )}

        {modo === "email" && (
          <Formulario
            titulo="Nuevo email de acceso"
            ayuda="Con este email va a entrar de ahora en más. El anterior deja de servir."
            onGuardar={guardarEmail}
            onCancelar={cerrar}
            pending={pending}
            error={error}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </Formulario>
        )}

        {modo === "password" && (
          <Formulario
            titulo="Nueva contraseña"
            ayuda="Mínimo 8 caracteres. Anotala antes de guardar: no se puede volver a ver, sólo cambiar de nuevo."
            onGuardar={guardarPassword}
            onCancelar={cerrar}
            pending={pending}
            error={error}
          >
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              placeholder="Escribí la contraseña nueva"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </Formulario>
        )}

        {modo === "rol" && (
          <Formulario
            titulo="Rol"
            ayuda="Define qué pantallas ve y qué puede cargar."
            onGuardar={guardarRol}
            onCancelar={cerrar}
            pending={pending}
            error={error}
          >
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value as AccesoEmpleado["rol"])}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {rolesDisponibles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Formulario>
        )}

        {error && !modo && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </Seccion>
  );
}

function Seccion({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-6">
      <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
        Acceso al sistema
      </h2>
      {children}
    </section>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 break-all">{children}</p>
    </div>
  );
}

function Accion({
  onClick,
  Icon,
  children,
  disabled,
  peligro,
}: {
  onClick: () => void;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  disabled?: boolean;
  peligro?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors disabled:opacity-50 ${
        peligro
          ? "border-destructive text-destructive hover:bg-destructive/10"
          : "border-border text-muted-foreground hover:bg-cream hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5 stroke-[1.5]" />
      {children}
    </button>
  );
}

function Formulario({
  titulo,
  ayuda,
  children,
  onGuardar,
  onCancelar,
  pending,
  error,
}: {
  titulo: string;
  ayuda: string;
  children: React.ReactNode;
  onGuardar: () => void;
  onCancelar: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-cream/40 p-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {titulo}
        </p>
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      </div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <LoadingButton
          type="button"
          onClick={onGuardar}
          pending={pending}
          pendingLabel="Guardando..."
          className="rounded-md bg-primary px-4 py-2 text-xs font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
        >
          Guardar
        </LoadingButton>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-md border border-border px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors hover:bg-cream"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
