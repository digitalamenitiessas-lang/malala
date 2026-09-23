"use server";

import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client/postgres";
import {
  aperturasCaja as aperturasCajaTable,
  clientes as clientesTable,
  cierresCaja as cierresCajaTable,
  empleados as empleadosTable,
  ingresoLineas as ingresoLineasTable,
  ingresos as ingresosTable,
  insumos as insumosTable,
  mediosPago as mediosPagoTable,
  movimientosCc as movimientosCcTable,
  recetas as recetasTable,
  servicios as serviciosTable,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { buildAccessScope, isSucursalAllowed } from "@/lib/auth/access";
import {
  buildCostoInsumosByServicio,
  comisionMontoServicio,
  computeBreakdown,
  computeDescuento,
  computeRecargos,
  detallarLineas,
  type IngresoConDetalle,
} from "./ingresos-helpers";
import { ingresoSchema } from "@/lib/validations/ingreso";
import { fieldErrors, requireRole } from "./_helpers";
import { applyMovementTx } from "./stock";
import {
  emitMovimientoBancarioTx,
  getCuentaIdForMpTx,
} from "./movimientos-bancarios-helpers";
import { canjearGiftCardTx } from "./gift-cards";
import type {
  Cliente,
  Empleado,
  Ingreso,
  IngresoLinea,
  Insumo,
  MedioPago,
  Receta,
  Servicio,
} from "@/lib/types";
import { hoyAr } from "@/lib/fecha-ar";

export interface IngresoFiltros {
  sucursalId?: string;
  empleadoId?: string;
  clienteId?: string;
  desde?: string; // ISO
  hasta?: string; // ISO
  incluirAnulados?: boolean;
  revision?: "ok" | "error" | "sin"; // "sin" = sin revisar
}

function createId() {
  return crypto.randomUUID();
}

function mapIngreso(row: typeof ingresosTable.$inferSelect): Ingreso {
  return {
    id: row.id,
    fecha: row.fecha.toISOString(),
    sucursal_id: row.sucursalId,
    cliente_id: row.clienteId ?? undefined,
    subtotal: row.subtotal,
    descuento_pct: row.descuentoPct,
    descuento_monto: row.descuentoMonto,
    descuento_motivo_id: row.descuentoMotivoId ?? undefined,
    total: row.total,
    mp1_id: row.mp1Id,
    valor1: row.valor1,
    mp1_cuenta_id: row.mp1CuentaId ?? undefined,
    mp2_id: row.mp2Id ?? undefined,
    valor2: row.valor2 ?? undefined,
    mp2_cuenta_id: row.mp2CuentaId ?? undefined,
    observacion: row.observacion ?? undefined,
    usuario_id: row.usuarioId,
    anulado: row.anulado,
    // Se reutiliza la columna `revision`: "ok" = satisfecho, "error" = no satisfecho.
    cliente_satisfecho:
      row.revision === "ok" ? true : row.revision === "error" ? false : undefined,
    satisfaccion_nota: row.revisionNota ?? undefined,
  };
}

function mapIngresoLinea(row: typeof ingresoLineasTable.$inferSelect): IngresoLinea {
  return {
    id: row.id,
    ingreso_id: row.ingresoId,
    servicio_id: row.servicioId ?? undefined,
    insumo_id: row.insumoId ?? undefined,
    empleado_id: row.empleadoId ?? undefined,
    precio_efectivo: row.precioEfectivo,
    cantidad: row.cantidad,
    subtotal: row.subtotal,
    comision_pct: row.comisionPct,
    comision_monto: row.comisionMonto,
    soporta_descuento: row.soportaDescuento,
    promo_servicio_id: row.promoServicioId ?? undefined,
  };
}

function mapCliente(row: typeof clientesTable.$inferSelect): Cliente {
  return {
    id: row.id,
    nombre: row.nombre,
    telefono: row.telefono ?? undefined,
    observacion: row.observacion ?? undefined,
    activo: row.activo,
    saldo_cc: row.saldoCc,
    cuenta_corriente_habilitada: row.cuentaCorrienteHabilitada,
  };
}

function mapMedioPago(row: typeof mediosPagoTable.$inferSelect): MedioPago {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    codigo: row.codigo,
    nombre: row.nombre,
    activo: row.activo,
    cuenta_id: row.cuentaId ?? undefined,
    recargo_pct: row.recargoPct,
  };
}

