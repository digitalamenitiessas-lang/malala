import type OpenAI from "openai";
import { eq } from "drizzle-orm";
import type { Rol } from "@/lib/types";
import { getDb } from "@/lib/db/client/postgres";
import { finDeDiaArISO, hoyAr, inicioDeDiaArISO } from "@/lib/fecha-ar";
import { turnos as turnosTable } from "@/lib/db/schema";
import { listTurnos } from "@/lib/data/turnos";
import { listIngresos } from "@/lib/data/ingresos";
import { listEgresos } from "@/lib/data/egresos";
import { listStockBySucursal, listMovimientos } from "@/lib/data/stock";
import { listEmpleados } from "@/lib/data/empleados";
import { listSucursales } from "@/lib/data/sucursales";
import { listClientes } from "@/lib/data/clientes";
import { getAnalyticsSnapshot } from "@/lib/data/analytics";
import { getDashboardData } from "@/lib/data/dashboard";
import { getResumenDelDia } from "@/lib/data/caja";
import { listLiquidaciones } from "@/lib/data/liquidaciones";
import { listCuentas, listSaldos } from "@/lib/data/cuentas-bancarias";
import { listMovimientosCc } from "@/lib/data/cuenta-corriente";
import { listServicios } from "@/lib/data/servicios";
import { listPromociones } from "@/lib/data/promociones";
import { listAnticipos } from "@/lib/data/anticipos";
import { HERRAMIENTAS_CAJA } from "./herramientas-caja";
import { cargarManual, consultarManual } from "@/lib/mcp/manual";
import {
  createAdminTurnoAction,
  reprogramTurnoAction,
  updateTurnoEstadoAction,
} from "@/lib/data/turnos-actions";

export type ToolMode = "read" | "write";

/**
 * Contexto inyectado en cada tool. `sucursalId` es la sucursal ACTIVA de la
 * sesión: el chatbot opera exclusivamente sobre ella. Las tools nunca aceptan
 * una sucursal del modelo; se fuerza siempre este valor.
 */
export interface ToolContext {
  sucursalId: string;
}

type ToolDef = OpenAI.Chat.Completions.ChatCompletionTool;
type Args = Record<string, unknown>;

export interface ToolEntry {
  def: ToolDef;
  /** Roles que pueden usar la tool. superadmin hereda lo de admin (ver `roleAllowed`). */
  roles: Rol[];
  mode: ToolMode;
  execute: (args: Args, ctx: ToolContext) => Promise<unknown>;
  /** Solo para tools `write`: resumen legible para la tarjeta de confirmación. */
  summarize?: (args: Args) => string;
}

// Grupos de roles. superadmin se incluye explícito para que el filtrado por
// rol no dependa solo de `roleAllowed`.
const TODOS: Rol[] = ["superadmin", "admin", "encargada", "empleado"];
const GESTION: Rol[] = ["superadmin", "admin", "encargada"];

