import { getAperturaDeFecha } from "@/lib/data/apertura-caja";
import { getCierreCuentas, getCierreDeFecha, getEstadoCajaDelDia } from "@/lib/data/caja";
import { listCuentas, listMovimientos } from "@/lib/data/cuentas-bancarias";
import { listViaticos } from "@/lib/data/viaticos";
import { listDescuentos } from "@/lib/data/descuentos";
import {
  getGiftCardPorCodigo,
  getPasivoGiftCards,
  listGiftCards,
  listMovimientosGiftCard,
} from "@/lib/data/gift-cards";
import { listPagosProveedor, listProveedoresConTotal } from "@/lib/data/proveedores";
import { finDeDiaArISO, hoyAr, inicioDeDiaArISO } from "@/lib/fecha-ar";
import type { Rol } from "@/lib/types";
import type { ToolEntry } from "./registry";

/**
 * Herramientas para que la IA pueda contestar "no me cierra la caja" sin que
 * nadie le escriba a Luciano: apertura, estado del día por cuenta, cierre con
 * arqueo, movimientos de cada cuenta, viáticos, descuentos, gift cards y deuda
 * con proveedores. Todas leen con las funciones de pantalla (mismos permisos).
 *
 * Los montos van tal cual; los nombres de cuenta se agregan para que la IA no
 * tenga que cruzar IDs.
 */

const GESTION: Rol[] = ["superadmin", "admin", "encargada"];
type Args = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function fechaOHoy(a: Args): string {
  const f = str(a.fecha);
  return f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : hoyAr();
}

async function nombresDeCuentas(sucursalId: string): Promise<Map<string, string>> {
  const cuentas = await listCuentas({ sucursalId });
  return new Map(cuentas.map((c) => [c.id, `${c.nombre} (${c.tipo})`]));
}

function def(
  name: string,
  description: string,
  properties: Record<string, unknown> = {},
  required?: string[],
): ToolEntry["def"] {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, ...(required ? { required } : {}) },
    },
  };
}

const FECHA = { type: "string", description: "YYYY-MM-DD; default hoy" };

