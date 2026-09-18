import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const auth = pgSchema("auth");

export const authUsers = auth.table("users", {
  id: uuid("id").primaryKey(),
});

export const rolEnum = pgEnum("rol", ["superadmin", "admin", "encargada", "empleado"]);
export const tipoComisionEnum = pgEnum("tipo_comision", [
  "porcentaje",
  "mixto",
  "sueldo_fijo",
]);
export const unidadMedidaEnum = pgEnum("unidad_medida", ["ud", "ml", "g", "aplicacion"]);
// Separa los dos usos de un insumo (excluyentes):
//   - "bacha": envases grandes de uso interno; SOLO estos alimentan recetas.
//   - "venta": envases chicos que se venden directo al público.
export const insumoTipoEnum = pgEnum("insumo_tipo", ["bacha", "venta"]);
// Modelo nuevo (4 estados): pendiente | realizado | ausente | cancelado.
// confirmado/en_curso/completado quedan por compatibilidad con datos viejos
// (migración pragmática); el código solo usa los 4 nuevos.
export const turnoEstadoEnum = pgEnum("turno_estado", [
  "pendiente",
  "confirmado",
  "en_curso",
  "completado",
  "cancelado",
  "ausente",
  "realizado",
]);
export const turnoCanalEnum = pgEnum("turno_canal", ["web", "recepcion"]);
export const turnoEventoTipoEnum = pgEnum("turno_evento_tipo", [
  "creado",
  "pendiente",
  "confirmado",
  "reprogramado",
  "cancelado",
  "ausente",
  "completado",
  "en_curso",
]);
export const tipoMovimientoStockEnum = pgEnum("tipo_movimiento_stock", [
  "compra",
  "venta",
  "ajuste_manual",
  "transferencia_entrada",
  "transferencia_salida",
]);
export const origenTurnoEnum = pgEnum("origen_turno", ["publico", "interno"]);
export const liquidacionEstadoEnum = pgEnum("liquidacion_estado", [
  "pendiente",
  "pagada",
  "anulada",
]);
export const tipoCuentaEnum = pgEnum("tipo_cuenta", ["banco", "efectivo"]);
export const tipoMovBancarioEnum = pgEnum("tipo_mov_bancario", [
  "ingreso",
  "egreso",
  "transferencia_entrada",
  "transferencia_salida",
  "ajuste",
  // Impuesto retenido/debitado automáticamente sobre un movimiento de la cuenta
  // (ej. 0,6% débito y crédito, 2,5% ingresos brutos). Siempre es un egreso.
  "impuesto",
]);
// Sobre qué movimientos aplica un impuesto de cuenta:
//   - "credito": solo sobre ingresos (lo que entra).
//   - "debito": solo sobre egresos (lo que sale).
//   - "ambos": sobre todo movimiento (entra y sale).
export const impuestoBaseEnum = pgEnum("impuesto_base", [
  "credito",
  "debito",
  "ambos",
]);
export const whatsappEnvioTipoEnum = pgEnum("whatsapp_envio_tipo", [
  "confirmacion",
  "recordatorio_2h",
  "cancelacion",
  "reprogramacion",
  "prueba",
]);
export const whatsappEnvioEstadoEnum = pgEnum("whatsapp_envio_estado", [
  "ok",
  "error",
]);

export const sucursales = pgTable("sucursales", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  activo: boolean("activo").notNull().default(true),
  slug: text("slug"),
  direccion: text("direccion"),
  telefono: text("telefono"),
  horarioResumen: text("horario_resumen"),
  rating: doublePrecision("rating"),
  reviews: integer("reviews"),
  mapaUrl: text("mapa_url"),
  descripcionCorta: text("descripcion_corta"),
});

export const empleados = pgTable("empleados", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  activo: boolean("activo").notNull().default(true),
  sucursalPrincipalId: text("sucursal_principal_id")
    .notNull()
    .references(() => sucursales.id),
  tipoComision: tipoComisionEnum("tipo_comision").notNull(),
  porcentajeDefault: doublePrecision("porcentaje_default").notNull(),
  // Legacy: monto fijo asegurado, ya no se usa en el cálculo. Reemplazado por valorHora.
  sueldoAsegurado: doublePrecision("sueldo_asegurado").notNull().default(0),
  valorHora: doublePrecision("valor_hora").notNull().default(0),
  viaticoPorDia: doublePrecision("viatico_por_dia").notNull().default(0),
  // Jornada: horas por día y días de la semana que trabaja (0=domingo … 6=sábado).
  horasPorDia: doublePrecision("horas_por_dia").notNull().default(0),
  diasTrabajo: jsonb("dias_trabajo").$type<number[]>().notNull().default([]),
  observacion: text("observacion"),
});

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    nombre: text("nombre").notNull(),
    rol: rolEnum("rol").notNull(),
    sucursalDefaultId: text("sucursal_default_id")
      .notNull()
      .references(() => sucursales.id),
    empleadoId: text("empleado_id").references(() => empleados.id),
    activo: boolean("activo").notNull().default(true),
  },
  (table) => ({
    emailIdx: index("profiles_email_idx").on(table.email),
  }),
);