function mapServicio(row: typeof serviciosTable.$inferSelect): Servicio {
  return {
    id: row.id,
    rubro: row.rubro,
    nombre: row.nombre,
    codigo: row.codigo ?? undefined,
    precio_lista: row.precioLista,
    precio_efectivo: row.precioEfectivo,
    comision_default_pct: row.comisionDefaultPct,
    activo: row.activo,
    duracion_min: row.duracionMin ?? undefined,
    descripcion_corta: row.descripcionCorta ?? undefined,
    destacado_pct: row.destacadoPct ?? undefined,
  };
}

function mapEmpleado(row: typeof empleadosTable.$inferSelect): Empleado {
  return {
    id: row.id,
    nombre: row.nombre,
    activo: row.activo,
    sucursal_principal_id: row.sucursalPrincipalId,
    tipo_comision: row.tipoComision,
    porcentaje_default: row.porcentajeDefault,
    sueldo_asegurado: row.sueldoAsegurado,
    valor_hora: row.valorHora,
    viatico_por_dia: row.viaticoPorDia,
    horas_por_dia: row.horasPorDia,
    dias_trabajo: row.diasTrabajo ?? [],
    observacion: row.observacion ?? undefined,
  };
}

function mapInsumo(row: typeof insumosTable.$inferSelect): Insumo {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    nombre: row.nombre,
    codigo: row.codigo ?? undefined,
    unidad_medida: row.unidadMedida,
    tamano_envase: row.tamanoEnvase,
    precio_envase: row.precioEnvase,
    precio_unitario: row.precioUnitario ?? null,
    rinde: row.rinde ?? undefined,
    umbral_stock_bajo: row.umbralStockBajo,
    activo: row.activo,
    tipo: row.tipo,
    vendible: row.vendible,
    precio_venta: row.precioVenta ?? undefined,
    precio_venta_efectivo: row.precioVentaEfectivo ?? undefined,
  };
}

function mapReceta(row: typeof recetasTable.$inferSelect): Receta {
  return {
    id: row.id,
    sucursal_id: row.sucursalId,
    servicio_id: row.servicioId,
    insumo_id: row.insumoId,
    cantidad: row.cantidad,
    confirmada: row.confirmada,
  };
}

async function loadIngresoCatalogs(args: {
  ingresos: Ingreso[];
  lineas: IngresoLinea[];
}) {
  const db = getDb();
  const clienteIds = Array.from(
    new Set(args.ingresos.map((item) => item.cliente_id).filter(Boolean)),
  ) as string[];
  const medioPagoIds = Array.from(
    new Set(
      args.ingresos.flatMap((item) =>
        [item.mp1_id, item.mp2_id].filter(Boolean),
      ),
    ),
  ) as string[];
  const servicioIds = Array.from(
    new Set(args.lineas.map((item) => item.servicio_id).filter(Boolean)),
  ) as string[];
  const insumoIdsDirectos = Array.from(
    new Set(args.lineas.map((item) => item.insumo_id).filter(Boolean)),
  ) as string[];
  const empleadoIds = Array.from(
    new Set(args.lineas.map((item) => item.empleado_id).filter(Boolean)),
  ) as string[];
  // Las recetas son por sucursal: solo las de las sucursales de estos ingresos.
  const sucursalIds = Array.from(
    new Set(args.ingresos.map((item) => item.sucursal_id).filter(Boolean)),
  ) as string[];

  const [clientesRows, mediosPagoRows, serviciosRows, empleadosRows, recetasRows] =
    await Promise.all([
      clienteIds.length > 0
        ? db
            .select()
            .from(clientesTable)
            .where(inArray(clientesTable.id, clienteIds))
        : Promise.resolve([]),
      medioPagoIds.length > 0
        ? db
            .select()
            .from(mediosPagoTable)
            .where(inArray(mediosPagoTable.id, medioPagoIds))
        : Promise.resolve([]),
      servicioIds.length > 0
        ? db
            .select()
            .from(serviciosTable)
            .where(inArray(serviciosTable.id, servicioIds))
        : Promise.resolve([]),
      empleadoIds.length > 0
        ? db
            .select()
            .from(empleadosTable)
            .where(inArray(empleadosTable.id, empleadoIds))
        : Promise.resolve([]),
      servicioIds.length > 0 && sucursalIds.length > 0
        ? db
            .select()
            .from(recetasTable)
            .where(
              and(
                inArray(recetasTable.servicioId, servicioIds),
                inArray(recetasTable.sucursalId, sucursalIds),
              ),
            )
        : Promise.resolve([]),
    ]);

  const recetaRowsMapped = recetasRows.map(mapReceta);
  const insumoIds = Array.from(
    new Set([
      ...recetaRowsMapped.map((item) => item.insumo_id),
      ...insumoIdsDirectos,
    ]),
  );
  const insumosRows =
    insumoIds.length > 0
      ? await db
          .select()
          .from(insumosTable)
          .where(inArray(insumosTable.id, insumoIds))
      : [];

  const servicios = serviciosRows.map(mapServicio);
  const empleados = empleadosRows.map(mapEmpleado);
  const insumos = insumosRows.map(mapInsumo);
  const costoInsumosByServicio = buildCostoInsumosByServicio(
    recetaRowsMapped,
    insumos,
  );

  return {
    clientesById: new Map(clientesRows.map((item) => [item.id, mapCliente(item)])),
    mediosPagoById: new Map(
      mediosPagoRows.map((item) => [item.id, mapMedioPago(item)]),
    ),
    serviciosById: new Map(servicios.map((item) => [item.id, item])),
    insumosById: new Map(insumos.map((item) => [item.id, item])),
    empleadosById: new Map(empleados.map((item) => [item.id, item])),
    costoInsumosByServicio,
  };
}