/** superadmin es superset de admin para permisos. */
export function roleAllowed(entryRoles: Rol[], rol: Rol): boolean {
  if (entryRoles.includes(rol)) return true;
  if (rol === "superadmin" && entryRoles.includes("admin")) return true;
  return false;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rango de fechas que manda el modelo, en hora de Argentina. El modelo pide
 * "2026-11-02" y listIngresos/listEgresos lo leían como medianoche UTC (las 21 h
 * del día anterior acá): "ventas del 02/11" daba vacío con la caja en $911.425.
 * Un día suelto va de su primer a su último instante; un ISO completo se respeta.
 */
export function rangoAr(a: Args): { desde?: string; hasta?: string } {
  const desde = str(a.desde);
  const hasta = str(a.hasta);
  return {
    desde: desde && YMD.test(desde) ? inicioDeDiaArISO(desde) : desde,
    hasta: hasta && YMD.test(hasta) ? finDeDiaArISO(hasta) : hasta,
  };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** Verifica que un turno pertenezca a la sucursal activa (confinamiento de escritura). */
async function turnoEnSucursal(turnoId: string, sucursalId: string): Promise<boolean> {
  if (!turnoId) return false;
  const db = getDb();
  const [row] = await db
    .select({ sucursalId: turnosTable.sucursalId })
    .from(turnosTable)
    .where(eq(turnosTable.id, turnoId))
    .limit(1);
  return row?.sucursalId === sucursalId;
}

function fueraDeSucursal() {
  return { ok: false as const, errors: { _: ["El turno no pertenece a tu sucursal activa."] } };
}

const REGISTRY: Record<string, ToolEntry> = {
  // ───────────────────────── Lectura: catálogo / operación ─────────────────────────
  list_sucursales: {
    roles: TODOS,
    mode: "read",
    // Solo expone la sucursal activa; el bot no debe conocer otras.
    execute: async (_a, ctx) =>
      (await listSucursales({})).filter((s) => s.id === ctx.sucursalId),
    def: {
      type: "function",
      function: {
        name: "list_sucursales",
        description: "Devuelve los datos de tu sucursal activa (ID y nombre).",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  list_servicios: {
    roles: TODOS,
    mode: "read",
    execute: (a, ctx) =>
      listServicios({
        incluirInactivos: a.incluirInactivos as boolean | undefined,
        sucursalId: ctx.sucursalId,
      }),
    def: {
      type: "function",
      function: {
        name: "list_servicios",
        description: "Lista los servicios del catálogo con precio y duración.",
        parameters: {
          type: "object",
          properties: { incluirInactivos: { type: "boolean" } },
        },
      },
    },
  },
  list_promociones: {
    roles: TODOS,
    mode: "read",
    execute: (a, ctx) =>
      listPromociones({
        incluirInactivas: a.incluirInactivas as boolean | undefined,
        sucursalId: ctx.sucursalId,
      }),
    def: {
      type: "function",
      function: {
        name: "list_promociones",
        description: "Lista las promociones vigentes (precios promocionales).",
        parameters: {
          type: "object",
          properties: { incluirInactivas: { type: "boolean" } },
        },
      },
    },
  },
  list_clientes: {
    roles: TODOS,
    mode: "read",
    execute: async (a, ctx) =>
      (
        await listClientes({
          q: a.q as string | undefined,
          incluirInactivos: a.incluirInactivos as boolean | undefined,
          sucursalId: ctx.sucursalId,
        })
      ).slice(0, 100),
    def: {
      type: "function",
      function: {
        name: "list_clientes",
        description: "Lista clientes. Acepta búsqueda por nombre.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Texto a buscar en nombre" },
            incluirInactivos: { type: "boolean" },
          },
        },
      },
    },
  },
  list_turnos: {
    roles: TODOS,
    mode: "read",
    execute: async (a, ctx) =>
      (
        await listTurnos({
          fecha: a.fecha as string | undefined,
          sucursalId: ctx.sucursalId,
          profesionalId: a.profesionalId as string | undefined,
          estado: a.estado as string | undefined,
        })
      ).slice(0, 200),
    def: {
      type: "function",
      function: {
        name: "list_turnos",
        description:
          "Lista turnos (citas) de tu sucursal activa. Filtros opcionales por fecha (YYYY-MM-DD), profesional y estado.",
        parameters: {
          type: "object",
          properties: {
            fecha: { type: "string", description: "YYYY-MM-DD" },
            profesionalId: { type: "string" },
            estado: {
              type: "string",
              enum: ["pendiente", "realizado", "ausente", "cancelado"],
            },
          },
        },
      },
    },
  },

  // ───────────────────────── Lectura: gestión / finanzas ─────────────────────────
  list_empleados: {
    roles: GESTION,
    mode: "read",
    execute: (a, ctx) =>
      listEmpleados({
        sucursalId: ctx.sucursalId,
        incluirInactivos: a.incluirInactivos as boolean | undefined,
      }),
    def: {
      type: "function",
      function: {
        name: "list_empleados",
        description:
          "Lista empleados/profesionales de tu sucursal activa con su configuración de comisiones.",
        parameters: {
          type: "object",
          properties: { incluirInactivos: { type: "boolean" } },
        },
      },
    },
  },
  list_ingresos: {
    roles: GESTION,
    mode: "read",
    execute: async (a, ctx) =>
      (
        await listIngresos({
          sucursalId: ctx.sucursalId,
          empleadoId: a.empleadoId as string | undefined,
          clienteId: a.clienteId as string | undefined,
          ...rangoAr(a),
          incluirAnulados: a.incluirAnulados as boolean | undefined,
        })
      ).slice(0, 200),
    def: {
      type: "function",
      function: {
        name: "list_ingresos",
        description:
          "Lista ingresos/ventas de tu sucursal activa. Filtros por empleado, cliente y rango de fechas.",
        parameters: {
          type: "object",
          properties: {
            empleadoId: { type: "string" },
            clienteId: { type: "string" },
            desde: { type: "string", description: "YYYY-MM-DD (incluido)" },
            hasta: { type: "string", description: "YYYY-MM-DD (incluido)" },
            incluirAnulados: { type: "boolean" },
          },
        },
      },
    },
  },
  list_egresos: {
    roles: GESTION,
    mode: "read",
    execute: async (a, ctx) =>
      (
        await listEgresos({
          sucursalId: ctx.sucursalId,
          rubroId: a.rubroId as string | undefined,
          proveedorId: a.proveedorId as string | undefined,
          ...rangoAr(a),
          soloPendientes: a.soloPendientes as boolean | undefined,
        })
      ).slice(0, 200),
    def: {
      type: "function",
      function: {
        name: "list_egresos",
        description:
          "Lista egresos/gastos de tu sucursal activa. Filtros por rubro, proveedor, rango y soloPendientes.",
        parameters: {
          type: "object",
          properties: {
            rubroId: { type: "string" },
            proveedorId: { type: "string" },
            desde: { type: "string", description: "YYYY-MM-DD (incluido)" },
            hasta: { type: "string", description: "YYYY-MM-DD (incluido)" },
            soloPendientes: { type: "boolean" },
          },
        },
      },
    },
  },
  list_stock: {
    roles: GESTION,
    mode: "read",
    execute: (_a, ctx) => listStockBySucursal(ctx.sucursalId),
    def: {
      type: "function",
      function: {
        name: "list_stock",
        description: "Lista el stock de insumos de tu sucursal activa.",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  list_movimientos_stock: {
    roles: GESTION,
    mode: "read",
    execute: (a, ctx) =>
      listMovimientos({
        sucursalId: ctx.sucursalId,
        insumoId: a.insumoId as string | undefined,
        limit: (a.limit as number | undefined) ?? 50,
      }),
    def: {
      type: "function",
      function: {
        name: "list_movimientos_stock",
        description:
          "Últimos movimientos de stock de tu sucursal activa (compras, ventas, ajustes, transferencias).",
        parameters: {
          type: "object",
          properties: {
            insumoId: { type: "string" },
            limit: { type: "number", description: "Default 50" },
          },
        },
      },
    },
  },
  get_analytics: {
    roles: GESTION,
    mode: "read",
    execute: (a, ctx) =>
      getAnalyticsSnapshot({
        desde: a.desde as string | undefined,
        hasta: a.hasta as string | undefined,
        sucursalId: ctx.sucursalId,
        empleadoId: a.empleadoId as string | undefined,
        rubro: a.rubro as string | undefined,
      }),
    def: {
      type: "function",
      function: {
        name: "get_analytics",
        description:
          "Snapshot analítico de tu sucursal activa: KPIs (ingresos, neto, ocupación, cancelaciones), distribución por profesional/servicio, stock crítico. Acepta filtros de rango.",
        parameters: {
          type: "object",
          properties: {
            desde: { type: "string", description: "YYYY-MM-DD" },
            hasta: { type: "string", description: "YYYY-MM-DD" },
            empleadoId: { type: "string" },
            rubro: { type: "string" },
          },
        },
      },
    },
  },
  get_dashboard: {
    roles: GESTION,
    mode: "read",
    execute: (_a, ctx) => getDashboardData(ctx.sucursalId),
    def: {
      type: "function",
      function: {
        name: "get_dashboard",
        description:
          "Dashboard de tu sucursal activa: ventas hoy/mes, tickets, comisiones, stock crítico, top servicios y empleados.",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  get_resumen_caja: {
    roles: GESTION,
    mode: "read",
    execute: (a, ctx) => {
      const fecha = (a.fecha as string | undefined) ?? hoyAr();
      return getResumenDelDia(ctx.sucursalId, fecha);
    },
    def: {
      type: "function",
      function: {
        name: "get_resumen_caja",
        description:
          "Resumen del día de caja de tu sucursal activa: medios de pago, tickets, comisiones por empleado.",
        parameters: {
          type: "object",
          properties: {
            fecha: { type: "string", description: "YYYY-MM-DD; default hoy" },
          },
        },
      },
    },
  },
  list_liquidaciones: {
    roles: GESTION,
    mode: "read",
    execute: (a, ctx) =>
      listLiquidaciones({
        sucursalId: ctx.sucursalId,
        empleadoId: a.empleadoId as string | undefined,
        estado: a.estado as never,
        limit: a.limit as number | undefined,
      }),
    def: {
      type: "function",
      function: {
        name: "list_liquidaciones",
        description:
          "Lista liquidaciones de comisiones/sueldos de tu sucursal activa. Filtros por empleado y estado.",
        parameters: {
          type: "object",
          properties: {
            empleadoId: { type: "string" },
            estado: { type: "string", enum: ["pendiente", "pagada", "anulada"] },
            limit: { type: "number" },
          },
        },
      },
    },
  },
  list_cuentas_bancarias: {
    roles: GESTION,
    mode: "read",
    execute: (_a, ctx) => listCuentas({ sucursalId: ctx.sucursalId }),
    def: {
      type: "function",
      function: {
        name: "list_cuentas_bancarias",
        description: "Lista las cuentas bancarias/billeteras de tu sucursal activa.",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  list_saldos_bancarios: {
    roles: GESTION,
    mode: "read",
    execute: (_a, ctx) => listSaldos({ sucursalId: ctx.sucursalId }),
    def: {
      type: "function",
      function: {
        name: "list_saldos_bancarios",
        description: "Saldos actuales por cuenta bancaria/billetera de tu sucursal activa.",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  get_cuenta_corriente_cliente: {
    roles: GESTION,
    mode: "read",
    execute: (a) => listMovimientosCc(a.clienteId as string),
    def: {
      type: "function",
      function: {
        name: "get_cuenta_corriente_cliente",
        description:
          "Movimientos de cuenta corriente (deuda/pagos) de un cliente. Requiere clienteId.",
        parameters: {
          type: "object",
          properties: { clienteId: { type: "string" } },
          required: ["clienteId"],
        },
      },
    },
  },
  list_anticipos: {
    roles: GESTION,
    mode: "read",
    execute: (a) => listAnticipos(a.empleadoId as string),
    def: {
      type: "function",
      function: {
        name: "list_anticipos",
        description:
          "Lista los anticipos otorgados a un empleado de tu sucursal. Requiere empleadoId (obtenelo con list_empleados).",
        parameters: {
          type: "object",
          properties: { empleadoId: { type: "string" } },
          required: ["empleadoId"],
        },
      },
    },
  },

  // ───────────────────────── Escritura: turnos (confirmación 2 fases) ─────────────────────────
  cambiar_estado_turno: {
    roles: GESTION,
    mode: "write",
    summarize: (a) =>
      `Cambiar el estado del turno ${str(a.turno_id) ?? "?"} a "${str(a.estado) ?? "?"}".`,
    execute: async (a, ctx) => {
      const turnoId = String(a.turno_id ?? "");
      if (!(await turnoEnSucursal(turnoId, ctx.sucursalId))) return fueraDeSucursal();
      const fd = new FormData();
      fd.set("turno_id", turnoId);
      fd.set("estado", String(a.estado ?? ""));
      return updateTurnoEstadoAction(fd);
    },
    def: {
      type: "function",
      function: {
        name: "cambiar_estado_turno",
        description:
          "Cambia el estado de un turno de tu sucursal activa (marcar ausente, cancelar, o volver a pendiente). 'realizado' es automático al llegar la hora, no se setea. Requiere confirmación del usuario.",
        parameters: {
          type: "object",
          properties: {
            turno_id: { type: "string" },
            estado: {
              type: "string",
              enum: ["pendiente", "cancelado", "ausente"],
            },
          },
          required: ["turno_id", "estado"],
        },
      },
    },
  },
  reprogramar_turno: {
    roles: GESTION,
    mode: "write",
    summarize: (a) =>
      `Reprogramar el turno ${str(a.turno_id) ?? "?"} para el ${str(a.fecha_turno) ?? "?"} a las ${str(a.hora) ?? "?"}.`,
    execute: async (a, ctx) => {
      const turnoId = String(a.turno_id ?? "");
      if (!(await turnoEnSucursal(turnoId, ctx.sucursalId))) return fueraDeSucursal();
      const fd = new FormData();
      fd.set("turno_id", turnoId);
      fd.set("fecha_turno", String(a.fecha_turno ?? ""));
      fd.set("hora", String(a.hora ?? ""));
      fd.set("profesional_id", String(a.profesional_id ?? ""));
      return reprogramTurnoAction(fd);
    },
    def: {
      type: "function",
      function: {
        name: "reprogramar_turno",
        description:
          "Reprograma un turno de tu sucursal activa a nueva fecha/hora/profesional. Requiere confirmación del usuario.",
        parameters: {
          type: "object",
          properties: {
            turno_id: { type: "string" },
            fecha_turno: { type: "string", description: "YYYY-MM-DD" },
            hora: { type: "string", description: "HH:MM" },
            profesional_id: { type: "string" },
          },
          required: ["turno_id", "fecha_turno", "hora", "profesional_id"],
        },
      },
    },
  },
  crear_turno: {
    roles: GESTION,
    mode: "write",
    summarize: (a) =>
      `Crear turno para ${str(a.cliente_nombre) ?? "?"} (${str(a.cliente_telefono) ?? "sin tel."}) el ${str(a.fecha_turno) ?? "?"} a las ${str(a.hora) ?? "?"}.`,
    execute: (a, ctx) => {
      const fd = new FormData();
      fd.set("sucursal_id", ctx.sucursalId); // forzado a la sucursal activa
      fd.set("servicio_id", String(a.servicio_id ?? ""));
      fd.set("profesional_id", String(a.profesional_id ?? ""));
      fd.set("fecha_turno", String(a.fecha_turno ?? ""));
      fd.set("hora", String(a.hora ?? ""));
      fd.set("cliente_nombre", String(a.cliente_nombre ?? ""));
      fd.set("cliente_telefono", String(a.cliente_telefono ?? ""));
      if (str(a.cliente_email)) fd.set("cliente_email", String(a.cliente_email));
      if (str(a.observacion)) fd.set("observacion", String(a.observacion));
      fd.set("canal", "recepcion");
      fd.set("origen", "interno");
      return createAdminTurnoAction(null, fd);
    },
    def: {
      type: "function",
      function: {
        name: "crear_turno",
        description:
          "Crea un nuevo turno en tu sucursal activa. Requiere confirmación del usuario. Conseguí antes los IDs de servicio y profesional con las tools de lectura.",
        parameters: {
          type: "object",
          properties: {
            servicio_id: { type: "string" },
            profesional_id: { type: "string" },
            fecha_turno: { type: "string", description: "YYYY-MM-DD" },
            hora: { type: "string", description: "HH:MM" },
            cliente_nombre: { type: "string" },
            cliente_telefono: { type: "string" },
            cliente_email: { type: "string" },
            observacion: { type: "string" },
          },
          required: [
            "servicio_id",
            "profesional_id",
            "fecha_turno",
            "hora",
            "cliente_nombre",
            "cliente_telefono",
          ],
        },
      },
    },
  },

  // ───────────────────────── Lectura: detalle de caja ─────────────────────────
  ...HERRAMIENTAS_CAJA,

  // ───────────────────────── Manual de uso ─────────────────────────
  ayuda: {
    roles: TODOS,
    mode: "read",
    execute: async (a) =>
      consultarManual(cargarManual(), { tema: str(a.tema), buscar: str(a.buscar) }),
    def: {
      type: "function",
      function: {
        name: "ayuda",
        description:
          "Manual de uso del sistema: cómo se hace cada cosa (abrir y cerrar caja, ventas, gift cards, gastos, viáticos, liquidaciones, stock, reportes...). Usala SIEMPRE que pregunten cómo hacer algo en el sistema, antes de contestar. Sin argumentos lista los temas; con buscar trae los más parecidos; con tema trae uno entero.",
        parameters: {
          type: "object",
          properties: {
            buscar: { type: "string", description: "La pregunta en palabras de la persona" },
            tema: { type: "string", description: "ID de un tema de la lista" },
          },
        },
      },
    },
  },
};

export function getToolEntry(name: string): ToolEntry | undefined {
  return REGISTRY[name];
}

/** Tools disponibles para un rol: definiciones para el modelo + lookup por nombre. */
export function toolsForRole(rol: Rol): {
  defs: ToolDef[];
  entries: Record<string, ToolEntry>;
} {
  const entries: Record<string, ToolEntry> = {};
  const defs: ToolDef[] = [];
  for (const [name, entry] of Object.entries(REGISTRY)) {
    if (!roleAllowed(entry.roles, rol)) continue;
    entries[name] = entry;
    defs.push(entry.def);
  }
  return { defs, entries };
}