export const clientes = pgTable(
  "clientes",
  {
    id: text("id").primaryKey(),
    nombre: text("nombre").notNull(),
    telefono: text("telefono"),
    telefonoE164: text("telefono_e164"),
    email: text("email"),
    observacion: text("observacion"),
    activo: boolean("activo").notNull().default(true),
    saldoCc: doublePrecision("saldo_cc").notNull().default(0),
    // Habilitada por defecto para todos: cada cliente puede usar (o no) la
    // cuenta corriente al cobrar; deshabilitarla es la excepción manual.
    cuentaCorrienteHabilitada: boolean("cuenta_corriente_habilitada")
      .notNull()
      .default(true),
    // Ficha técnica — perfil fijo del cliente (estilo historia clínica).
    tipoCabello: text("tipo_cabello"),
    saludCabello: text("salud_cabello"),
    alergias: text("alergias"),
    colorActual: text("color_actual"),
    observacionesTecnicas: text("observaciones_tecnicas"),
  },
  (table) => ({
    telefonoE164Idx: uniqueIndex("clientes_telefono_e164_uq").on(table.telefonoE164),
  }),
);

// Ficha técnica — registros fechados (evolución: fórmula de color, técnica, notas).
export const clienteFichaRegistros = pgTable(
  "cliente_ficha_registros",
  {
    id: text("id").primaryKey(),
    clienteId: text("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    fecha: timestamp("fecha", { withTimezone: true }).notNull(),
    servicioId: text("servicio_id").references(() => servicios.id),
    formula: text("formula"),
    notas: text("notas"),
    empleadoId: text("empleado_id").references(() => empleados.id),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => profiles.userId),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clienteFechaIdx: index("cliente_ficha_registros_cliente_fecha_idx").on(
      table.clienteId,
      table.fecha,
    ),
  }),
);

export const proveedores = pgTable("proveedores", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  telefono: text("telefono"),
  cuit: text("cuit"),
  deudaPendiente: doublePrecision("deuda_pendiente").notNull().default(0),
});

export const servicios = pgTable(
  "servicios",
  {
    id: text("id").primaryKey(),
    rubro: text("rubro").notNull(),
    nombre: text("nombre").notNull(),
    // Código de la planilla del salón ("PEL100"). Nullable: Centro se cargó sin
    // códigos. Se muestra en las tablas y se puede buscar por él.
    codigo: text("codigo"),
    precioLista: doublePrecision("precio_lista").notNull(),
    precioEfectivo: doublePrecision("precio_efectivo").notNull(),
    comisionDefaultPct: doublePrecision("comision_default_pct").notNull(),
    activo: boolean("activo").notNull().default(true),
    // Visible en la reserva pública / agenda de turnos. Cuando es false el
    // servicio se puede vender en la caja pero NO aparece en el menú del cliente
    // ni genera turnos: sirve para los precios internos por largo de pelo
    // (tiers 1/2/3/4) de los que en la web se muestra un único "desde".
    visibleReserva: boolean("visible_reserva").notNull().default(true),
    duracionMin: integer("duracion_min"),
    descripcionCorta: text("descripcion_corta"),
    destacadoPct: integer("destacado_pct"),
    // Promociones: una promo es un servicio (es_promo=true) que combina varios
    // servicios componentes (ver promocion_items). vence_el = vencimiento opcional.
    esPromo: boolean("es_promo").notNull().default(false),
    venceEl: date("vence_el"),
  },
  (table) => ({
    // Único parcial y GLOBAL: `servicios` no tiene sucursal_id (la pertenencia
    // vive en servicio_sucursal), así que no se puede hacer único por sucursal.
    // Ver el comentario de drizzle/0026_codigos_unicos.sql.
    codigoUq: uniqueIndex("servicios_codigo_uq")
      .on(table.codigo)
      .where(sql`${table.codigo} is not null`),
  }),
);

export const promocionItems = pgTable("promocion_items", {
  id: text("id").primaryKey(),
  promoServicioId: text("promo_servicio_id")
    .notNull()
    .references(() => servicios.id, { onDelete: "cascade" }),
  componenteServicioId: text("componente_servicio_id")
    .notNull()
    .references(() => servicios.id, { onDelete: "cascade" }),
  orden: integer("orden").notNull().default(0),
});

export const horariosSucursal = pgTable("horarios_sucursal", {
  id: text("id").primaryKey(),
  sucursalId: text("sucursal_id")
    .notNull()
    .references(() => sucursales.id, { onDelete: "cascade" }),
  diaSemana: integer("dia_semana").notNull(),
  apertura: text("apertura").notNull(),
  cierre: text("cierre").notNull(),
});

export const serviciosHorarios = pgTable("servicios_horarios", {
  id: text("id").primaryKey(),
  servicioId: text("servicio_id")
    .notNull()
    .references(() => servicios.id, { onDelete: "cascade" }),
  diaSemana: integer("dia_semana").notNull(),
  apertura: text("apertura").notNull(),
  cierre: text("cierre").notNull(),
});

export const profesionalesAgenda = pgTable("profesionales_agenda", {
  id: text("id").primaryKey(),
  empleadoId: text("empleado_id")
    .notNull()
    .references(() => empleados.id, { onDelete: "cascade" }),
  sucursalId: text("sucursal_id")
    .notNull()
    .references(() => sucursales.id, { onDelete: "cascade" }),
  especialidad: text("especialidad").notNull(),
  avatarUrl: text("avatar_url").notNull(),
  color: text("color").notNull(),
  bio: text("bio"),
  prioridad: integer("prioridad").notNull().default(0),
  activoPublico: boolean("activo_publico").notNull().default(true),
});

export const profesionalesHorarios = pgTable("profesionales_horarios", {
  id: text("id").primaryKey(),
  empleadoId: text("empleado_id")
    .notNull()
    .references(() => empleados.id, { onDelete: "cascade" }),
  sucursalId: text("sucursal_id")
    .notNull()
    .references(() => sucursales.id, { onDelete: "cascade" }),
  diaSemana: integer("dia_semana").notNull(),
  apertura: text("apertura").notNull(),
  cierre: text("cierre").notNull(),
});

