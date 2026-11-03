import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { esAdmin } from "@/lib/auth/access";
import { listarConexiones, listarUsosRecientes } from "@/lib/mcp/oauth";
import { rolPuedeUsarMcp, urlMcp, urlPublica } from "@/lib/mcp/oauth-util";
import { formatDateTime } from "@/lib/utils";
import { cortarConexion } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Conectar el sistema con la IA de cada uno (Claude, ChatGPT). Pedido de
 * Isaías, Lu y Elu, que le pedían a Luciano "conectar su sistema con su IA":
 * acá está la dirección, cómo agregarla y las conexiones abiertas, para
 * cortarlas si hace falta.
 */
export default async function ConexionesIaPage() {
  const user = await requireUser();
  if (!rolPuedeUsarMcp(user.rol)) redirect("/dashboard");
  const admin = esAdmin(user.rol);

  const [conexiones, usos] = await Promise.all([
    listarConexiones(admin ? undefined : user.id),
    listarUsosRecientes(admin ? undefined : user.id, 20),
  ]);
  const direccion = urlMcp(urlPublica(await headers()));

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">Conectar con IA</h1>
        <p className="text-sm text-muted-foreground">
          Conectá el sistema con tu Claude o ChatGPT para preguntarle cosas del
          salón en tus palabras. La IA ve lo mismo que ves vos y{" "}
          <strong>solo consulta</strong>: no carga, no cambia ni borra nada.
        </p>
      </header>

      <section className="space-y-3 rounded-md border border-border bg-card p-5 text-sm">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
          La dirección del conector
        </h2>
        <code className="block select-all rounded-md border border-border bg-background px-3 py-2 font-mono">
          {direccion}
        </code>

        <div className="space-y-1 pt-2">
          <p className="font-medium">En Claude (claude.ai o la app)</p>
          <ol className="list-decimal pl-5 space-y-0.5 text-brown-700">
            <li>Configuración → Conectores → Agregar conector personalizado.</li>
            <li>Nombre: MALALA. URL: la dirección de arriba. Agregar.</li>
            <li>Tocá Conectar: se abre el sistema, entrás con tu usuario y tocás Permitir.</li>
          </ol>
        </div>
        <div className="space-y-1 pt-2">
          <p className="font-medium">En ChatGPT</p>
          <ol className="list-decimal pl-5 space-y-0.5 text-brown-700">
            <li>
              Configuración → Aplicaciones y conectores → Crear (si no aparece,
              activá el modo desarrollador en Configuración avanzada).
            </li>
            <li>Pegá la dirección de arriba, autenticación OAuth, y seguí los mismos pasos.</li>
          </ol>
        </div>
        <p className="pt-2 text-xs text-muted-foreground">
          Lo que tengas disponible depende del plan de tu cuenta de IA.
        </p>

        <div className="space-y-1 pt-2">
          <p className="font-medium">Para probar, preguntale por ejemplo:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-brown-700">
            <li>¿Cuánto vendimos esta semana y con qué medios de pago?</li>
            <li>¿Quién vendió más este mes y en qué servicios?</li>
            <li>¿Qué gastos quedan pendientes de pago?</li>
            <li>¿Qué productos están por quedarse sin stock?</li>
          </ul>
        </div>

        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-brown-700">
          Lo que consulte la IA (ventas, nombres de clientas) queda en tu cuenta
          de Claude o ChatGPT. Si dejás de usarla, cortá la conexión acá abajo.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
          {admin ? "Conexiones abiertas (de todos)" : "Tus conexiones"}
        </h2>
        {conexiones.length === 0 ? (
          <p className="rounded-md border border-border bg-card p-5 text-sm text-muted-foreground">
            Todavía no hay ninguna.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">App</th>
                  {admin && <th className="px-4 py-3 text-left font-medium">Usuario</th>}
                  <th className="px-4 py-3 text-left font-medium">Conectada</th>
                  <th className="px-4 py-3 text-left font-medium">Último uso</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {conexiones.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium">{c.cliente}</td>
                    {admin && <td className="px-4 py-3">{c.usuarioNombre}</td>}
                    <td className="px-4 py-3 tabular-nums">{formatDateTime(c.creadoEn)}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {c.ultimoUsoEn ? formatDateTime(c.ultimoUsoEn) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={cortarConexion}>
                        <input type="hidden" name="conexion_id" value={c.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-cream"
                        >
                          Cortar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {usos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
            Últimas consultas
          </h2>
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {usos.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {formatDateTime(u.creadoEn)}
                    </td>
                    {admin && <td className="px-4 py-2">{u.usuarioNombre}</td>}
                    <td className="px-4 py-2 font-mono text-xs">{u.herramienta}</td>
                    <td className="px-4 py-2 text-xs">
                      {u.ok ? "" : <span className="text-destructive">falló</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
