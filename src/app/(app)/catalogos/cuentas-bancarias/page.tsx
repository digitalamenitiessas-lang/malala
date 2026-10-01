import { redirect } from "next/navigation";
import {
  createCuenta,
  listCuentas,
  toggleCuentaActiva,
} from "@/lib/data/cuentas-bancarias";
import {
  createImpuesto,
  deleteImpuesto,
  listImpuestosByCuentas,
  toggleImpuestoActivo,
} from "@/lib/data/cuenta-impuestos";
import { listSucursales } from "@/lib/data/sucursales";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope, esAdmin } from "@/lib/auth/access";
import { SubmitButton } from "@/components/forms/field";
import type { ImpuestoBase } from "@/lib/types";

const BASE_LABEL: Record<ImpuestoBase, string> = {
  credito: "Ingresos (lo que entra)",
  debito: "Egresos (lo que sale)",
  ambos: "Todo (entra y sale)",
};

export default async function CuentasBancariasPage() {
  const user = await requireUser();
  if (!esAdmin(user.rol)) {
    redirect("/catalogos");
  }

  const scope = buildAccessScope(user);
  const [cuentas, todasSucursales, activa] = await Promise.all([
    listCuentas(),
    listSucursales({ soloActivas: true }),
    getActiveSucursal(),
  ]);
  const sucursalesPermitidas = todasSucursales.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );
  const sucursalNombreById = new Map(
    sucursalesPermitidas.map((s) => [s.id, s.nombre]),
  );
  const impuestosByCuenta = await listImpuestosByCuentas(
    cuentas.map((c) => c.id),
  );

  async function create(formData: FormData) {
    "use server";
    await createCuenta(formData);
  }
  async function toggle(formData: FormData) {
    "use server";
    const id = formData.get("id");
    if (typeof id === "string") await toggleCuentaActiva(id);
  }
  async function crearImpuesto(formData: FormData) {
    "use server";
    await createImpuesto(formData);
  }
  async function toggleImpuesto(formData: FormData) {
    "use server";
    const id = formData.get("id");
    if (typeof id === "string") await toggleImpuestoActivo(id);
  }
  async function borrarImpuesto(formData: FormData) {
    "use server";
    const id = formData.get("id");
    if (typeof id === "string") await deleteImpuesto(id);
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Cuentas bancarias
        </h1>
        <p className="text-sm text-muted-foreground">
          {cuentas.length} cuentas · cada cuenta pertenece a una sucursal
        </p>
      </header>

      <section className="bg-card border border-border rounded-md p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
          Agregar cuenta
        </h2>
        <form
          action={create}
          className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
        >
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Sucursal
            </label>
            <select
              name="sucursal_id"
              required
              defaultValue={activa?.id ?? sucursalesPermitidas[0]?.id}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {sucursalesPermitidas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Nombre
            </label>
            <input
              name="nombre"
              required
              placeholder="Banco Galicia, Caja Efectivo…"
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tipo
            </label>
            <select
              name="tipo"
              required
              defaultValue="banco"
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="banco">Banco</option>
              <option value="efectivo">Efectivo</option>
            </select>
          </div>
          <SubmitButton
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors"
            pendingLabel="Agregando..."
          >
            Agregar
          </SubmitButton>
          <div className="space-y-1.5 sm:col-span-5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Observación
            </label>
            <input
              name="observacion"
              placeholder="Número de CBU, alias, etc. (opcional)"
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </form>
      </section>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-3 w-40">Sucursal</th>
              <th className="text-left font-medium px-4 py-3">Nombre</th>
              <th className="text-left font-medium px-4 py-3 w-24">Tipo</th>
              <th className="text-left font-medium px-4 py-3">Observación</th>
              <th className="text-center font-medium px-4 py-3 w-28">Estado</th>
              <th className="px-4 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cuentas.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  Todavía no hay cuentas cargadas.
                </td>
              </tr>
            ) : (
              cuentas.map((c) => (
                <tr key={c.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">
                    {sucursalNombreById.get(c.sucursal_id) ?? c.sucursal_id}
                  </td>
                  <td className="px-4 py-3 font-medium">{c.nombre}</td>
                  <td className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">
                    {c.tipo}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.observacion ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.activo ? (
                      <span className="bg-sage-100 text-sage-900 px-2 py-0.5 rounded text-xs">
                        Activa
                      </span>
                    ) : (
                      <span className="bg-stone-100 text-stone-500 px-2 py-0.5 rounded text-xs">
                        Inactiva
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={toggle}>
                      <input type="hidden" name="id" value={c.id} />
                      <SubmitButton className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
                        {c.activo ? "Desactivar" : "Reactivar"}
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
            Impuestos por cuenta
          </h2>
          <p className="text-xs text-muted-foreground">
            Cada cobro o pago en la cuenta descuenta automáticamente estos
            impuestos y queda registrado como movimiento aparte, para saber
            cuánto te come cada cuenta. Ej.: “Débito y crédito” 0,6% sobre todo;
            “Ingresos brutos” 2,5% solo sobre lo que entra.
          </p>
        </div>

        {cuentas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Cargá una cuenta para poder configurarle impuestos.
          </p>
        ) : (
          <div className="space-y-3">
            {cuentas.map((c) => {
              const impuestos = impuestosByCuenta.get(c.id) ?? [];
              return (
                <div
                  key={c.id}
                  className="bg-card border border-border rounded-md p-4 space-y-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{c.nombre}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {sucursalNombreById.get(c.sucursal_id) ?? c.sucursal_id}
                    </span>
                  </div>

                  {impuestos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Sin impuestos configurados.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border border border-border rounded-md">
                      {impuestos.map((imp) => (
                        <li
                          key={imp.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{imp.nombre}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {imp.alicuota_pct}%
                            </span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {BASE_LABEL[imp.base]}
                            </span>
                            {!imp.activo && (
                              <span className="bg-stone-100 text-stone-500 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">
                                Inactivo
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <form action={toggleImpuesto}>
                              <input type="hidden" name="id" value={imp.id} />
                              <SubmitButton className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
                                {imp.activo ? "Desactivar" : "Reactivar"}
                              </SubmitButton>
                            </form>
                            <form action={borrarImpuesto}>
                              <input type="hidden" name="id" value={imp.id} />
                              <SubmitButton className="text-xs uppercase tracking-wider text-destructive hover:opacity-80">
                                Quitar
                              </SubmitButton>
                            </form>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <form
                    action={crearImpuesto}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_120px_1fr_auto] gap-2 items-end border-t border-border pt-3"
                  >
                    <input type="hidden" name="cuenta_id" value={c.id} />
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Nombre
                      </label>
                      <input
                        name="nombre"
                        required
                        placeholder="Débito y crédito, Ingresos brutos…"
                        className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Alícuota %
                      </label>
                      <input
                        name="alicuota_pct"
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        placeholder="0,6"
                        className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Aplica sobre
                      </label>
                      <select
                        name="base"
                        defaultValue="ambos"
                        className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="ambos">{BASE_LABEL.ambos}</option>
                        <option value="credito">{BASE_LABEL.credito}</option>
                        <option value="debito">{BASE_LABEL.debito}</option>
                      </select>
                    </div>
                    <SubmitButton
                      className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors"
                      pendingLabel="Agregando..."
                    >
                      Agregar
                    </SubmitButton>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
