"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useActionStateFeedback } from "@/components/feedback/action-feedback";
import { CurrencyField, Field, FormButtons, GlobalError, SelectField } from "./field";
import { formatARS } from "@/lib/utils";
import type {
  CuentaBancaria,
  Insumo,
  MedioPago,
  Proveedor,
  RubroGasto,
} from "@/lib/types";
import type { CreateEgresoResult } from "@/lib/data/egresos";

// ¿El medio de pago impacta en una cuenta de banco? (habilita elegir a cuál).
// Efectivo (EF) y Cuenta corriente (CC) no van a bancos, así que no muestran
// selector de cuenta; el resto (tarjeta, transferencia, etc.) sí.
function usaCuentaBanco(mp: MedioPago | undefined): boolean {
  if (!mp) return false;
  const cod = mp.codigo.toUpperCase();
  return cod !== "EF" && cod !== "CC";
}

// La cuenta corriente es de clientes; no es un medio para pagar gastos.
function esPagable(mp: MedioPago): boolean {
  return mp.codigo.toUpperCase() !== "CC";
}

const UNIDAD_LABEL: Record<string, string> = {
  ud: "ud",
  ml: "ml",
  g: "g",
  aplicacion: "apl.",
};

// Opción especial del selector de insumo para darlo de alta en el momento.
const NUEVO_INSUMO = "__nuevo__";
const UNIDAD_OPTIONS = [
  { value: "ml", label: "ml (mililitros)" },
  { value: "g", label: "g (gramos)" },
  { value: "ud", label: "ud (unidades)" },
  { value: "aplicacion", label: "aplicación" },
];

interface Props {
  defaultSucursalId: string;
  rubros: RubroGasto[];
  proveedores: Proveedor[];
  mediosPago: MedioPago[];
  cuentasBanco: CuentaBancaria[];
  insumos: Insumo[];
  defaultFecha: string; // YYYY-MM-DD
  defaultProveedorId?: string;
  defaultEsCompraInsumo?: boolean;
  action: (
    state: CreateEgresoResult | null,
    formData: FormData,
  ) => Promise<CreateEgresoResult>;
  compraAction: (
    state: CreateEgresoResult | null,
    formData: FormData,
  ) => Promise<CreateEgresoResult>;
}

