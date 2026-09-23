import { notFound } from "next/navigation";
import { getIngreso } from "@/lib/data/ingresos";
import { setSatisfaccionVenta } from "@/lib/data/ingresos-actions";
import { requireUser } from "@/lib/auth/session";
import { listSucursales } from "@/lib/data/sucursales";
import { listMotivosDescuento } from "@/lib/data/motivos-descuento";
import { listCuentas } from "@/lib/data/cuentas-bancarias";
import { SatisfaccionVentaForm } from "@/components/forms/satisfaccion-venta";
import { AnularVenta } from "@/components/forms/anular-venta";
import { CambiarClienteVenta } from "@/components/forms/cambiar-cliente-venta";
import { BaseComisionVenta } from "@/components/forms/base-comision-venta";
import { comisionMontoServicio } from "@/lib/data/ingresos-helpers";
import { formatARS, formatDateTimeLong } from "@/lib/utils";

export default async function VentaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const puedeRevisar = user.rol === "admin" || user.rol === "encargada";
  const { id } = await params;
  const [row, sucursales, motivos, cuentas] = await Promise.all([
    getIngreso(id),
    listSucursales(),
    listMotivosDescuento(),
    listCuentas(),
  ]);
  if (!row) notFound();

  const { ingreso, cliente, mp1, mp2, lineas, breakdown } = row;
  const sucursal = sucursales.find((item) => item.id === ingreso.sucursal_id);
  const motivoDescuento = ingreso.descuento_motivo_id
    ? motivos.find((m) => m.id === ingreso.descuento_motivo_id)
    : null;
  const cuentaById = new Map(cuentas.map((c) => [c.id, c]));
  const banco1 = ingreso.mp1_cuenta_id
    ? cuentaById.get(ingreso.mp1_cuenta_id)?.nombre
    : null;
  const banco2 = ingreso.mp2_cuenta_id
    ? cuentaById.get(ingreso.mp2_cuenta_id)?.nombre
    : null;
  const recargoCobrado =
    (ingreso.valor1 + (ingreso.valor2 ?? 0)) - ingreso.total;

  // Las dos lecturas posibles de la misma venta, en pesos. Se calculan siempre
  // porque el control sólo tiene sentido mostrando ambos números: "la empleada
  // absorbe el descuento" se entiende al revés la mitad de las veces.
  const lineasServicio = lineas.filter((l) => l.servicio_id && l.comision_pct > 0);
  const comisionProductos = lineas
    .filter((l) => !l.servicio_id)
    .reduce((acc, l) => acc + l.comision_monto, 0);
  const totalComisionCon = (sobreLoCobrado: boolean) =>
    comisionProductos +
    lineasServicio.reduce(
      (acc, l) =>
        acc +
        comisionMontoServicio({
          precioEfectivo: l.subtotal,
          comisionPct: l.comision_pct,
          soportaDescuento: sobreLoCobrado,
          precioLista: l.servicio?.precio_lista,
          subtotal: ingreso.subtotal,
          descuentoMonto: ingreso.descuento_monto,
        }),
      0,
    );
  // Con descuento en cero los dos criterios dan lo mismo: ofrecer la opción
  // sería pedir una decisión que no cambia nada.
  const puedeElegirBaseComision =
    puedeRevisar && ingreso.descuento_monto > 0 && lineasServicio.length > 0;

  async function marcarSatisfaccion(_prev: unknown, formData: FormData) {
    "use server";
    return await setSatisfaccionVenta(formData);
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Ticket
        </h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {formatDateTimeLong(ingreso.fecha)}{" "}
          · {sucursal?.nombre ?? "—"}
        </p>
      </header>

      {/* Datos del ticket */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-md p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Cliente
          </p>
          <p className="text-base font-medium mt-1">
            {cliente?.nombre ?? "Consumidor Final"}
          </p>
          {cliente?.telefono && (
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {cliente.telefono}
            </p>
          )}
          {puedeRevisar && (
            <CambiarClienteVenta
              ingresoId={ingreso.id}
              sucursalId={ingreso.sucursal_id}
              clienteActualNombre={cliente?.nombre ?? null}
              anulado={ingreso.anulado}
            />
          )}
        </div>
        <div className="bg-card border border-border rounded-md p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Pago
          </p>
          <p className="text-sm mt-1 tabular-nums">
            {mp1?.nombre ?? "—"}
            {banco1 ? ` · ${banco1}` : ""}: {formatARS(ingreso.valor1)}
          </p>
          {mp2 && ingreso.valor2 != null && (
            <p className="text-sm mt-0.5 tabular-nums">
              {mp2.nombre}
              {banco2 ? ` · ${banco2}` : ""}: {formatARS(ingreso.valor2)}
            </p>
          )}
          {recargoCobrado > 0.01 && (
            <p className="text-xs text-warning mt-0.5 tabular-nums">
              Incluye recargo: {formatARS(recargoCobrado)}
            </p>
          )}
        </div>
        <div className="bg-card border border-border rounded-md p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Subtotal · Descuento · Total
          </p>
          <p className="text-sm mt-1 tabular-nums">
            {formatARS(ingreso.subtotal)}
            {ingreso.descuento_pct > 0 && (
              <span className="text-muted-foreground">
                {" "}
                − {ingreso.descuento_pct}% ({formatARS(ingreso.descuento_monto)})
              </span>
            )}
          </p>
          {ingreso.descuento_monto > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Motivo: {motivoDescuento?.nombre ?? "—"}
            </p>
          )}
          <p className="font-display text-xl mt-1 tabular-nums">
            {formatARS(ingreso.total)}
          </p>
        </div>
      </div>

      {puedeRevisar && (
        <AnularVenta
          ingresoId={ingreso.id}
          total={ingreso.total}
          anulado={ingreso.anulado}
        />
      )}

      {/* Satisfacción del cliente */}
      <SatisfaccionVentaForm
        ingresoId={ingreso.id}
        satisfecho={ingreso.cliente_satisfecho}
        nota={ingreso.satisfaccion_nota}
        puedeEditar={puedeRevisar}
        action={marcarSatisfaccion}
      />

      {/* Líneas */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Líneas del ticket
        </h2>
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Ítem</th>
                <th className="text-left font-medium px-4 py-3">Empleado</th>
                <th className="text-right font-medium px-4 py-3">Cant.</th>
                <th className="text-right font-medium px-4 py-3">Precio</th>
                <th className="text-right font-medium px-4 py-3">Comisión</th>
                <th className="text-right font-medium px-4 py-3">Insumos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lineas.map((l) => {
                const esProducto = !!l.insumo;
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span>
                          {l.servicio?.nombre ?? l.insumo?.nombre ?? "—"}
                        </span>
                        {esProducto && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sage-100 text-sage-700">
                            Producto
                          </span>
                        )}
                      </div>
                      {l.servicio && (
                        <p className="text-xs text-muted-foreground">
                          {l.servicio.rubro}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {l.empleado?.nombre ?? (
                        <span className="text-muted-foreground italic">
                          {esProducto ? "—" : "sin asignar"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {l.cantidad}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatARS(l.subtotal)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {esProducto ? (
                        <span className="text-xs">—</span>
                      ) : (
                        <>
                          {formatARS(l.comision_monto)}
                          <span className="text-xs"> ({l.comision_pct}%)</span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {formatARS(l.costoInsumos)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reparto operativo: cuánto va a cada uno */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Reparto del ticket
        </h2>
        <div className="bg-card border border-border rounded-md overflow-hidden">
          {(() => {
            // Agrupar comisiones por empleado
            const porEmpleado = new Map<
              string,
              { nombre: string; total: number; lineas: number }
            >();
            for (const l of lineas) {
              if (!l.empleado) continue;
              const cur = porEmpleado.get(l.empleado.id) ?? {
                nombre: l.empleado.nombre,
                total: 0,
                lineas: 0,
              };
              cur.total += l.comision_monto;
              cur.lineas += 1;
              porEmpleado.set(l.empleado.id, cur);
            }
            const empleadosArr = Array.from(porEmpleado.values()).sort(
              (a, b) => b.total - a.total,
            );
            const paraElLocal =
              breakdown.total - breakdown.comisiones;

            return (
              <>
                {empleadosArr.map((e) => (
                  <div
                    key={e.nombre}
                    className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{e.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.lineas} línea{e.lineas !== 1 ? "s" : ""} ·{" "}
                        {breakdown.total > 0
                          ? `${((e.total / breakdown.total) * 100).toFixed(0)}% del total`
                          : "—"}
                      </p>
                    </div>
                    <p
                      className="font-display text-xl tabular-nums"
                      style={{ color: "var(--sage-700)" }}
                    >
                      {formatARS(e.total)}
                    </p>
                  </div>
                ))}

                <div
                  className="flex items-center justify-between px-4 py-3 bg-cream/40 border-t border-border"
                  style={{ borderTopStyle: "dashed" }}
                >
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wider text-xs">
                      Para el local
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Total − comisiones del equipo
                    </p>
                  </div>
                  <p
                    className="font-display text-xl tabular-nums"
                    style={{
                      color:
                        paraElLocal >= 0 ? "var(--ink)" : "var(--danger)",
                    }}
                  >
                    {formatARS(paraElLocal)}
                  </p>
                </div>
              </>
            );
          })()}
        </div>
        {puedeElegirBaseComision ? (
          <BaseComisionVenta
            ingresoId={ingreso.id}
            totalSobreCobrado={totalComisionCon(true)}
            totalSobreLista={totalComisionCon(false)}
            sobreLoCobrado={lineasServicio.every((l) => l.soporta_descuento)}
            anulado={ingreso.anulado}
          />
        ) : null}
        <p className="text-xs text-muted-foreground">
          La liquidación efectiva por mes se calcula al cierre de caja.
        </p>
      </section>

      {/* Desglose financiero (analítico, descuenta también costo de insumos) */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Desglose financiero
        </h2>
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <FlowRow
            label="Cobrado al cliente"
            value={breakdown.total}
            tone="bold"
          />
          <FlowRow
            label="− Comisiones del equipo"
            value={-breakdown.comisiones}
            tone="muted"
          />
          <FlowRow
            label="− Costo de insumos"
            value={-breakdown.costoInsumos}
            tone="muted"
          />
          <FlowRow
            label="= Neto para el negocio"
            value={breakdown.neto}
            tone="result"
          />
        </div>
      </section>

      {ingreso.observacion && (
        <section className="bg-cream/40 border border-border rounded-md p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Observación
          </p>
          <p className="text-sm">{ingreso.observacion}</p>
        </section>
      )}
    </div>
  );
}

function FlowRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "bold" | "muted" | "result";
}) {
  const valueStyle =
    tone === "result"
      ? {
          color: value >= 0 ? "var(--sage-700)" : "var(--danger)",
        }
      : undefined;
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 ${
        tone === "result" ? "bg-cream/40 border-t border-border" : ""
      }`}
    >
      <p
        className={`text-sm ${tone === "muted" ? "text-muted-foreground" : ""} ${
          tone === "result" ? "font-semibold uppercase tracking-wider text-xs" : ""
        }`}
      >
        {label}
      </p>
      <p
        className={`tabular-nums ${
          tone === "bold" || tone === "result"
            ? "font-display text-xl"
            : "text-sm text-muted-foreground"
        }`}
        style={valueStyle}
      >
        {formatARS(value)}
      </p>
    </div>
  );
}
