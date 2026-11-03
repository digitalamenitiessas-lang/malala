import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listSucursales } from "@/lib/data/sucursales";
import { rolPuedeUsarMcp } from "@/lib/mcp/oauth-util";
import { cancelarAcceso, permitirAcceso } from "./actions";
import { CAMPOS_PEDIDO, revisarPedido, urlDeVuelta, type ParamsPedido } from "./pedido";

export const dynamic = "force-dynamic";

const ROL_LABEL: Record<string, string> = {
  superadmin: "Dueño",
  admin: "Admin",
  encargada: "Encargada",
  empleado: "Empleada",
};

function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-cream px-6 py-10 flex items-center">
      <div className="mx-auto w-full max-w-md rounded-[2rem] border border-border bg-card p-8 shadow-[0_20px_60px_rgba(44,53,37,0.06)]">
        <header className="space-y-3 text-center">
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
            Conectar con IA
          </p>
          <h1 className="font-display text-3xl tracking-[0.3em] uppercase">MALALA</h1>
        </header>
        <div className="mt-8 space-y-5 text-sm">{children}</div>
      </div>
    </main>
  );
}

/**
 * La pantalla "Permitir" del conector. Llega acá la persona desde su IA
 * (Claude, ChatGPT): si no tiene sesión, pasa por el login y vuelve; después
 * ve QUIÉN pide acceso, con qué usuario y a qué, y decide.
 */
export default async function AutorizarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params: ParamsPedido = {};
  for (const campo of CAMPOS_PEDIDO) {
    const v = sp[campo];
    if (typeof v === "string") params[campo] = v;
  }

  const pedido = await revisarPedido(params);
  if (pedido.tipo === "fatal") {
    return (
      <Tarjeta>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
          {pedido.mensaje}
        </div>
      </Tarjeta>
    );
  }
  if (pedido.tipo === "error") {
    redirect(
      urlDeVuelta(pedido.redirectUri, {
        error: pedido.error,
        error_description: pedido.descripcion,
        state: pedido.state,
      }),
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    const vuelta = `/oauth/authorize?${new URLSearchParams(params as Record<string, string>)}`;
    redirect(`/dev/login?next=${encodeURIComponent(vuelta)}`);
  }

  if (!rolPuedeUsarMcp(user.rol)) {
    return (
      <Tarjeta>
        <p>
          Tu usuario ({user.nombre}) no tiene habilitada la conexión con IA. Por
          ahora es para dueños, administración y encargadas.
        </p>
        <form action={cancelarAcceso}>
          <CamposOcultos params={params} />
          <button
            type="submit"
            className="w-full rounded-2xl border border-border px-5 py-3 text-sm font-medium hover:bg-cream"
          >
            Volver
          </button>
        </form>
      </Tarjeta>
    );
  }

  const permitidas = new Set(user.sucursal_ids_permitidas ?? [user.sucursal_default_id]);
  const nombresSucursales = (await listSucursales({ soloActivas: true }))
    .filter((s) => permitidas.has(s.id))
    .map((s) => s.nombre);
  const destino = new URL(pedido.redirectUri).host;

  return (
    <Tarjeta>
      <p className="text-base text-center">
        <strong>{pedido.clienteNombre}</strong> quiere consultar el sistema con tu usuario.
      </p>

      <div className="rounded-2xl border border-border bg-background px-4 py-3 space-y-1">
        <p>
          Entrás como <strong>{user.nombre}</strong> ({ROL_LABEL[user.rol] ?? user.rol})
        </p>
        <p className="text-muted-foreground">
          {nombresSucursales.length > 1 ? "Sucursales" : "Sucursal"}:{" "}
          {nombresSucursales.join(", ") || "—"}
        </p>
      </div>

      <ul className="space-y-2 text-brown-700 list-disc pl-5">
        <li>
          Va a poder ver lo mismo que ves vos: turnos, ventas, gastos, caja, stock,
          clientas y liquidaciones.
        </li>
        <li>
          <strong>Solo consulta.</strong> No puede cargar, cambiar ni borrar nada.
        </li>
        <li>
          Lo que consulte pasa a tu cuenta de {pedido.clienteNombre}. Podés cortar la
          conexión cuando quieras desde <em>Conectar con IA</em> en el sistema.
        </li>
      </ul>

      <p className="text-xs text-muted-foreground text-center">
        Después de permitir, volvés a <strong>{destino}</strong>
      </p>

      <div className="flex gap-3">
        <form action={cancelarAcceso} className="flex-1">
          <CamposOcultos params={params} />
          <button
            type="submit"
            className="w-full rounded-2xl border border-border px-5 py-3 text-sm font-medium hover:bg-cream"
          >
            Cancelar
          </button>
        </form>
        <form action={permitirAcceso} className="flex-1">
          <CamposOcultos params={params} />
          <button
            type="submit"
            className="w-full rounded-2xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-sage-700"
          >
            Permitir
          </button>
        </form>
      </div>
    </Tarjeta>
  );
}

function CamposOcultos({ params }: { params: ParamsPedido }) {
  return (
    <>
      {Object.entries(params).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}