function buildIngresosConDetalle(args: {
  ingresos: Ingreso[];
  lineas: IngresoLinea[];
  clientesById: Map<string, Cliente>;
  mediosPagoById: Map<string, MedioPago>;
  serviciosById: Map<string, Servicio>;
  insumosById: Map<string, Insumo>;
  empleadosById: Map<string, Empleado>;
  costoInsumosByServicio: Map<string, number>;
}) {
  const lineasByIngreso = new Map<string, IngresoLinea[]>();
  for (const linea of args.lineas) {
    const current = lineasByIngreso.get(linea.ingreso_id) ?? [];
    current.push(linea);
    lineasByIngreso.set(linea.ingreso_id, current);
  }

  return args.ingresos.map((ingreso): IngresoConDetalle => {
    const lineas = detallarLineas(
      lineasByIngreso.get(ingreso.id) ?? [],
      {
        serviciosById: args.serviciosById,
        insumosById: args.insumosById,
        empleadosById: args.empleadosById,
        costoInsumosByServicio: args.costoInsumosByServicio,
      },
      ingreso.sucursal_id,
    );
    return {
      ingreso,
      cliente: ingreso.cliente_id
        ? (args.clientesById.get(ingreso.cliente_id) ?? null)
        : null,
      mp1: args.mediosPagoById.get(ingreso.mp1_id) ?? null,
      mp2: ingreso.mp2_id
        ? (args.mediosPagoById.get(ingreso.mp2_id) ?? null)
        : null,
      lineas,
      breakdown: computeBreakdown(ingreso, lineas),
    };
  });
}