export const profesionalesServicios = pgTable(
  "profesionales_servicios",
  {
    id: text("id").primaryKey(),
    empleadoId: text("empleado_id")
      .notNull()
      .references(() => empleados.id, { onDelete: "cascade" }),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "cascade" }),
    servicioId: text("servicio_id")
      .notNull()
      .references(() => servicios.id, { onDelete: "cascade" }),
  },
  (table) => ({
    empleadoSucursalServicioIdx: uniqueIndex(
      "profesionales_servicios_empleado_sucursal_servicio_uq",
    ).on(table.empleadoId, table.sucursalId, table.servicioId),
    sucursalEmpleadoIdx: index("profesionales_servicios_sucursal_empleado_idx").on(
      table.sucursalId,
      table.empleadoId,
    ),
  }),
);

// Cada insumo pertenece a una sola sucursal: la definición, el costo y el stock
// son propios de esa sede (no hay producto "global" compartido entre sucursales).
export const insumos = pgTable(
  "insumos",
  {
    id: text("id").primaryKey(),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    // Código de la planilla del salón ("INS001", "VPC100"). Ver servicios.codigo.
    codigo: text("codigo"),
    unidadMedida: unidadMedidaEnum("unidad_medida").notNull(),
    tamanoEnvase: doublePrecision("tamano_envase").notNull(),
    precioEnvase: doublePrecision("precio_envase").notNull(),
    precioUnitario: doublePrecision("precio_unitario"),
    rinde: doublePrecision("rinde"),
    umbralStockBajo: doublePrecision("umbral_stock_bajo").notNull(),
    activo: boolean("activo").notNull().default(true),
    // Clasificación bacha/venta (fuente de verdad de "para qué sirve el insumo").
    tipo: insumoTipoEnum("tipo").notNull().default("bacha"),
    // Legacy: se mantiene sincronizado (vendible = tipo === "venta") por compat
    // con lecturas existentes. El código nuevo clasifica por `tipo`.
    vendible: boolean("vendible").notNull().default(false),
    precioVenta: doublePrecision("precio_venta"),
  },
  (table) => ({
    // Cada sede tiene su catálogo, así que el código es único por sucursal.
    codigoSucursalUq: uniqueIndex("insumos_sucursal_codigo_uq")
      .on(table.sucursalId, table.codigo)
      .where(sql`${table.codigo} is not null`),
  }),
);

// La receta también es por sucursal: el mismo servicio puede consumir distintos
// insumos/cantidades en cada sede. El insumo referenciado pertenece a esa sucursal.
export const recetas = pgTable(
  "recetas",
  {
    id: text("id").primaryKey(),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "cascade" }),
    servicioId: text("servicio_id")
      .notNull()
      .references(() => servicios.id, { onDelete: "cascade" }),
    insumoId: text("insumo_id")
      .notNull()
      .references(() => insumos.id, { onDelete: "cascade" }),
    cantidad: doublePrecision("cantidad").notNull(),
    // false = la línea es una propuesta que el salón todavía tiene que confirmar.
    // Cuenta igual para el costo; sólo se marca distinto en pantalla.
    confirmada: boolean("confirmada").notNull().default(true),
  },
  (table) => ({
    // Un insumo no puede estar dos veces en la misma receta: sin esto, volver a
    // correr un script de carga duplicaba las líneas y el costo se sumaba doble.
    servicioInsumoUq: uniqueIndex("recetas_sucursal_servicio_insumo_uq").on(
      table.sucursalId,
      table.servicioId,
      table.insumoId,
    ),
  }),
);

// Relación N:N entre insumos y proveedores: un insumo se puede comprar a varios
// proveedores y un proveedor surte varios insumos.
export const insumoProveedores = pgTable(
  "insumo_proveedores",
  {
    id: text("id").primaryKey(),
    insumoId: text("insumo_id")
      .notNull()
      .references(() => insumos.id, { onDelete: "cascade" }),
    proveedorId: text("proveedor_id")
      .notNull()
      .references(() => proveedores.id, { onDelete: "cascade" }),
  },
  (table) => ({
    uniqueInsumoProveedor: uniqueIndex("insumo_proveedor_unique_idx").on(
      table.insumoId,
      table.proveedorId,
    ),
  }),
);

export const cuentasBancarias = pgTable("cuentas_bancarias", {
  id: text("id").primaryKey(),
  sucursalId: text("sucursal_id")
    .notNull()
    .references(() => sucursales.id),
  nombre: text("nombre").notNull(),
  tipo: tipoCuentaEnum("tipo").notNull(),
  activo: boolean("activo").notNull().default(true),
  observacion: text("observacion"),
});

export const mediosPago = pgTable("medios_pago", {
  id: text("id").primaryKey(),
  sucursalId: text("sucursal_id")
    .notNull()
    .references(() => sucursales.id),
  codigo: text("codigo").notNull(),
  nombre: text("nombre").notNull(),
  activo: boolean("activo").notNull().default(true),
  cuentaId: text("cuenta_id").references(() => cuentasBancarias.id),
  recargoPct: doublePrecision("recargo_pct").notNull().default(0),
});