export function EgresoForm({
  defaultSucursalId,
  rubros,
  proveedores,
  mediosPago,
  cuentasBanco,
  insumos,
  defaultFecha,
  defaultProveedorId,
  defaultEsCompraInsumo,
  action,
  compraAction,
}: Props) {
  const [pagado, setPagado] = useState(true);
  const [esCompraInsumo, setEsCompraInsumo] = useState(
    defaultEsCompraInsumo ?? false,
  );
  // La sucursal es siempre la activa (se cambia globalmente, solo superadmin).
  const sucursalId = defaultSucursalId;
  const [proveedorId, setProveedorId] = useState(defaultProveedorId ?? "");
  const [rubroId, setRubroId] = useState("");
  const esRubroSueldos =
    rubros.find((r) => r.id === rubroId)?.rubro.trim().toLowerCase() ===
    "sueldos";
  const [insumoId, setInsumoId] = useState("");
  const [nuevoUnidad, setNuevoUnidad] = useState("ml");
  const [nuevoTamano, setNuevoTamano] = useState<number>(0);
  const esNuevoInsumo = insumoId === NUEVO_INSUMO;

  // Pago: monto total + hasta dos medios, cada uno con su cuenta (como en ventas).
  const [valorTotal, setValorTotal] = useState<number>(0);
  // Con qué medio arranca el gasto. El efectivo primero: es con lo que el
  // salón paga casi todo, y tomar "el primero de la lista" ordenaba por nombre
  // y dejaba Cheque por defecto. Un gasto guardado sin mirar salía del banco en
  // vez de la caja, y el arqueo del día no cerraba. Mismo criterio que la venta.
  const [mp1Id, setMp1Id] = useState(() => {
    const visible = mediosPago.filter(
      (m) => m.sucursal_id === defaultSucursalId && m.activo && esPagable(m),
    );
    const efectivo = visible.find((m) => m.codigo.toUpperCase() === "EF");
    return (efectivo ?? visible[0])?.id ?? "";
  });
  const [mp1CuentaId, setMp1CuentaId] = useState("");
  const [mp2Id, setMp2Id] = useState("");
  const [valor2, setValor2] = useState<number>(0);
  const [mp2CuentaId, setMp2CuentaId] = useState("");

  const mediosVisibles = useMemo(
    () =>
      mediosPago.filter(
        (m) => m.sucursal_id === sucursalId && m.activo && esPagable(m),
      ),
    [mediosPago, sucursalId],
  );

  // Mantener los medios elegidos válidos al cambiar de sucursal.
  useEffect(() => {
    if (mediosVisibles.length === 0) return;
    if (!mediosVisibles.some((m) => m.id === mp1Id)) {
      queueMicrotask(() => setMp1Id(mediosVisibles[0].id));
    }
    if (mp2Id && !mediosVisibles.some((m) => m.id === mp2Id)) {
      queueMicrotask(() => {
        setMp2Id("");
        setValor2(0);
      });
    }
  }, [mediosVisibles, mp1Id, mp2Id]);

  const mp1 = mediosVisibles.find((m) => m.id === mp1Id);
  const mp2 = mp2Id ? mediosVisibles.find((m) => m.id === mp2Id) : undefined;
  const valor1 = Math.max(0, valorTotal - (mp2Id ? valor2 : 0));

  // Si hay proveedor elegido, priorizamos sus insumos; si no, mostramos todos.
  const insumosVisibles = useMemo(() => {
    const activos = insumos.filter((i) => i.activo);
    if (!proveedorId) return activos;
    const delProveedor = activos.filter((i) =>
      i.proveedor_ids?.includes(proveedorId),
    );
    return delProveedor.length > 0 ? delProveedor : activos;
  }, [insumos, proveedorId]);

  const insumoSel = useMemo(
    () => insumos.find((i) => i.id === insumoId) ?? null,
    [insumos, insumoId],
  );

  const [state, formAction, pending] = useActionStateFeedback<
    CreateEgresoResult
  >(
    async (prev, fd) =>
      esCompraInsumo ? compraAction(prev, fd) : action(prev, fd),
    {
      redirectTo: "/egresos",
      successMessage: esCompraInsumo
        ? "Compra de insumo registrada"
        : "Gasto registrado",
    },
  );

  const errors = state && !state.ok ? state.errors : {};

  return (
    <form action={formAction} className="space-y-5 max-w-2xl">
      <label className="flex items-center gap-2 rounded-md border border-border bg-cream/30 px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          name="es_compra_insumo"
          checked={esCompraInsumo}
          onChange={(e) => setEsCompraInsumo(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-sage-500"
        />
        <span className="font-medium">Es compra de insumo</span>
        <span className="text-xs text-muted-foreground">
          (suma stock y actualiza el precio del insumo)
        </span>
      </label>

      <input type="hidden" name="sucursal_id" value={sucursalId} />

      <Field
        label="Fecha"
        name="fecha"
        type="date"
        defaultValue={defaultFecha}
        error={errors.fecha}
        required
      />

      {esCompraInsumo ? (
        // El rubro lo asigna automáticamente el backend (rubro "Insumos").
        <p className="text-xs text-muted-foreground">
          Se registra bajo el rubro <strong>Insumos</strong> automáticamente.
        </p>
      ) : (
        <>
          <SelectField
            label="Rubro"
            name="rubro_id"
            value={rubroId}
            onChange={(e) => setRubroId(e.currentTarget.value)}
            error={errors.rubro_id}
            options={rubros
              .filter((r) => r.activo)
              .map((r) => ({
                value: r.id,
                label: r.subrubro ? `${r.rubro} · ${r.subrubro}` : r.rubro,
              }))}
            placeholder="Seleccioná rubro"
            required
          />
          {/* Un adelanto cargado acá sale de la caja pero no queda atado a
              nadie, así que después no se descuenta del sueldo. El camino que
              sí lo ata es la ficha de la empleada. */}
          {esRubroSueldos && (
            <p className="-mt-3 text-xs text-muted-foreground">
              ¿Es un adelanto a una empleada? Cargalo desde{" "}
              <Link
                href="/catalogos/empleados"
                className="underline underline-offset-2 hover:text-foreground"
              >
                su ficha
              </Link>
              , en <strong>Anticipos</strong>: hace este mismo gasto y además lo
              deja anotado a su nombre para descontarlo en la liquidación. Si lo
              cargás acá, sale de la caja pero no se le descuenta a nadie.
            </p>
          )}
          <input type="hidden" name="insumo_id" value="" />
        </>
      )}

      <SelectField
        label={esCompraInsumo ? "Proveedor" : "Proveedor (opcional)"}
        name="proveedor_id"
        value={proveedorId}
        onChange={(e) => setProveedorId(e.currentTarget.value)}
        error={errors.proveedor_id}
        options={proveedores.map((p) => ({ value: p.id, label: p.nombre }))}
        placeholder="—"
      />

      {esCompraInsumo && (
        <div className="space-y-4 rounded-md border border-border bg-card p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label="Insumo"
              name="insumo_select_ui"
              value={insumoId}
              onChange={(e) => setInsumoId(e.currentTarget.value)}
              error={errors.insumo_id}
              options={[
                { value: NUEVO_INSUMO, label: "➕ Crear insumo nuevo" },
                ...insumosVisibles.map((i) => ({
                  value: i.id,
                  label: i.nombre,
                })),
              ]}
              placeholder="Seleccioná insumo"
              required
            />
            <div className="space-y-1.5">
              <label
                htmlFor="cantidad"
                className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Cantidad de envases
              </label>
              <input
                id="cantidad"
                type="number"
                name="cantidad"
                min="1"
                step="1"
                defaultValue={1}
                required={esCompraInsumo}
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums text-right"
              />
              {!esNuevoInsumo && insumoSel && (
                <p className="text-[10px] text-muted-foreground">
                  Cada envase trae {insumoSel.tamano_envase}{" "}
                  {UNIDAD_LABEL[insumoSel.unidad_medida] ??
                    insumoSel.unidad_medida}
                </p>
              )}
              {esNuevoInsumo && nuevoTamano > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Cada envase trae {nuevoTamano}{" "}
                  {UNIDAD_LABEL[nuevoUnidad] ?? nuevoUnidad}
                </p>
              )}
              {errors.cantidad && (
                <p className="text-xs text-destructive">
                  {errors.cantidad.join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* Insumo existente: mandamos su id. */}
          {!esNuevoInsumo && insumoId && (
            <input type="hidden" name="insumo_id" value={insumoId} />
          )}

          {/* Alta inline del insumo nuevo. El precio sale de la compra. */}
          {esNuevoInsumo && (
            <div className="space-y-4 rounded-md border border-dashed border-border bg-cream/30 p-4">
              <input type="hidden" name="nuevo_insumo" value="1" />
              <p className="text-xs text-muted-foreground">
                Se crea el insumo en esta sucursal y queda guardado para futuras
                compras. El costo se calcula solo: monto ÷ cantidad de envases.
              </p>
              <Field
                label="Nombre del insumo"
                name="nuevo_nombre"
                error={errors.nuevo_nombre}
                required={esNuevoInsumo}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField
                  label="Unidad de medida"
                  name="nuevo_unidad_medida"
                  value={nuevoUnidad}
                  onChange={(e) => setNuevoUnidad(e.currentTarget.value)}
                  error={errors.nuevo_unidad_medida}
                  options={UNIDAD_OPTIONS}
                  required={esNuevoInsumo}
                />
                <div className="space-y-1.5">
                  <label
                    htmlFor="nuevo_tamano_envase"
                    className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    Contenido por envase ({UNIDAD_LABEL[nuevoUnidad] ?? nuevoUnidad})
                  </label>
                  <input
                    id="nuevo_tamano_envase"
                    type="number"
                    name="nuevo_tamano_envase"
                    min="0.01"
                    step="0.01"
                    value={nuevoTamano || ""}
                    onChange={(e) => setNuevoTamano(Number(e.currentTarget.value))}
                    required={esNuevoInsumo}
                    className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums text-right"
                  />
                  {errors.nuevo_tamano_envase && (
                    <p className="text-xs text-destructive">
                      {errors.nuevo_tamano_envase.join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="nuevo_umbral_stock_bajo"
                  className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Umbral de stock bajo (opcional)
                </label>
                <input
                  id="nuevo_umbral_stock_bajo"
                  type="number"
                  name="nuevo_umbral_stock_bajo"
                  min="0"
                  step="0.01"
                  defaultValue={0}
                  className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums text-right"
                />
                <p className="text-[10px] text-muted-foreground">
                  Avisa cuando el stock baja de este valor. Podés ajustarlo
                  después en Catálogos → Insumos.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4 rounded-md border border-border bg-card p-4">
        <CurrencyField
          label={esCompraInsumo ? "Monto total pagado" : "Monto total"}
          name="valor"
          value={valorTotal}
          onChange={(v) => {
            setValorTotal(v);
            if (mp2Id) setValor2((prev) => Math.min(prev, Math.max(0, v)));
          }}
          error={errors.valor}
          required
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="pagado"
            checked={pagado}
            onChange={(e) => setPagado(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-sage-500"
          />
          <span>Ya está pagado</span>
          <span className="text-xs text-muted-foreground">
            (sin tildar y con proveedor, queda en su cuenta)
          </span>
        </label>

        {/* Con qué se pagó sólo se pregunta si la plata sale ahora. Si el gasto
            queda a pagar todavía no se sabe, y elegir uno de relleno hacía que
            después, al marcarlo pagado, la plata saliera de esa cuenta. */}
        {pagado && (
          <>
          {/* Medio 1 + cuenta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label={mp2Id ? "Medio 1" : "Medio de pago"}
              name="mp_id"
              value={mp1Id}
              onChange={(e) => setMp1Id(e.currentTarget.value)}
              error={errors.mp_id}
              options={mediosVisibles.map((m) => ({
                value: m.id,
                label: m.nombre,
              }))}
              placeholder={
                mediosVisibles.length === 0
                  ? "Cargá un medio en esta sucursal"
                  : undefined
              }
              required
            />
            {usaCuentaBanco(mp1) && (
              <BancoSelector
                name="mp1_cuenta_id"
                label="Cuenta"
                cuentas={cuentasBanco}
                value={mp1CuentaId}
                onChange={setMp1CuentaId}
              />
            )}
          </div>

          {/* Medio 2 (opcional) + monto + cuenta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label="Medio 2 (opcional)"
              name="mp2_id"
              value={mp2Id}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setMp2Id(v);
                if (!v) {
                  setValor2(0);
                  setMp2CuentaId("");
                }
              }}
              error={errors.mp2_id}
              options={mediosVisibles
                .filter((m) => m.id !== mp1Id)
                .map((m) => ({ value: m.id, label: m.nombre }))}
              placeholder="— Ninguno —"
            />
            {mp2Id && (
              <CurrencyField
                label="Monto del medio 2"
                name="valor2"
                value={valor2}
                onChange={setValor2}
                error={errors.valor2}
                required
              />
            )}
          </div>

          {mp2Id && usaCuentaBanco(mp2) && (
            <BancoSelector
              name="mp2_cuenta_id"
              label="Cuenta (Medio 2)"
              cuentas={cuentasBanco}
              value={mp2CuentaId}
              onChange={setMp2CuentaId}
            />
          )}

          {mp2Id && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {mp1?.nombre ?? "Medio 1"} cubre {formatARS(valor1)} · {mp2?.nombre}{" "}
              {formatARS(valor2)} ={" "}
              <strong className="text-foreground">{formatARS(valorTotal)}</strong>
            </p>
          )}
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="observacion"
          className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Observación
        </label>
        <textarea
          id="observacion"
          name="observacion"
          rows={2}
          className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.observacion && (
          <p className="text-xs text-destructive">
            {errors.observacion.join(", ")}
          </p>
        )}
      </div>

      <GlobalError error={errors._} />

      <FormButtons
        cancelHref="/egresos"
        submitLabel={esCompraInsumo ? "Registrar compra" : "Registrar gasto"}
        pending={pending}
      />
    </form>
  );
}

function BancoSelector({
  name,
  label,
  cuentas,
  value,
  onChange,
}: {
  name: string;
  label: string;
  cuentas: CuentaBancaria[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {cuentas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No hay cuentas bancarias cargadas. Cargá Macro / Galicia en Catálogos →
          Cuentas bancarias.
        </p>
      ) : (
        <select
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— Cuenta por defecto del medio —</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
