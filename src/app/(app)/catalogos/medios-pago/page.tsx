import { redirect } from "next/navigation";
import {
  createMedioPago,
  listMediosPago,
  toggleMedioPagoActivo,
  updateMedioPagoCuenta,
  updateMedioPagoRecargo,
} from "@/lib/data/medios-pago";
import { listCuentas } from "@/lib/data/cuentas-bancarias";
import { listSucursales } from "@/lib/data/sucursales";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { SubmitButton } from "@/components/forms/field";

export default async function MediosPagoPage() {
  const user = await requireUser();
  if (user.rol !== "admin" && user.rol !== "superadmin") redirect("/catalogos");

  const scope = buildAccessScope(user);
  const [medios, cuentas, sucursalesAll, activa] = await Promise.all([
    listMediosPago(),
    listCuentas(),
    listSucursales({ soloActivas: true }),
    getActiveSucursal(),
  ]);
  const sucursales = sucursalesAll.filter((s) =>
    scope.sucursalIdsPermitidas.includes(s.id),
  );
  const sucursalNombreById = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const cuentaById = new Map(cuentas.map((c) => [c.id, c]));
  const cuentasBySucursal = new Map<string, typeof cuentas>();
  for (const c of cuentas) {
    const list = cuentasBySucursal.get(c.sucursal_id) ?? [];
    list.push(c);
    cuentasBySucursal.set(c.sucursal_id, list);
  }

  const defaultSucursalId = activa?.id ?? sucursales[0]?.id;
  const cuentasDefaultSucursal = defaultSucursalId
    ? (cuentasBySucursal.get(defaultSucursalId) ?? [])
    : [];

  async function create(formData: FormData) {
    "use server";
    await createMedioPago(formData);
  }
  async function toggle(formData: FormData) {
    "use server";
    const id = formData.get("id");
    if (typeof id === "string") await toggleMedioPagoActivo(id);
  }
  async function setCuenta(formData: FormData) {
    "use server";
    const id = formData.get("id");
    const cuenta = formData.get("cuenta_id");
    if (typeof id !== "string") return;
    const cuentaId =
      typeof cuenta === "string" && cuenta.length > 0 ? cuenta : null;
    await updateMedioPagoCuenta(id, cuentaId);
  }
  async function setRecargo(formData: FormData) {
    "use server";
    const id = formData.get("id");
    const recargo = formData.get("recargo_pct");
    if (typeof id !== "string") return;
    await updateMedioPagoRecargo(id, Number(recargo) || 0);
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Medios de pago
        </h1>
        <p className="text-sm text-muted-foreground">
          Cada medio de pago decide <strong>en qué cuenta cae la plata</strong>{" "}
          cuando cobrás con él.
        </p>
      </header>

      {/* La pantalla mostraba una columna "Cuenta destino" y un desplegable, sin
          decir nunca qué significaba. Sin esto, la relación medio → cuenta no se
          entiende y se configura a ciegas. */}
      <div className="rounded-md border border-border bg-cream/30 p-4 text-sm">
        <p className="text-foreground">
          Si cobrás $10.000 por transferencia y el medio{" "}
          <em>Transferencia</em> apunta a la cuenta <em>Galicia</em>, esos
          $10.000 se suman al saldo de Galicia. Eso es lo que después ves en
          Caja y en Bancos.
        </p>
        <p className="mt-2 text-muted-foreground">
          Un medio sin cuenta no rompe nada visible: la venta se registra igual,
          pero la plata no se suma en ningún lado y no aparece en la caja del
          día. Las cuentas se crean en{" "}
          <a
            href="/catalogos/cuentas-bancarias"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Catálogos → Cuentas bancarias
          </a>
          .
        </p>
      </div>

      {cuentas.length === 0 && (
        <div className="bg-warning/10 border border-warning/30 text-brown-900 rounded-md p-4 text-sm">
          Todavía no hay cuentas bancarias cargadas. Cargá al menos una en{" "}
          <a href="/catalogos/cuentas-bancarias" className="underline">
            Catálogos → Cuentas bancarias
          </a>{" "}
          antes de crear medios de pago.
        </div>
      )}

      <section className="bg-card border border-border rounded-md p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
          Agregar medio de pago
        </h2>
        <p className="text-xs text-muted-foreground">
          Tip: para crear medios de otra sucursal, cambialá en el switcher de arriba a la derecha y volvé.
        </p>
        <form
          action={create}
          className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end"
        >
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Sucursal
            </label>
            <select
              name="sucursal_id"
              required
              defaultValue={defaultSucursalId}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Código
            </label>
            <input
              name="codigo"
              required
              maxLength={8}
              placeholder="EF, TR…"
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm uppercase focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Nombre
            </label>
            <input
              name="nombre"
              required
              placeholder="Efectivo, Transf. Galicia…"
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Cuenta destino ({sucursalNombreById.get(defaultSucursalId ?? "") ?? ""})
            </label>
            <select
              name="cuenta_id"
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              defaultValue=""
            >
              <option value="">— sin asignar —</option>
              {cuentasDefaultSucursal.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Recargo %
            </label>
            <input
              name="recargo_pct"
              type="number"
              step="0.01"
              min="0"
              max="100"
              defaultValue={0}
              className="w-full px-3 py-2 text-right tabular-nums border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <SubmitButton
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wider hover:bg-brown-700 transition-colors"
            pendingLabel="Agregando..."
          >
            Agregar
          </SubmitButton>
        </form>
      </section>

      {/* Un medio sin cuenta no rompe nada visible: la venta se guarda igual y
          la plata simplemente no aparece en la caja. Por eso conviene gritarlo
          acá, que es donde se arregla. El medio GIFT queda afuera: ese NO tiene
          que tener cuenta, porque canjear una tarjeta no mueve plata nueva. */}
      {(() => {
        const huerfanos = medios.filter(
          (m) => m.activo && !m.cuenta_id && m.codigo.toUpperCase() !== "GIFT",
        );
        if (huerfanos.length === 0) return null;
        return (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-4">
            <p className="text-sm font-medium text-brown-900">
              {huerfanos.length === 1
                ? "Hay un medio de pago sin cuenta destino"
                : `Hay ${huerfanos.length} medios de pago sin cuenta destino`}
            </p>
            <p className="mt-1 text-xs text-brown-700">
              Lo que se cobre con{" "}
              {huerfanos
                .map((m) => `${m.nombre} (${sucursalNombreById.get(m.sucursal_id) ?? m.sucursal_id})`)
                .join(", ")}{" "}
              <strong>no va a entrar a la caja del día</strong>: la venta queda
              registrada pero la plata no impacta en ninguna cuenta. Asignales
              una acá abajo.
            </p>
          </div>
        );
      })()}

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-3 w-32">Sucursal</th>
              <th className="text-left font-medium px-4 py-3 w-24">Código</th>
              <th className="text-left font-medium px-4 py-3">Nombre</th>
              <th className="text-left font-medium px-4 py-3 w-64">
                ¿Dónde cae la plata?
              </th>
              <th className="text-left font-medium px-4 py-3 w-40">Recargo %</th>
              <th className="text-center font-medium px-4 py-3 w-28">Estado</th>
              <th className="px-4 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {medios.map((m) => {
              const cuenta = m.cuenta_id ? cuentaById.get(m.cuenta_id) : null;
              const cuentasDeLaSucursal =
                cuentasBySucursal.get(m.sucursal_id) ?? [];
              // Gift card es el único que NO debe tener cuenta: pagar con una
              // tarjeta de regalo no ingresa plata nueva, entró cuando la
              // compraron. Sin esta aclaración su fila se ve rota igual que las
              // que sí están mal configuradas.
              const esGift = m.codigo.toUpperCase() === "GIFT";
              return (
                <tr key={m.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">
                    {sucursalNombreById.get(m.sucursal_id) ?? m.sucursal_id}
                  </td>
                  <td className="px-4 py-3 font-medium tabular-nums">{m.codigo}</td>
                  <td className="px-4 py-3">{m.nombre}</td>
                  <td className="px-4 py-3">
                    {esGift ? (
                      <p className="text-xs text-muted-foreground">
                        No lleva cuenta. Pagar con una gift card no ingresa
                        plata nueva: entró cuando la compraron.
                      </p>
                    ) : (
                    <form action={setCuenta} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={m.id} />
                      <select
                        name="cuenta_id"
                        defaultValue={m.cuenta_id ?? ""}
                        className={
                          "flex-1 px-2 py-1.5 border border-border rounded bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring " +
                          (!cuenta ? "text-warning" : "")
                        }
                      >
                        <option value="">— sin asignar —</option>
                        {cuentasDeLaSucursal.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                      <SubmitButton className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
                        Guardar
                      </SubmitButton>
                    </form>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <form action={setRecargo} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={m.id} />
                      <input
                        name="recargo_pct"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        defaultValue={m.recargo_pct}
                        className="w-20 px-2 py-1.5 text-right tabular-nums border border-border rounded bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <SubmitButton className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
                        Guardar
                      </SubmitButton>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {m.activo ? (
                      <span className="bg-sage-100 text-sage-900 px-2 py-0.5 rounded text-xs">
                        Activo
                      </span>
                    ) : (
                      <span className="bg-stone-100 text-stone-500 px-2 py-0.5 rounded text-xs">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={toggle}>
                      <input type="hidden" name="id" value={m.id} />
                      <SubmitButton className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
                        {m.activo ? "Desactivar" : "Reactivar"}
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