export const movimientosBancarios = pgTable(
  "movimientos_bancarios",
  {
    id: text("id").primaryKey(),
    cuentaId: text("cuenta_id")
      .notNull()
      .references(() => cuentasBancarias.id),
    fecha: timestamp("fecha", { withTimezone: true }).notNull(),
    tipo: tipoMovBancarioEnum("tipo").notNull(),
    monto: doublePrecision("monto").notNull(),
    sucursalId: text("sucursal_id").references(() => sucursales.id),
    refTipo: text("ref_tipo"),
    refId: text("ref_id"),
    descripcion: text("descripcion"),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => profiles.userId),
  },
  (table) => ({
    cuentaFechaIdx: index("mov_bancarios_cuenta_fecha_idx").on(
      table.cuentaId,
      table.fecha,
    ),
    refIdx: index("mov_bancarios_ref_idx").on(table.refTipo, table.refId),
  }),
);

// Impuestos configurables por cuenta (autogestionables). Cada ingreso/egreso
// real que impacta una cuenta genera automáticamente un movimiento de tipo
// "impuesto" por cada impuesto activo cuya `base` aplique. Ver
// emitMovimientoBancarioTx.
export const cuentaImpuestos = pgTable(
  "cuenta_impuestos",
  {
    id: text("id").primaryKey(),
    cuentaId: text("cuenta_id")
      .notNull()
      .references(() => cuentasBancarias.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    alicuotaPct: doublePrecision("alicuota_pct").notNull(),
    base: impuestoBaseEnum("base").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (table) => ({
    cuentaIdx: index("cuenta_impuestos_cuenta_idx").on(table.cuentaId),
  }),
);

export const rubrosGasto = pgTable("rubros_gasto", {
  id: text("id").primaryKey(),
  rubro: text("rubro").notNull(),
  subrubro: text("subrubro"),
  activo: boolean("activo").notNull().default(true),
});

export const motivosDescuento = pgTable("motivos_descuento", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  activo: boolean("activo").notNull().default(true),
});

// Tablas puente de membresía por sucursal: la definición del catálogo es global,
// pero cada sucursal ve/gestiona solo las suyas. (Insumos y recetas NO usan este
// patrón: pertenecen directamente a una sucursal vía su columna sucursal_id.)
export const proveedorSucursal = pgTable(
  "proveedor_sucursal",
  {
    id: text("id").primaryKey(),
    proveedorId: text("proveedor_id")
      .notNull()
      .references(() => proveedores.id, { onDelete: "cascade" }),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "cascade" }),
  },
  (table) => ({
    uniqueProveedorSucursal: uniqueIndex("proveedor_sucursal_uq").on(
      table.proveedorId,
      table.sucursalId,
    ),
  }),
);

export const rubroSucursal = pgTable(
  "rubro_sucursal",
  {
    id: text("id").primaryKey(),
    rubroId: text("rubro_id")
      .notNull()
      .references(() => rubrosGasto.id, { onDelete: "cascade" }),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "cascade" }),
  },
  (table) => ({
    uniqueRubroSucursal: uniqueIndex("rubro_sucursal_uq").on(
      table.rubroId,
      table.sucursalId,
    ),
  }),
);

export const motivoSucursal = pgTable(
  "motivo_sucursal",
  {
    id: text("id").primaryKey(),
    motivoId: text("motivo_id")
      .notNull()
      .references(() => motivosDescuento.id, { onDelete: "cascade" }),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "cascade" }),
  },
  (table) => ({
    uniqueMotivoSucursal: uniqueIndex("motivo_sucursal_uq").on(
      table.motivoId,
      table.sucursalId,
    ),
  }),
);

export const clienteSucursal = pgTable(
  "cliente_sucursal",
  {
    id: text("id").primaryKey(),
    clienteId: text("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "cascade" }),
  },
  (table) => ({
    uniqueClienteSucursal: uniqueIndex("cliente_sucursal_uq").on(
      table.clienteId,
      table.sucursalId,
    ),
  }),
);

// Sirve también para promociones (son filas de servicios con es_promo=true).
export const servicioSucursal = pgTable(
  "servicio_sucursal",
  {
    id: text("id").primaryKey(),
    servicioId: text("servicio_id")
      .notNull()
      .references(() => servicios.id, { onDelete: "cascade" }),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "cascade" }),
  },
  (table) => ({
    uniqueServicioSucursal: uniqueIndex("servicio_sucursal_uq").on(
      table.servicioId,
      table.sucursalId,
    ),
  }),
);

export const stockSucursal = pgTable(
  "stock_sucursal",
  {
    id: text("id").primaryKey(),
    insumoId: text("insumo_id")
      .notNull()
      .references(() => insumos.id, { onDelete: "cascade" }),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "cascade" }),
    cantidad: doublePrecision("cantidad").notNull(),
  },
  (table) => ({
    uniqueStock: index("stock_sucursal_unique_idx").on(table.insumoId, table.sucursalId),
  }),
);

export const movimientosStock = pgTable("movimientos_stock", {
  id: text("id").primaryKey(),
  insumoId: text("insumo_id")
    .notNull()
    .references(() => insumos.id),
  sucursalId: text("sucursal_id")
    .notNull()
    .references(() => sucursales.id),
  tipo: tipoMovimientoStockEnum("tipo").notNull(),
  cantidad: doublePrecision("cantidad").notNull(),
  motivo: text("motivo"),
  refTipo: text("ref_tipo"),
  refId: text("ref_id"),
  usuarioId: uuid("usuario_id")
    .notNull()
    .references(() => profiles.userId),
  fecha: timestamp("fecha", { withTimezone: true }).notNull(),
});

