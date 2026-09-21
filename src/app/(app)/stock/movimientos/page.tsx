import { listMovimientos } from "@/lib/data/stock";
import { formatDateTime } from "@/lib/utils";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";

const TIPO_LABEL: Record<string, string> = {
  compra: "Compra",
  venta: "Venta",
  ajuste_manual: "Ajuste manual",
  transferencia_entrada: "Transferencia ↘",
  transferencia_salida: "Transferencia ↗",
};

const TIPO_COLOR: Record<string, string> = {
  compra: "bg-sage-100 text-sage-900",
  venta: "bg-stone-100 text-stone-700",
  ajuste_manual: "bg-cream text-stone-700",
  transferencia_entrada: "bg-sage-50 text-sage-900",
  transferencia_salida: "bg-cream text-stone-700",
};

export default async function MovimientosPage() {
  await requireUser();
  const sucursal = await getActiveSucursal();
  if (!sucursal) return null;

  const movs = await listMovimientos({
    sucursalId: sucursal.id,
    limit: 200,
  });

  return (
    <div className="space-y-8 max-w-6xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Movimientos
        </h1>
        <p className="text-sm text-muted-foreground">
          {sucursal.nombre} · últimos {movs.length} movimientos
        </p>
      </header>

      {movs.length === 0 ? (
        <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
          No hay movimientos registrados todavía.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Fecha</th>
                <th className="text-left font-medium px-4 py-3">Tipo</th>
                <th className="text-left font-medium px-4 py-3">Insumo</th>
                <th className="text-right font-medium px-4 py-3">Cantidad</th>
                <th className="text-left font-medium px-4 py-3">Motivo</th>
                <th className="text-left font-medium px-4 py-3">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movs.map((m) => (
                <tr key={m.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {formatDateTime(m.fecha)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${TIPO_COLOR[m.tipo] ?? ""}`}
                    >
                      {TIPO_LABEL[m.tipo] ?? m.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{m.insumo_nombre}</td>
                  <td
                    className="px-4 py-3 text-right tabular-nums font-medium"
                    style={{
                      color:
                        m.cantidad < 0 ? "var(--danger)" : "var(--sage-700)",
                    }}
                  >
                    {m.cantidad > 0 ? "+" : ""}
                    {m.cantidad.toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.motivo ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.usuario_nombre}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
