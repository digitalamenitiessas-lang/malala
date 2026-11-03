import { redirect } from "next/navigation";
import { loginWithPassword } from "@/lib/auth/actions";
import { destinoSeguro } from "@/lib/auth/destino-login";
import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/db/env";

interface SearchParams {
  error?: string;
  /** Vuelta a la pantalla "Permitir" de la conexión con IA. */
  next?: string;
}

export default async function DevLoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);
  const next = destinoSeguro(sp.next);
  if (user) redirect(next ?? "/dashboard");

  const supabaseEnabled = isSupabaseConfigured();

  if (!supabaseEnabled) {
    return (
      <main className="min-h-screen bg-cream px-6 py-10 flex items-center">
        <div className="mx-auto w-full max-w-md rounded-[2rem] border border-border bg-card p-8 shadow-[0_20px_60px_rgba(44,53,37,0.06)]">
          <header className="space-y-3 text-center">
            <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
              Acceso interno
            </p>
            <h1 className="font-display text-3xl tracking-[0.3em] uppercase">
              MALALA
            </h1>
          </header>

          <div className="mt-8 rounded-[1.4rem] border border-warning/30 bg-warning/10 p-6 text-sm text-brown-900">
            <p className="font-medium">Supabase no está configurado</p>
            <p className="mt-2 text-brown-700">
              Completá las variables obligatorias en <code>.env.local</code> y
              volvé a cargar esta página.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cream px-6 py-10 flex items-center">
      <div className="mx-auto w-full max-w-md rounded-[2rem] border border-border bg-card p-8 shadow-[0_20px_60px_rgba(44,53,37,0.06)]">
        <header className="space-y-3 text-center">
          <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
            Acceso interno
          </p>
          <h1 className="font-display text-3xl tracking-[0.3em] uppercase">
            MALALA
          </h1>
          <p className="text-sm text-muted-foreground">
            Iniciá sesión para entrar al back office.
          </p>
        </header>

        {sp.error ? (
          <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {sp.error}
          </div>
        ) : null}

        <form action={loginWithPassword} className="mt-8 space-y-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
              Email
            </span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="w-full rounded-2xl border border-border bg-background px-4 py-3"
              placeholder="tucorreo@malala.com"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
              Contraseña
            </span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="w-full rounded-2xl border border-border bg-background px-4 py-3"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-2xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-sage-700"
          >
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