export async function listIngresos(
  filtros: IngresoFiltros = {},
): Promise<IngresoConDetalle[]> {
  const user = await requireUser();
  const scope = buildAccessScope(user);

  if (filtros.sucursalId && !isSucursalAllowed(scope, filtros.sucursalId)) {
    return [];
  }
  // Fail-closed: un empleado sin ficha vinculada (empleado_id) no ve ninguna
  // venta, en vez de filtrar "abierto" y ver todas las de la sucursal.
  if (scope.rol === "empleado" && !scope.empleadoId) {
    return [];
  }
  if (
    scope.rol === "empleado" &&
    filtros.empleadoId &&
    filtros.empleadoId !== scope.empleadoId
  ) {
    return [];
  }

  const filters = [inArray(ingresosTable.sucursalId, scope.sucursalIdsPermitidas)];
  if (!filtros.incluirAnulados) {
    filters.push(eq(ingresosTable.anulado, false));
  }
  if (filtros.sucursalId) {
    filters.push(eq(ingresosTable.sucursalId, filtros.sucursalId));
  }
  if (filtros.clienteId) {
    filters.push(eq(ingresosTable.clienteId, filtros.clienteId));
  }
  if (filtros.desde) {
    filters.push(gte(ingresosTable.fecha, new Date(filtros.desde)));
  }
  if (filtros.hasta) {
    filters.push(lte(ingresosTable.fecha, new Date(filtros.hasta)));
  }
  if (filtros.revision === "sin") {
    filters.push(isNull(ingresosTable.revision));
  } else if (filtros.revision === "ok" || filtros.revision === "error") {
    filters.push(eq(ingresosTable.revision, filtros.revision));
  }

  const db = getDb();
  const ingresosRows = await db
    .select()
    .from(ingresosTable)
    .where(and(...filters))
    .orderBy(desc(ingresosTable.fecha));

  if (ingresosRows.length === 0) return [];

  let lineas = (
    await db
      .select()
      .from(ingresoLineasTable)
      .where(
        inArray(
          ingresoLineasTable.ingresoId,
          ingresosRows.map((item) => item.id),
        ),
      )
  ).map(mapIngresoLinea);

  const empleadoId = scope.rol === "empleado" ? scope.empleadoId : filtros.empleadoId;
  if (empleadoId) {
    const ingresoIdsPermitidos = new Set(
      lineas
        .filter((linea) => linea.empleado_id === empleadoId)
        .map((linea) => linea.ingreso_id),
    );
    lineas = lineas.filter((linea) => ingresoIdsPermitidos.has(linea.ingreso_id));
    const ingresos = ingresosRows
      .filter((item) => ingresoIdsPermitidos.has(item.id))
      .map(mapIngreso);
    if (ingresos.length === 0) return [];
    const lookups = await loadIngresoCatalogs({ ingresos, lineas });
    return buildIngresosConDetalle({
      ingresos,
      lineas,
      ...lookups,
    });
  }

  const ingresos = ingresosRows.map(mapIngreso);
  const lookups = await loadIngresoCatalogs({ ingresos, lineas });
  return buildIngresosConDetalle({
    ingresos,
    lineas,
    ...lookups,
  });
}

export async function getIngreso(
  ingresoId: string,
): Promise<IngresoConDetalle | null> {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  const db = getDb();
  const [row] = await db
    .select()
    .from(ingresosTable)
    .where(eq(ingresosTable.id, ingresoId))
    .limit(1);

  if (!row) return null;
  if (!scope.sucursalIdsPermitidas.includes(row.sucursalId)) return null;

  const lineas = (
    await db
      .select()
      .from(ingresoLineasTable)
      .where(eq(ingresoLineasTable.ingresoId, ingresoId))
  ).map(mapIngresoLinea);

  if (scope.rol === "empleado") {
    // Fail-closed: sin ficha vinculada no ve ningún detalle; con ficha, solo
    // las ventas donde participó.
    if (!scope.empleadoId) return null;
    const isOwn = lineas.some((linea) => linea.empleado_id === scope.empleadoId);
    if (!isOwn) return null;
  }

  const ingreso = mapIngreso(row);
  const lookups = await loadIngresoCatalogs({
    ingresos: [ingreso],
    lineas,
  });
  return buildIngresosConDetalle({
    ingresos: [ingreso],
    lineas,
    ...lookups,
  })[0] ?? null;
}

export type CreateIngresoResult =
  | { ok: true; ingresoId: string; warnings?: string[] }
  | { ok: false; errors: Record<string, string[]> };