export const ingresos = pgTable("ingresos", {
  id: text("id").primaryKey(),
  fecha: timestamp("fecha", { withTimezone: true }).notNull(),
  sucursalId: text("sucursal_id")
    .notNull()
    .references(() => sucursales.id),
  clienteId: text("cliente_id").references(() => clientes.id),
  subtotal: doublePrecision("subtotal").notNull(),
  descuentoPct: doublePrecision("descuento_pct").notNull().default(0),
  descuentoMonto: doublePrecision("descuento_monto").notNull().default(0),
  descuentoMotivoId: text("descuento_motivo_id").references(
    () => motivosDescuento.id,
  ),
  total: doublePrecision("total").notNull(),
  mp1Id: text("mp1_id")
    .notNull()
    .references(() => mediosPago.id),
  valor1: doublePrecision("valor1").notNull(),
  mp1CuentaId: text("mp1_cuenta_id").references(() => cuentasBancarias.id),
  mp2Id: text("mp2_id").references(() => mediosPago.id),
  valor2: doublePrecision("valor2"),
  mp2CuentaId: text("mp2_cuenta_id").references(() => cuentasBancarias.id),
  observacion: text("observacion"),
  usuarioId: uuid("usuario_id")
    .notNull()
    .references(() => profiles.userId),
  anulado: boolean("anulado").notNull().default(false),
  // Revisión de la venta: null = sin revisar, "ok" = correcta, "error" = con error.
  revision: text("revision"),
  revisionNota: text("revision_nota"),
  revisadoPor: uuid("revisado_por").references(() => profiles.userId),
  revisadoEn: timestamp("revisado_en", { withTimezone: true }),
});

export const ingresoLineas = pgTable("ingreso_lineas", {
  id: text("id").primaryKey(),
  ingresoId: text("ingreso_id")
    .notNull()
    .references(() => ingresos.id, { onDelete: "cascade" }),
  servicioId: text("servicio_id").references(() => servicios.id),
  insumoId: text("insumo_id").references(() => insumos.id),
  empleadoId: text("empleado_id").references(() => empleados.id),
  precioEfectivo: doublePrecision("precio_efectivo").notNull(),
  cantidad: doublePrecision("cantidad").notNull(),
  subtotal: doublePrecision("subtotal").notNull(),
  comisionPct: doublePrecision("comision_pct").notNull(),
  comisionMonto: doublePrecision("comision_monto").notNull(),
  // Trazabilidad: si esta línea proviene de una promo, apunta al servicio-promo.
  promoServicioId: text("promo_servicio_id").references(() => servicios.id),
});

export const egresos = pgTable("egresos", {
  id: text("id").primaryKey(),
  fecha: timestamp("fecha", { withTimezone: true }).notNull(),
  sucursalId: text("sucursal_id")
    .notNull()
    .references(() => sucursales.id),
  rubroId: text("rubro_id")
    .notNull()
    .references(() => rubrosGasto.id),
  insumoId: text("insumo_id").references(() => insumos.id),
  proveedorId: text("proveedor_id").references(() => proveedores.id),
  cantidad: doublePrecision("cantidad"),
  valor: doublePrecision("valor").notNull(),
  mpId: text("mp_id")
    .notNull()
    .references(() => mediosPago.id),
  mp1CuentaId: text("mp1_cuenta_id").references(() => cuentasBancarias.id),
  mp2Id: text("mp2_id").references(() => mediosPago.id),
  valor2: doublePrecision("valor2"),
  mp2CuentaId: text("mp2_cuenta_id").references(() => cuentasBancarias.id),
  observacion: text("observacion"),
  pagado: boolean("pagado").notNull().default(false),
  // Anulado: el gasto no se borra, se marca, y las lecturas lo filtran. Ver
  // drizzle/0034_egresos_anulado.sql.
  anulado: boolean("anulado").notNull().default(false),
  usuarioId: uuid("usuario_id")
    .notNull()
    .references(() => profiles.userId),
});

export const cierresCaja = pgTable("cierres_caja", {
  id: text("id").primaryKey(),
  sucursalId: text("sucursal_id")
    .notNull()
    .references(() => sucursales.id),
  fecha: text("fecha").notNull(),
  saldoInicialEf: doublePrecision("saldo_inicial_ef").notNull(),
  saldoBanco: doublePrecision("saldo_banco").notNull(),
  billetes: jsonb("billetes").$type<Record<string, number>>().notNull(),
  ingresosEf: doublePrecision("ingresos_ef").notNull(),
  egresosEf: doublePrecision("egresos_ef").notNull(),
  ingresosBanc: doublePrecision("ingresos_banc").notNull(),
  egresosBanc: doublePrecision("egresos_banc").notNull(),
  cobrosTc: doublePrecision("cobros_tc").notNull(),
  cobrosTd: doublePrecision("cobros_td").notNull(),
  vouchers: doublePrecision("vouchers").notNull(),
  giftcards: doublePrecision("giftcards").notNull(),
  autoconsumos: doublePrecision("autoconsumos").notNull(),
  cheques: doublePrecision("cheques").notNull(),
  aportes: doublePrecision("aportes").notNull(),
  ingresosCc: doublePrecision("ingresos_cc").notNull(),
  anticipos: doublePrecision("anticipos").notNull(),
  observacion: text("observacion"),
  cerradoPor: uuid("cerrado_por")
    .notNull()
    .references(() => profiles.userId),
  fechaCierre: timestamp("fecha_cierre", { withTimezone: true }).notNull(),
});