export const HERRAMIENTAS_CAJA: Record<string, ToolEntry> = {
  get_apertura_caja: {
    roles: GESTION,
    mode: "read",
    execute: async (a, ctx) => {
      const fecha = fechaOHoy(a);
      const apertura = await getAperturaDeFecha(ctx.sucursalId, fecha);
      if (!apertura) return { fecha, abierta: false };
      const nombres = await nombresDeCuentas(ctx.sucursalId);
      return {
        fecha,
        abierta: true,
        abierta_el: apertura.apertura.fecha_apertura,
        observacion: apertura.apertura.observacion,
        cuentas: apertura.cuentas.map((l) => ({
          cuenta: nombres.get(l.cuenta_id) ?? l.cuenta_id,
          esperado: l.saldo_esperado,
          declarado: l.saldo_declarado,
          diferencia: l.saldo_declarado - l.saldo_esperado,
        })),
      };
    },
    def: def(
      "get_apertura_caja",
      "Apertura de caja de un día: por cada cuenta, lo que el sistema esperaba al abrir y lo que declararon. Primer paso para explicar una diferencia de caja.",
      { fecha: FECHA },
    ),
  },

  get_estado_caja_dia: {
    roles: GESTION,
    mode: "read",
    execute: async (a, ctx) => {
      const fecha = fechaOHoy(a);
      const estado = await getEstadoCajaDelDia(ctx.sucursalId, fecha);
      return estado.map((e) => ({
        cuenta: `${e.cuenta.nombre} (${e.cuenta.tipo})`,
        cuenta_id: e.cuenta.id,
        saldo_inicial: e.saldoInicial,
        ingresos: e.ingresos,
        egresos: e.egresos,
        saldo_esperado: e.saldoEsperado,
      }));
    },
    def: def(
      "get_estado_caja_dia",
      "Estado de la caja de un día POR CUENTA: saldo con que se abrió + ingresos − egresos del día = saldo esperado. Es lo que tiene que haber en cada cuenta al cerrar.",
      { fecha: FECHA },
    ),
  },

  get_cierre_caja: {
    roles: GESTION,
    mode: "read",
    execute: async (a, ctx) => {
      const fecha = fechaOHoy(a);
      const cierre = await getCierreDeFecha(ctx.sucursalId, fecha);
      if (!cierre) return { fecha, cerrada: false };
      const arqueo = await getCierreCuentas(cierre.id);
      const { billetes, ...resto } = cierre;
      return {
        cerrada: true,
        ...resto,
        billetes_contados: billetes,
        arqueo: arqueo.map((x) => ({
          cuenta: x.cuenta ? `${x.cuenta.nombre} (${x.cuenta.tipo})` : x.linea.cuenta_id,
          esperado: x.linea.saldo_esperado,
          contado: x.linea.saldo_contado,
          diferencia: x.linea.saldo_contado - x.linea.saldo_esperado,
        })),
      };
    },
    def: def(
      "get_cierre_caja",
      "Cierre de caja de un día: totales por tipo (efectivo, banco, tarjetas, gift cards, anticipos...), billetes contados y el arqueo por cuenta (esperado vs contado y diferencia).",
      { fecha: FECHA },
    ),
  },

  list_movimientos_cuenta: {
    roles: GESTION,
    mode: "read",
    execute: async (a, ctx) => {
      const desde = str(a.desde);
      const hasta = str(a.hasta);
      const movs = await listMovimientos({
        sucursalId: ctx.sucursalId,
        cuentaId: str(a.cuentaId),
        desde: desde ? inicioDeDiaArISO(desde) : undefined,
        hasta: hasta ? finDeDiaArISO(hasta) : undefined,
        limit: Math.min(Number(a.limit) || 100, 300),
      });
      return movs.map((m) => ({
        fecha: m.movimiento.fecha,
        cuenta: m.cuenta ? `${m.cuenta.nombre} (${m.cuenta.tipo})` : m.movimiento.cuenta_id,
        tipo: m.movimiento.tipo,
        monto: m.movimiento.monto,
        origen: m.movimiento.ref_tipo,
        descripcion: m.movimiento.descripcion,
        usuario: m.usuarioNombre,
        anulado_por: m.anulacion?.descripcion,
      }));
    },
    def: def(
      "list_movimientos_cuenta",
      "Movimientos de las cuentas (efectivo, bancos, billeteras): cada venta, gasto, transferencia, ingreso manual o ajuste, con quién lo cargó. Para encontrar qué movió la plata de una cuenta.",
      {
        cuentaId: { type: "string", description: "Opcional; ver get_estado_caja_dia o list_cuentas_bancarias" },
        desde: { type: "string", description: "YYYY-MM-DD (incluido)" },
        hasta: { type: "string", description: "YYYY-MM-DD (incluido)" },
        limit: { type: "number", description: "Default 100, máximo 300" },
      },
    ),
  },

  list_viaticos: {
    roles: GESTION,
    mode: "read",
    execute: (a, ctx) =>
      listViaticos({
        sucursalId: ctx.sucursalId,
        empleadoId: str(a.empleadoId),
        desde: str(a.desde),
        hasta: str(a.hasta),
        soloPendientes: a.soloPendientes === true,
      }),
    def: def(
      "list_viaticos",
      "Viáticos de las empleadas: fecha, monto, si ya se entregó (pagado) y si entró en una liquidación. Un viático entregado genera un gasto en la caja de ese día.",
      {
        empleadoId: { type: "string" },
        desde: { type: "string", description: "YYYY-MM-DD" },
        hasta: { type: "string", description: "YYYY-MM-DD" },
        soloPendientes: { type: "boolean", description: "Solo los que no entraron en una liquidación" },
      },
    ),
  },

  list_descuentos: {
    roles: GESTION,
    mode: "read",
    execute: (a) => listDescuentos(String(a.empleadoId ?? "")),
    def: def(
      "list_descuentos",
      "Descuentos de una empleada: lo que se le cobra sin que salga plata de la caja (cursos, productos que se llevó), con su concepto y si ya se descontó en una liquidación.",
      { empleadoId: { type: "string" } },
      ["empleadoId"],
    ),
  },

  list_gift_cards: {
    roles: GESTION,
    mode: "read",
    execute: async (a, ctx) => {
      const [tarjetas, pasivo] = await Promise.all([
        listGiftCards({
          sucursalId: ctx.sucursalId,
          q: str(a.q),
          soloCanjeables: a.soloCanjeables === true,
        }),
        getPasivoGiftCards(ctx.sucursalId),
      ]);
      return { pendiente_de_canje: pasivo, total: tarjetas.length, tarjetas: tarjetas.slice(0, 100) };
    },
    def: def(
      "list_gift_cards",
      "Gift cards de la sucursal (código, importe, saldo, estado, vencimiento, compradora, beneficiaria) y cuánto queda pendiente de canje en total (vigente y vencido).",
      {
        q: { type: "string", description: "Busca por código, compradora o beneficiaria" },
        soloCanjeables: { type: "boolean" },
      },
    ),
  },

  get_gift_card: {
    roles: GESTION,
    mode: "read",
    execute: async (a, ctx) => {
      const tarjeta = await getGiftCardPorCodigo(ctx.sucursalId, String(a.codigo ?? ""));
      if (!tarjeta) return { encontrada: false };
      return { encontrada: true, tarjeta, movimientos: await listMovimientosGiftCard(tarjeta.id) };
    },
    def: def(
      "get_gift_card",
      "Una gift card por su código, con todos sus movimientos (emisión, canjes, anulación) y el saldo después de cada uno.",
      { codigo: { type: "string" } },
      ["codigo"],
    ),
  },

  list_proveedores: {
    roles: GESTION,
    mode: "read",
    execute: async (a, ctx) => {
      const provs = await listProveedoresConTotal({ sucursalId: ctx.sucursalId });
      return provs
        .filter((p) => a.soloConDeuda !== true || Math.abs(p.deuda_pendiente) > 0.005)
        .map((p) => ({
          id: p.id,
          nombre: p.nombre,
          deuda_pendiente: p.deuda_pendiente,
          total_comprado: p.total_comprado,
          cantidad_compras: p.cantidad_compras,
        }));
    },
    def: def(
      "list_proveedores",
      "Proveedores con lo que se les debe (deuda_pendiente: gastos impagos menos pagos a cuenta) y lo comprado en la sucursal. La deuda es del proveedor, no de una sucursal.",
      { soloConDeuda: { type: "boolean" } },
    ),
  },

  list_pagos_proveedor: {
    roles: GESTION,
    mode: "read",
    execute: (a) => listPagosProveedor(String(a.proveedorId ?? "")),
    def: def(
      "list_pagos_proveedor",
      "Pagos a cuenta hechos a un proveedor (fecha, monto, medio, si se anuló). Requiere proveedorId (ver list_proveedores).",
      { proveedorId: { type: "string" } },
      ["proveedorId"],
    ),
  },
};