export async function createIngreso(
  formData: FormData,
): Promise<CreateIngresoResult> {
  // Sin "empleado": las ventas las carga el mostrador.
  //
  // No es sólo la regla del salón. Esta función nunca validó que las líneas se
  // le asignen a quien la llama, y el selector de empleada del formulario ofrece
  // a todas las activas: con el rol empleado habilitado, cualquiera podía
  // registrar una venta y adjudicarle la comisión a otra persona. El chequeo de
  // rol que había en listIngresos era sólo para LEER.
  const user = await requireRole(["admin", "encargada"]);
  const scope = buildAccessScope(user);

  const lineasRaw = formData.get("lineas");
  let lineasParsed: unknown = [];
  if (typeof lineasRaw === "string") {
    try {
      lineasParsed = JSON.parse(lineasRaw);
    } catch {
      return { ok: false, errors: { lineas: ["JSON invalido"] } };
    }
  }

  const parsed = ingresoSchema.safeParse({
    sucursal_id: formData.get("sucursal_id"),
    cliente_id: formData.get("cliente_id"),
    lineas: lineasParsed,
    descuento_tipo: formData.get("descuento_tipo") ?? "pct",
    descuento_valor: formData.get("descuento_valor") ?? 0,
    descuento_motivo_id: formData.get("descuento_motivo_id"),
    mp1_id: formData.get("mp1_id"),
    valor1: formData.get("valor1"),
    mp1_cuenta_id: formData.get("mp1_cuenta_id"),
    mp2_id: formData.get("mp2_id"),
    valor2: formData.get("valor2"),
    mp2_cuenta_id: formData.get("mp2_cuenta_id"),
    observacion: formData.get("observacion"),
  });

  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  if (!isSucursalAllowed(scope, parsed.data.sucursal_id)) {
    return {
      ok: false,
      errors: { sucursal_id: ["No tienes acceso a esa sucursal"] },
    };
  }

  const data = parsed.data;

  // Satisfacción del cliente (la marca quien registra la venta). Por defecto
  // se asume satisfecho; solo se guarda "no satisfecho" si se desmarca.
  const satisfechoRaw = formData.get("cliente_satisfecho");
  const clienteNoSatisfecho =
    satisfechoRaw === "false" || satisfechoRaw === "no" || satisfechoRaw === "0";
  const satisfaccionNota = String(formData.get("satisfaccion_nota") ?? "").trim();

  const subtotalLinea = (linea: (typeof data.lineas)[number]) =>
    linea.tipo === "producto"
      ? linea.precio_efectivo * linea.cantidad
      : linea.precio_efectivo;
  const subtotal = data.lineas.reduce((acc, linea) => acc + subtotalLinea(linea), 0);
  const { descuentoMonto, descuentoPct, totalNeto } = computeDescuento({
    subtotal,
    descuentoTipo: data.descuento_tipo,
    descuentoValor: data.descuento_valor,
  });

  const db = getDb();

  // Recargo automático según el medio de pago (ej. tarjeta de crédito).
  // El recargo se calcula sobre la porción base cobrada con cada medio.
  const mpIds = [data.mp1_id, data.mp2_id].filter(Boolean) as string[];
  const mediosRows =
    mpIds.length > 0
      ? await db
          .select()
          .from(mediosPagoTable)
          .where(inArray(mediosPagoTable.id, mpIds))
      : [];
  const recargoPctById = new Map(mediosRows.map((m) => [m.id, m.recargoPct]));

  // Cuenta corriente: el medio con código "CC" no es un cobro real, sino que
  // genera deuda en la cuenta corriente del cliente (no impacta en bancos).
  const codigoById = new Map(mediosRows.map((m) => [m.id, m.codigo]));
  const mp1EsCc = codigoById.get(data.mp1_id) === "CC";
  const mp2EsCc = data.mp2_id ? codigoById.get(data.mp2_id) === "CC" : false;
  const usaCc = mp1EsCc || mp2EsCc;
  if (usaCc && !data.cliente_id) {
    return {
      ok: false,
      errors: {
        cliente_id: [
          "Para cargar a cuenta corriente tenés que elegir un cliente",
        ],
      },
    };
  }

  // Gift card: el medio "GIFT" tampoco es un cobro real. La plata entró cuando
  // se vendió la tarjeta; acá sólo se descuenta el saldo. Esto sí es una venta
  // -el servicio se prestó- así que el ingreso se registra completo y la
  // empleada cobra su comisión; lo único que no pasa es que entre plata.
  const mp1EsGift = codigoById.get(data.mp1_id) === "GIFT";
  const mp2EsGift = data.mp2_id ? codigoById.get(data.mp2_id) === "GIFT" : false;
  if (mp1EsGift && !data.gift_card_1_id) {
    return {
      ok: false,
      errors: { gift_card_1_id: ["Elegí qué gift card se está canjeando"] },
    };
  }
  if (mp2EsGift && !data.gift_card_2_id) {
    return {
      ok: false,
      errors: { gift_card_2_id: ["Elegí qué gift card se está canjeando"] },
    };
  }

  const { valor1Cobrado, valor2Cobrado, total } =
    computeRecargos({
      totalNeto,
      mp1Id: data.mp1_id,
      valor1: data.valor1,
      mp2Id: data.mp2_id,
      valor2: data.valor2,
      recargoPctById,
    });

  const comisionMontoDeLinea = (
    linea: Extract<(typeof data.lineas)[number], { tipo: "servicio" }>,
  ): number =>
    comisionMontoServicio({
      precioEfectivo: linea.precio_efectivo,
      comisionPct: linea.comision_pct,
      soportaDescuento: linea.soporta_descuento,
      subtotal,
      descuentoMonto,
    });

  const ingresoId = createId();
  const fecha = new Date();
  // hoyAr y no toISOString: el server corre en UTC y la apertura de caja se
  // guarda con la fecha ARGENTINA (ver caja/apertura). Con toISOString, a partir
  // de las 21:00 hora argentina esto devolvía la fecha de MAÑANA, así que la
  // venta buscaba una apertura que no existía y tiraba "Tenés que abrir la caja
  // de hoy" aunque estuviera abierta — todas las noches, en el horario en que un
  // salón justamente cierra. Y de paso el chequeo de caja cerrada tampoco
  // encontraba el cierre de hoy, o sea que dejaba vender sobre un día cerrado.
  const hoyYmd = hoyAr();
  const warnings: string[] = [];

  try {
    await db.transaction(async (tx) => {
      const [cierreDelDia] = await tx
        .select({ id: cierresCajaTable.id })
        .from(cierresCajaTable)
        .where(
          and(
            eq(cierresCajaTable.sucursalId, data.sucursal_id),
            eq(cierresCajaTable.fecha, hoyYmd),
          ),
        )
        .limit(1);

      if (cierreDelDia) {
        throw new Error(
          "La caja de hoy ya esta cerrada para esta sucursal. Reabri el cierre para registrar mas ventas.",
        );
      }

      // Apertura obligatoria: no se puede vender si la caja del día no fue abierta.
      const [aperturaDelDia] = await tx
        .select({ id: aperturasCajaTable.id })
        .from(aperturasCajaTable)
        .where(
          and(
            eq(aperturasCajaTable.sucursalId, data.sucursal_id),
            eq(aperturasCajaTable.fecha, hoyYmd),
          ),
        )
        .limit(1);

      if (!aperturaDelDia) {
        throw new Error(
          "Tenés que abrir la caja de hoy antes de registrar ventas.",
        );
      }

      await tx.insert(ingresosTable).values({
        id: ingresoId,
        fecha,
        sucursalId: data.sucursal_id,
        clienteId: data.cliente_id ?? null,
        subtotal,
        descuentoPct,
        descuentoMonto,
        descuentoMotivoId:
          descuentoMonto > 0 ? (data.descuento_motivo_id ?? null) : null,
        total,
        mp1Id: data.mp1_id,
        valor1: valor1Cobrado,
        mp1CuentaId: data.mp1_cuenta_id ?? null,
        mp2Id: data.mp2_id ?? null,
        valor2: valor2Cobrado,
        mp2CuentaId: data.mp2_cuenta_id ?? null,
        observacion: data.observacion ?? null,
        usuarioId: user.id,
        anulado: false,
        // Satisfacción del cliente marcada al registrar (default: satisfecho).
        revision: clienteNoSatisfecho ? "error" : "ok",
        revisionNota:
          clienteNoSatisfecho && satisfaccionNota ? satisfaccionNota : null,
      });

      const lineasServicio = data.lineas.filter(
        (l): l is Extract<typeof l, { tipo: "servicio" }> => l.tipo === "servicio",
      );
      const lineasProducto = data.lineas.filter(
        (l): l is Extract<typeof l, { tipo: "producto" }> => l.tipo === "producto",
      );

      // Validar que los insumos vendidos sigan siendo de venta y activos
      const insumoIdsVendidos = Array.from(
        new Set(lineasProducto.map((l) => l.insumo_id)),
      );
      const insumosVendidosRows =
        insumoIdsVendidos.length > 0
          ? await tx
              .select()
              .from(insumosTable)
              .where(inArray(insumosTable.id, insumoIdsVendidos))
          : [];
      const insumosVendiblesById = new Map(
        insumosVendidosRows.map((row) => [row.id, row]),
      );
      for (const linea of lineasProducto) {
        const insumo = insumosVendiblesById.get(linea.insumo_id);
        if (!insumo || !insumo.activo || insumo.tipo !== "venta") {
          throw new Error(
            `El producto seleccionado no está disponible para la venta`,
          );
        }
      }

      await tx.insert(ingresoLineasTable).values(
        data.lineas.map((linea) => {
          if (linea.tipo === "producto") {
            const subtotalProd = linea.precio_efectivo * linea.cantidad;
            // Sin vendedora asignada no hay comisión, aunque venga un % en el
            // payload: la comisión es de alguien o no es.
            const pctProd = linea.empleado_id ? linea.comision_pct : 0;
            return {
              id: createId(),
              ingresoId,
              servicioId: null,
              insumoId: linea.insumo_id,
              empleadoId: linea.empleado_id ?? null,
              precioEfectivo: linea.precio_efectivo,
              cantidad: linea.cantidad,
              subtotal: subtotalProd,
              comisionPct: pctProd,
              // Sobre lo efectivamente cobrado por la línea: el subtotal menos
              // su parte del descuento del ticket. Mismo criterio que una línea
              // de servicio con "la empleada absorbe el descuento".
              comisionMonto: comisionMontoServicio({
                precioEfectivo: subtotalProd,
                comisionPct: pctProd,
                soportaDescuento: true,
                subtotal,
                descuentoMonto,
              }),
              soportaDescuento: true,
              promoServicioId: null,
            };
          }
          return {
            id: createId(),
            ingresoId,
            servicioId: linea.servicio_id,
            insumoId: null,
            empleadoId: linea.empleado_id,
            precioEfectivo: linea.precio_efectivo,
            cantidad: 1,
            subtotal: linea.precio_efectivo,
            comisionPct: linea.comision_pct,
            comisionMonto: comisionMontoDeLinea(linea),
            soportaDescuento: linea.soporta_descuento,
            promoServicioId: linea.promo_servicio_id ?? null,
          };
        }),
      );

      const servicioIds = Array.from(
        new Set(lineasServicio.map((linea) => linea.servicio_id)),
      );
      const recetasRows =
        servicioIds.length > 0
          ? await tx
              .select()
              .from(recetasTable)
              .where(
                and(
                  inArray(recetasTable.servicioId, servicioIds),
                  eq(recetasTable.sucursalId, data.sucursal_id),
                ),
              )
          : [];
      const recetaMap = new Map<string, Array<(typeof recetasTable.$inferSelect)>>(
        servicioIds.map((servicioId) => [servicioId, []]),
      );
      for (const receta of recetasRows) {
        const current = recetaMap.get(receta.servicioId) ?? [];
        current.push(receta);
        recetaMap.set(receta.servicioId, current);
      }

      const deltasPorInsumo = new Map<string, number>();
      for (const linea of lineasServicio) {
        const recetasDeServicio = recetaMap.get(linea.servicio_id) ?? [];
        for (const receta of recetasDeServicio) {
          deltasPorInsumo.set(
            receta.insumoId,
            (deltasPorInsumo.get(receta.insumoId) ?? 0) - receta.cantidad,
          );
        }
      }
      for (const linea of lineasProducto) {
        deltasPorInsumo.set(
          linea.insumo_id,
          (deltasPorInsumo.get(linea.insumo_id) ?? 0) - linea.cantidad,
        );
      }

      const insumoIds = Array.from(deltasPorInsumo.keys());
      const insumosRows =
        insumoIds.length > 0
          ? await tx
              .select()
              .from(insumosTable)
              .where(inArray(insumosTable.id, insumoIds))
          : [];
      const insumoNombreById = new Map(
        insumosRows.map((item) => [item.id, item.nombre]),
      );

      for (const [insumoId, delta] of deltasPorInsumo.entries()) {
        const { stock } = await applyMovementTx(tx, {
          insumo_id: insumoId,
          sucursal_id: data.sucursal_id,
          delta,
          tipo: "venta",
          ref_tipo: "ingreso",
          ref_id: ingresoId,
          usuario_id: user.id,
        });

        if (stock.cantidad < 0) {
          warnings.push(
            `Stock negativo en ${insumoNombreById.get(insumoId) ?? "insumo"}: ${stock.cantidad}`,
          );
        }
      }

      // Movimientos bancarios: una entrada por cada medio de pago usado
      const cobros: Array<{
        mpId: string;
        monto: number;
        cuentaOverride?: string;
        esCc: boolean;
        giftCardId?: string;
      }> = [
        {
          mpId: data.mp1_id,
          monto: valor1Cobrado,
          cuentaOverride: data.mp1_cuenta_id,
          esCc: mp1EsCc,
          giftCardId: mp1EsGift ? data.gift_card_1_id : undefined,
        },
      ];
      if (data.mp2_id && valor2Cobrado != null) {
        cobros.push({
          mpId: data.mp2_id,
          monto: valor2Cobrado,
          cuentaOverride: data.mp2_cuenta_id,
          esCc: mp2EsCc,
          giftCardId: mp2EsGift ? data.gift_card_2_id : undefined,
        });
      }

      // Canje: descuenta el saldo de cada tarjeta usada. canjearGiftCardTx hace
      // un UPDATE condicional; si la tarjeta no da (sin saldo, anulada, de otra
      // sucursal) tira y toda la venta hace rollback, que es lo que queremos:
      // no puede quedar registrada una venta cobrada con una tarjeta que no
      // existía.
      for (const cobro of cobros) {
        if (!cobro.giftCardId || cobro.monto <= 0) continue;
        await canjearGiftCardTx(tx, {
          giftCardId: cobro.giftCardId,
          sucursalId: data.sucursal_id,
          monto: cobro.monto,
          ingresoId,
          usuarioId: user.id,
          fecha,
        });
      }

      // Porción fiada: genera deuda en la cuenta corriente del cliente en lugar
      // de impactar en bancos. Un único cargo por venta.
      const montoCc = cobros.reduce(
        (acc, c) => (c.esCc ? acc + c.monto : acc),
        0,
      );
      if (montoCc > 0) {
        const clienteIdCc = data.cliente_id!;
        const [cli] = await tx
          .select()
          .from(clientesTable)
          .where(eq(clientesTable.id, clienteIdCc))
          .limit(1);
        if (!cli) throw new Error("Cliente no encontrado");
        if (!cli.cuentaCorrienteHabilitada) {
          throw new Error("El cliente no tiene la cuenta corriente habilitada");
        }
        await tx.insert(movimientosCcTable).values({
          id: createId(),
          clienteId: clienteIdCc,
          fecha,
          tipo: "cargo",
          monto: montoCc,
          sucursalId: data.sucursal_id,
          mpId: null,
          refTipo: "ingreso",
          refId: ingresoId,
          descripcion: "Venta fiada a cuenta corriente",
          usuarioId: user.id,
        });
        await tx
          .update(clientesTable)
          .set({ saldoCc: cli.saldoCc + montoCc })
          .where(eq(clientesTable.id, clienteIdCc));
      }

      for (const cobro of cobros) {
        if (cobro.esCc) continue; // lo fiado no entra a bancos
        // Un canje tampoco: esa plata entró cuando se vendió la tarjeta. Si
        // emitiera movimiento acá, el arqueo del día daría sobrante.
        if (cobro.giftCardId) continue;
        const cuentaId =
          cobro.cuentaOverride ?? (await getCuentaIdForMpTx(tx, cobro.mpId));
        if (!cuentaId) {
          warnings.push(
            "Medio de pago sin cuenta asignada: el cobro no impacta en bancos hasta asignarla.",
          );
          continue;
        }
        await emitMovimientoBancarioTx(tx, {
          cuentaId,
          fecha,
          monto: cobro.monto,
          tipo: "ingreso",
          sucursalId: data.sucursal_id,
          refTipo: "ingreso",
          refId: ingresoId,
          descripcion: "Cobro de venta",
          usuarioId: user.id,
        });
      }
    });
  } catch (error) {
    return {
      ok: false,
      errors: {
        _: [error instanceof Error ? error.message : "No se pudo crear la venta"],
      },
    };
  }

  revalidatePath("/ventas");
  revalidatePath("/stock");
  revalidatePath("/dashboard");
  revalidatePath("/caja");
  revalidatePath("/bancos");
  if (usaCc) {
    revalidatePath("/catalogos/clientes");
    // El saldo del cliente cambió: el aviso de "tiene X a favor" del form de
    // venta tiene que reflejarlo en la próxima venta.
    revalidatePath("/ventas/nueva");
  }
  return { ok: true, ingresoId, warnings: warnings.length ? warnings : undefined };
}