export const aperturasCaja = pgTable(
  "aperturas_caja",
  {
    id: text("id").primaryKey(),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    fecha: text("fecha").notNull(),
    abiertoPor: uuid("abierto_por")
      .notNull()
      .references(() => profiles.userId),
    fechaApertura: timestamp("fecha_apertura", { withTimezone: true }).notNull(),
    observacion: text("observacion"),
  },
  (table) => ({
    sucursalFechaIdx: uniqueIndex("aperturas_caja_sucursal_fecha_idx").on(
      table.sucursalId,
      table.fecha,
    ),
  }),
);

export const aperturaCajaCuentas = pgTable(
  "apertura_caja_cuentas",
  {
    id: text("id").primaryKey(),
    aperturaId: text("apertura_id")
      .notNull()
      .references(() => aperturasCaja.id, { onDelete: "cascade" }),
    cuentaId: text("cuenta_id")
      .notNull()
      .references(() => cuentasBancarias.id),
    saldoEsperado: doublePrecision("saldo_esperado").notNull(),
    saldoDeclarado: doublePrecision("saldo_declarado").notNull(),
  },
  (table) => ({
    aperturaIdx: index("apertura_caja_cuentas_apertura_idx").on(
      table.aperturaId,
    ),
  }),
);

export const cierreCajaCuentas = pgTable(
  "cierre_caja_cuentas",
  {
    id: text("id").primaryKey(),
    cierreId: text("cierre_id")
      .notNull()
      .references(() => cierresCaja.id, { onDelete: "cascade" }),
    cuentaId: text("cuenta_id")
      .notNull()
      .references(() => cuentasBancarias.id),
    saldoEsperado: doublePrecision("saldo_esperado").notNull(),
    saldoContado: doublePrecision("saldo_contado").notNull(),
  },
  (table) => ({
    cierreIdx: index("cierre_caja_cuentas_cierre_idx").on(table.cierreId),
  }),
);

export const turnos = pgTable(
  "turnos",
  {
    id: text("id").primaryKey(),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    servicioId: text("servicio_id")
      .notNull()
      .references(() => servicios.id),
    profesionalId: text("profesional_id")
      .notNull()
      .references(() => empleados.id),
    clienteId: text("cliente_id")
      .notNull()
      .references(() => clientes.id),
    fechaTurno: text("fecha_turno").notNull(),
    hora: text("hora").notNull(),
    duracionMin: integer("duracion_min").notNull(),
    estado: turnoEstadoEnum("estado").notNull(),
    canal: turnoCanalEnum("canal").notNull(),
    observacion: text("observacion"),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull(),
    creadoPorUsuarioId: uuid("creado_por_usuario_id").references(() => profiles.userId),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }),
    actualizadoPorUsuarioId: uuid("actualizado_por_usuario_id").references(() => profiles.userId),
    origen: origenTurnoEnum("origen").notNull(),
    sinPreferencia: boolean("sin_preferencia").notNull().default(false),
    tokenAcceso: text("token_acceso").notNull(),
    tokenExpiraEn: timestamp("token_expira_en", { withTimezone: true }).notNull(),
    confirmacionEnviadaEn: timestamp("confirmacion_enviada_en", { withTimezone: true }),
    recordatorio2hEnviadoEn: timestamp("recordatorio_2h_enviado_en", { withTimezone: true }),
  },
  (table) => ({
    tokenAccesoIdx: uniqueIndex("turnos_token_acceso_uq").on(table.tokenAcceso),
    clienteIdx: index("turnos_cliente_id_idx").on(table.clienteId),
    // La agenda filtra siempre por sucursal + fecha (día y rangos semanal/
    // mensual). Índice compuesto para evitar scans secuenciales al crecer.
    sucursalFechaIdx: index("turnos_sucursal_fecha_idx").on(
      table.sucursalId,
      table.fechaTurno,
    ),
  }),
);

export const turnoEventos = pgTable("turno_eventos", {
  id: text("id").primaryKey(),
  turnoId: text("turno_id")
    .notNull()
    .references(() => turnos.id, { onDelete: "cascade" }),
  tipo: turnoEventoTipoEnum("tipo").notNull(),
  actorUsuarioId: uuid("actor_usuario_id").references(() => profiles.userId),
  fecha: timestamp("fecha", { withTimezone: true }).notNull(),
  detalle: text("detalle"),
});

export const integracionesManychat = pgTable("integraciones_manychat", {
  sucursalId: text("sucursal_id")
    .primaryKey()
    .references(() => sucursales.id, { onDelete: "cascade" }),
  apiKey: text("api_key").notNull(),
  numeroWhatsappE164: text("numero_whatsapp_e164").notNull(),
  flowNsConfirmacion: text("flow_ns_confirmacion"),
  flowNsRecordatorio2h: text("flow_ns_recordatorio_2h"),
  flowNsCancelacion: text("flow_ns_cancelacion"),
  flowNsReprogramacion: text("flow_ns_reprogramacion"),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true }),
});

export const whatsappEnvios = pgTable(
  "whatsapp_envios",
  {
    id: text("id").primaryKey(),
    turnoId: text("turno_id").references(() => turnos.id, { onDelete: "set null" }),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    telefonoDestinoE164: text("telefono_destino_e164").notNull(),
    tipo: whatsappEnvioTipoEnum("tipo").notNull(),
    estado: whatsappEnvioEstadoEnum("estado").notNull(),
    flowNs: text("flow_ns"),
    payload: jsonb("payload"),
    respuesta: jsonb("respuesta"),
    errorDetalle: text("error_detalle"),
    enviadoEn: timestamp("enviado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    turnoIdx: index("whatsapp_envios_turno_idx").on(table.turnoId),
    tipoIdx: index("whatsapp_envios_tipo_idx").on(table.tipo),
  }),
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    // Nullable: el dueño y las encargadas no tienen ficha de empleada y también
    // se suscriben. La suscripción cuelga de user_id; empleado_id es sólo el
    // atajo para notificar "a esta empleada" sin resolver el profile.
    empleadoId: text("empleado_id").references(() => empleados.id, {
      onDelete: "cascade",
    }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (table) => ({
    endpointIdx: uniqueIndex("push_subscriptions_endpoint_uq").on(table.endpoint),
    empleadoActivoIdx: index("push_subscriptions_empleado_activo_idx").on(
      table.empleadoId,
      table.activo,
    ),
    userActivoIdx: index("push_subscriptions_user_activo_idx").on(
      table.userId,
      table.activo,
    ),
  }),
);

export const pushNotificationQueue = pgTable(
  "push_notification_queue",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    cuerpo: text("cuerpo").notNull(),
    url: text("url").notNull(),
    tipo: text("tipo").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => ({
    subscriptionPendienteIdx: index("push_notification_queue_sub_pending_idx").on(
      table.subscriptionId,
      table.deliveredAt,
      table.createdAt,
    ),
  }),
);

export const liquidaciones = pgTable(
  "liquidaciones",
  {
    id: text("id").primaryKey(),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    empleadoId: text("empleado_id")
      .notNull()
      .references(() => empleados.id),
    periodoDesde: date("periodo_desde").notNull(),
    periodoHasta: date("periodo_hasta").notNull(),
    totalServicios: integer("total_servicios").notNull().default(0),
    diasTrabajados: integer("dias_trabajados").notNull().default(0),
    totalComision: doublePrecision("total_comision").notNull().default(0),
    horasTrabajadas: doublePrecision("horas_trabajadas").notNull().default(0),
    valorHora: doublePrecision("valor_hora").notNull().default(0),
    sueldoHoras: doublePrecision("sueldo_horas").notNull().default(0),
    viaticoPorDia: doublePrecision("viatico_por_dia").notNull().default(0),
    diasViatico: doublePrecision("dias_viatico").notNull().default(0),
    totalViatico: doublePrecision("total_viatico").notNull().default(0),
    totalAnticipos: doublePrecision("total_anticipos").notNull().default(0),
    totalPagar: doublePrecision("total_pagar").notNull().default(0),
    estado: liquidacionEstadoEnum("estado").notNull().default("pendiente"),
    mpId: text("mp_id").references(() => mediosPago.id),
    fechaPago: timestamp("fecha_pago", { withTimezone: true }),
    observacion: text("observacion"),
    egresoId: text("egreso_id"),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => profiles.userId),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sucursalPeriodoIdx: index("liquidaciones_sucursal_periodo_idx").on(
      table.sucursalId,
      table.periodoDesde,
      table.periodoHasta,
    ),
    empleadoEstadoIdx: index("liquidaciones_empleado_estado_idx").on(
      table.empleadoId,
      table.estado,
    ),
  }),
);

export const liquidacionLineas = pgTable(
  "liquidacion_lineas",
  {
    id: text("id").primaryKey(),
    liquidacionId: text("liquidacion_id")
      .notNull()
      .references(() => liquidaciones.id, { onDelete: "cascade" }),
    ingresoLineaId: text("ingreso_linea_id").references(() => ingresoLineas.id, {
      onDelete: "set null",
    }),
    ingresoId: text("ingreso_id"),
    fecha: date("fecha").notNull(),
    servicioNombre: text("servicio_nombre").notNull(),
    precio: doublePrecision("precio").notNull(),
    comisionPct: doublePrecision("comision_pct").notNull(),
    comisionMonto: doublePrecision("comision_monto").notNull(),
  },
  (table) => ({
    liqIdx: index("liquidacion_lineas_liq_idx").on(table.liquidacionId),
    ingresoLineaUnq: uniqueIndex("liquidacion_lineas_unq_ingreso_linea_idx").on(
      table.ingresoLineaId,
    ),
  }),
);

export const movimientosCc = pgTable(
  "movimientos_cc",
  {
    id: text("id").primaryKey(),
    clienteId: text("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    fecha: timestamp("fecha", { withTimezone: true }).notNull(),
    tipo: text("tipo").notNull(), // "cargo" | "pago"
    monto: doublePrecision("monto").notNull(),
    sucursalId: text("sucursal_id").references(() => sucursales.id),
    mpId: text("mp_id").references(() => mediosPago.id),
    refTipo: text("ref_tipo"),
    refId: text("ref_id"),
    descripcion: text("descripcion"),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => profiles.userId),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clienteFechaIdx: index("mov_cc_cliente_fecha_idx").on(
      table.clienteId,
      table.fecha,
    ),
    refIdx: index("mov_cc_ref_idx").on(table.refTipo, table.refId),
  }),
);

export const anticipos = pgTable(
  "anticipos",
  {
    id: text("id").primaryKey(),
    empleadoId: text("empleado_id")
      .notNull()
      .references(() => empleados.id),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    fecha: timestamp("fecha", { withTimezone: true }).notNull(),
    monto: doublePrecision("monto").notNull(),
    mpId: text("mp_id").references(() => mediosPago.id),
    egresoId: text("egreso_id").references(() => egresos.id),
    liquidacionId: text("liquidacion_id").references(() => liquidaciones.id),
    observacion: text("observacion"),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => profiles.userId),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    empleadoLiqIdx: index("anticipos_empleado_liq_idx").on(
      table.empleadoId,
      table.liquidacionId,
    ),
    empleadoFechaIdx: index("anticipos_empleado_fecha_idx").on(
      table.empleadoId,
      table.fecha,
    ),
  }),
);

// Gift cards. Ver drizzle/0027_gift_cards.sql para el porqué del modelo; en
// resumen: emitir una tarjeta NO es una venta, así que no escribe en `ingresos`.
//
// `estado` sólo guarda 'activa' | 'anulada'. "Canjeada" y "vencida" se deducen
// del saldo y de vence_el al leer (src/lib/gift-card-estado.ts): son datos que
// ya están en los números y el vencimiento además no es terminal, porque el
// salón hace excepciones con la fecha.
export const giftCards = pgTable(
  "gift_cards",
  {
    id: text("id").primaryKey(),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    codigo: text("codigo").notNull(),
    importe: doublePrecision("importe").notNull(),
    saldo: doublePrecision("saldo").notNull(),
    estado: text("estado").notNull().default("activa"), // "activa" | "anulada"
    fechaEmision: timestamp("fecha_emision", { withTimezone: true }).notNull(),
    venceEl: date("vence_el"),
    compradora: text("compradora"),
    beneficiaria: text("beneficiaria"),
    observacion: text("observacion"),
    emitidaPreSistema: boolean("emitida_pre_sistema").notNull().default(false),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => profiles.userId),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Único POR SUCURSAL: cada salón numera sus tarjetas por su cuenta y una
    // gift card sólo se canjea donde se vendió. Sobre upper() para que no entre
    // un duplicado por diferencia de mayúsculas.
    sucursalCodigoUq: uniqueIndex("gift_cards_sucursal_codigo_uq").on(
      table.sucursalId,
      sql`upper(${table.codigo})`,
    ),
    sucursalEstadoIdx: index("gift_cards_sucursal_estado_idx").on(
      table.sucursalId,
      table.estado,
    ),
  }),
);

// Historial append-only de cada tarjeta. `monto` va firmado (la emisión suma, el
// canje resta) y `saldo_resultante` se guarda redundante a propósito, para poder
// auditar el historial sin recalcular la suma entera.
export const giftCardMovimientos = pgTable(
  "gift_card_movimientos",
  {
    id: text("id").primaryKey(),
    giftCardId: text("gift_card_id")
      .notNull()
      .references(() => giftCards.id, { onDelete: "cascade" }),
    fecha: timestamp("fecha", { withTimezone: true }).notNull(),
    // "emision" | "canje" | "anulacion" | "ajuste" | "correccion_codigo"
    tipo: text("tipo").notNull(),
    monto: doublePrecision("monto").notNull().default(0),
    saldoResultante: doublePrecision("saldo_resultante").notNull(),
    // Sin foreign key, igual que movimientos_cc y liquidacion_lineas: las ventas
    // no se borran nunca (se anulan), así que la FK sólo ataría el orden de los
    // inserts sin proteger de nada.
    ingresoId: text("ingreso_id"),
    descripcion: text("descripcion"),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => profiles.userId),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tarjetaFechaIdx: index("gift_card_mov_tarjeta_fecha_idx").on(
      table.giftCardId,
      table.fecha,
    ),
    ingresoIdx: index("gift_card_mov_ingreso_idx").on(table.ingresoId),
  }),
);


// Viáticos cargados a mano, por empleada y por día. Ver drizzle/0032_viaticos.sql
// para el porqué: antes salían de un monto fijo en la ficha multiplicado por una
// cantidad de días que el sistema adivinaba contando ventas.
export const viaticos = pgTable(
  "viaticos",
  {
    id: text("id").primaryKey(),
    empleadoId: text("empleado_id")
      .notNull()
      .references(() => empleados.id, { onDelete: "cascade" }),
    sucursalId: text("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    fecha: date("fecha").notNull(),
    monto: doublePrecision("monto").notNull(),
    /** La plata ya se le dio: entonces hay egreso y no se vuelve a pagar al liquidar. */
    pagado: boolean("pagado").notNull().default(false),
    egresoId: text("egreso_id").references(() => egresos.id),
    liquidacionId: text("liquidacion_id").references(() => liquidaciones.id),
    observacion: text("observacion"),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => profiles.userId),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    empleadoFechaUq: uniqueIndex("viaticos_empleado_fecha_uq").on(
      table.empleadoId,
      table.fecha,
    ),
    sucursalFechaIdx: index("viaticos_sucursal_fecha_idx").on(
      table.sucursalId,
      table.fecha,
    ),
    liquidacionIdx: index("viaticos_liquidacion_idx").on(table.liquidacionId),
  }),
);

export const schema = {
  authUsers,
  profiles,
  sucursales,
  empleados,
  clientes,
  clienteFichaRegistros,
  proveedores,
  servicios,
  promocionItems,
  horariosSucursal,
  serviciosHorarios,
  profesionalesAgenda,
  profesionalesHorarios,
  profesionalesServicios,
  insumos,
  recetas,
  insumoProveedores,
  mediosPago,
  cuentasBancarias,
  movimientosBancarios,
  cuentaImpuestos,
  rubrosGasto,
  motivosDescuento,
  stockSucursal,
  movimientosStock,
  ingresos,
  ingresoLineas,
  egresos,
  cierresCaja,
  turnos,
  turnoEventos,
  integracionesManychat,
  whatsappEnvios,
  pushSubscriptions,
  pushNotificationQueue,
  liquidaciones,
  liquidacionLineas,
  movimientosCc,
  anticipos,
  giftCards,
  giftCardMovimientos,
};
