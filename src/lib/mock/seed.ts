/**
 * Datos seed para desarrollo. Cantidades chicas pero realistas.
 */
import type { Cliente } from "../types";
import type { Store } from "./store";

// IDs deterministas: en serverless, cada instancia corre seed() de forma
// independiente. Si los IDs fueran random, las cookies guardadas con un id de
// la instancia A nunca matchean en la B → loop /dev/login → /dashboard →
// /dev/login. Un contador estable garantiza el mismo id en todas las réplicas
// porque el seed se ejecuta siempre en el mismo orden.
let __seq = 0;
const uid = () => `seed-${(++__seq).toString(36).padStart(6, "0")}`;
const resetSeq = () => {
  __seq = 0;
};

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toIsoDateTime(date: Date, hour: number, minute = 0) {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next.toISOString();
}

export function seed(): Store {
  resetSeq();
  const today = new Date();

  // Sucursales
  const sucCentro = {
    id: uid(),
    nombre: "Malala Centro",
    activo: true,
    slug: "centro",
    direccion: "Corrientes 1677, San Miguel de Tucuman",
    telefono: "+54 9 381 555-4101",
    horario_resumen: "Lunes a sabados de 9 a 20 hs",
    rating: 4.9,
    reviews: 288,
    mapa_url: "https://maps.google.com/?q=Corrientes+1677+San+Miguel+de+Tucuman",
    descripcion_corta: "Nails, cejas, facial y peluqueria en pleno centro.",
  };
  const sucBarrioNorte = {
    id: uid(),
    nombre: "Malala Barrio Norte",
    activo: true,
    slug: "barrio-norte",
    direccion: "25 de Mayo 745, San Miguel de Tucuman",
    telefono: "+54 9 381 555-4102",
    horario_resumen: "Lunes a sabados de 10 a 19:30 hs",
    rating: 4.8,
    reviews: 174,
    mapa_url: "https://maps.google.com/?q=25+de+Mayo+745+San+Miguel+de+Tucuman",
    descripcion_corta: "Servicios express y agenda flexible para la zona norte.",
  };

  const horariosSucursal = [
    { id: uid(), sucursal_id: sucCentro.id, dia_semana: 1, apertura: "09:00", cierre: "20:00" },
    { id: uid(), sucursal_id: sucCentro.id, dia_semana: 2, apertura: "09:00", cierre: "20:00" },
    { id: uid(), sucursal_id: sucCentro.id, dia_semana: 3, apertura: "09:00", cierre: "20:00" },
    { id: uid(), sucursal_id: sucCentro.id, dia_semana: 4, apertura: "09:00", cierre: "20:00" },
    { id: uid(), sucursal_id: sucCentro.id, dia_semana: 5, apertura: "09:00", cierre: "20:00" },
    { id: uid(), sucursal_id: sucCentro.id, dia_semana: 6, apertura: "09:00", cierre: "20:00" },
    { id: uid(), sucursal_id: sucBarrioNorte.id, dia_semana: 1, apertura: "10:00", cierre: "19:30" },
    { id: uid(), sucursal_id: sucBarrioNorte.id, dia_semana: 2, apertura: "10:00", cierre: "19:30" },
    { id: uid(), sucursal_id: sucBarrioNorte.id, dia_semana: 3, apertura: "10:00", cierre: "19:30" },
    { id: uid(), sucursal_id: sucBarrioNorte.id, dia_semana: 4, apertura: "10:00", cierre: "19:30" },
    { id: uid(), sucursal_id: sucBarrioNorte.id, dia_semana: 5, apertura: "10:00", cierre: "19:30" },
    { id: uid(), sucursal_id: sucBarrioNorte.id, dia_semana: 6, apertura: "10:00", cierre: "19:30" },
  ];

  // Usuarios (auth stub: el id se usa como sesion)
  const userAdmin = {
    id: uid(),
    email: "admin@malala.com",
    nombre: "Admin Centro",
    rol: "admin" as const,
    sucursal_default_id: sucCentro.id,
    activo: true,
  };
  const userAdminNorte: Store["usuarios"][number] = {
    id: uid(),
    email: "admin.norte@malala.com",
    nombre: "Admin Barrio Norte",
    rol: "admin" as const,
    sucursal_default_id: sucBarrioNorte.id,
    empleado_id: undefined,
    activo: true,
  };
  const userEncargadaCentro: Store["usuarios"][number] = {
    id: uid(),
    email: "encargada.centro@malala.com",
    nombre: "Carolina (Encargada Centro)",
    rol: "encargada" as const,
    sucursal_default_id: sucCentro.id,
    empleado_id: undefined,
    activo: true,
  };
  const userEmpleadoCentro: Store["usuarios"][number] = {
    id: uid(),
    email: "anita@malala.com",
    nombre: "Anita Juarez",
    rol: "empleado" as const,
    sucursal_default_id: sucCentro.id,
    empleado_id: undefined,
    activo: true,
  };
  const userEncargadaNorte: Store["usuarios"][number] = {
    id: uid(),
    email: "encargada.norte@malala.com",
    nombre: "Micaela (Encargada Norte)",
    rol: "encargada" as const,
    sucursal_default_id: sucBarrioNorte.id,
    activo: true,
  };
  const userEmpleadoNorte: Store["usuarios"][number] = {
    id: uid(),
    email: "eliana@malala.com",
    nombre: "Eliana Monroy",
    rol: "empleado" as const,
    sucursal_default_id: sucBarrioNorte.id,
    empleado_id: undefined,
    activo: true,
  };

  // Medios de pago
  const mpEF = { id: uid(), sucursal_id: sucCentro.id, codigo: "EF", nombre: "Efectivo", activo: true, recargo_pct: 0 };
  const mpTR = { id: uid(), sucursal_id: sucCentro.id, codigo: "TR", nombre: "Transferencia", activo: true, recargo_pct: 0 };
  const mpTC = { id: uid(), sucursal_id: sucCentro.id, codigo: "TC", nombre: "Tarjeta credito", activo: true, recargo_pct: 0 };
  const mpTD = { id: uid(), sucursal_id: sucCentro.id, codigo: "TD", nombre: "Tarjeta debito", activo: true, recargo_pct: 0 };
  const mpMP = { id: uid(), sucursal_id: sucCentro.id, codigo: "MP", nombre: "Mercado Pago", activo: true, recargo_pct: 0 };
  const mpCC = { id: uid(), sucursal_id: sucCentro.id, codigo: "CC", nombre: "Cuenta corriente", activo: true, recargo_pct: 0 };

  // Rubros de gasto
  const rgInsumos = { id: uid(), rubro: "Insumos", subrubro: "Compra", activo: true };
  const rgServicios = { id: uid(), rubro: "Servicios", subrubro: "Luz/Agua", activo: true };
  const rgSueldos = { id: uid(), rubro: "Sueldos", activo: true };
  const rgVarios = { id: uid(), rubro: "Varios", activo: true };

  // Proveedores
  const provVlinda = { id: uid(), nombre: "VLinda", telefono: "+5493815551001", deuda_pendiente: 0 };
  const provKeraplus = { id: uid(), nombre: "Keraplus", telefono: "+5493815551002", deuda_pendiente: 0 };
  const provDistrilook = { id: uid(), nombre: "Distrilook", deuda_pendiente: 0 };

  // Empleados
  const empAnita = {
    id: uid(),
    nombre: "Anita Juarez",
    activo: true,
    sucursal_principal_id: sucCentro.id,
    tipo_comision: "mixto" as const,
    porcentaje_default: 30,
    sueldo_asegurado: 800000,
    valor_hora: 5000,
    viatico_por_dia: 4500,
    horas_por_dia: 8,
    dias_trabajo: [2, 3, 4, 5, 6],
    observacion: "Color y brushing",
  };
  const empCamila = {
    id: uid(),
    nombre: "Camila Moreno",
    activo: true,
    sucursal_principal_id: sucCentro.id,
    tipo_comision: "porcentaje" as const,
    porcentaje_default: 30,
    sueldo_asegurado: 500000,
    valor_hora: 4000,
    viatico_por_dia: 0,
    horas_por_dia: 8,
    dias_trabajo: [1, 2, 3, 4, 5],
    observacion: "Nails artist",
  };
  const empEliana = {
    id: uid(),
    nombre: "Eliana Monroy",
    activo: true,
    sucursal_principal_id: sucBarrioNorte.id,
    tipo_comision: "porcentaje" as const,
    porcentaje_default: 30,
    sueldo_asegurado: 500000,
    valor_hora: 4000,
    viatico_por_dia: 3000,
    horas_por_dia: 6,
    dias_trabajo: [3, 4, 5, 6],
    observacion: "Nails y pedicuria",
  };
  const empCarolina = {
    id: uid(),
    nombre: "Carolina Rodriguez",
    activo: true,
    sucursal_principal_id: sucCentro.id,
    tipo_comision: "sueldo_fijo" as const,
    porcentaje_default: 10,
    sueldo_asegurado: 1150000,
    valor_hora: 6000,
    viatico_por_dia: 5000,
    horas_por_dia: 9,
    dias_trabajo: [1, 2, 3, 4, 5, 6],
    observacion: "Encargada y cejas",
  };

  userEncargadaCentro.empleado_id = empCarolina.id;
  userEmpleadoCentro.empleado_id = empAnita.id;
  userEmpleadoNorte.empleado_id = empEliana.id;

  const profesionalesAgenda = [
    {
      id: uid(),
      empleado_id: empAnita.id,
      sucursal_id: sucCentro.id,
      especialidad: "Color y peluqueria",
      avatar_url: "/professionals/anita.png",
      color: "#3f5f5c",
      bio: "Especialista en color, corte y nutricion capilar.",
      prioridad: 1,
      activo_publico: true,
    },
    {
      id: uid(),
      empleado_id: empCamila.id,
      sucursal_id: sucCentro.id,
      especialidad: "Manos y softgel",
      avatar_url: "/professionals/camila.png",
      color: "#8f6b7d",
      bio: "DiseÃ±os delicados, semi y esculpidas.",
      prioridad: 2,
      activo_publico: true,
    },
    {
      id: uid(),
      empleado_id: empCarolina.id,
      sucursal_id: sucCentro.id,
      especialidad: "Cejas y recepcion premium",
      avatar_url: "/professionals/carolina.png",
      color: "#a98b58",
      bio: "DiseÃ±o de cejas y experiencia de bienvenida.",
      prioridad: 3,
      activo_publico: true,
    },
    {
      id: uid(),
      empleado_id: empEliana.id,
      sucursal_id: sucBarrioNorte.id,
      especialidad: "Nails y pedicuria",
      avatar_url: "/professionals/eliana.png",
      color: "#627f6e",
      bio: "Agenda flexible para servicios express.",
      prioridad: 1,
      activo_publico: true,
    },
  ];

  const profesionalesHorarios = [
    { id: uid(), empleado_id: empAnita.id, sucursal_id: sucCentro.id, dia_semana: 2, apertura: "09:00", cierre: "17:00" },
    { id: uid(), empleado_id: empAnita.id, sucursal_id: sucCentro.id, dia_semana: 3, apertura: "09:00", cierre: "17:00" },
    { id: uid(), empleado_id: empAnita.id, sucursal_id: sucCentro.id, dia_semana: 4, apertura: "09:00", cierre: "17:00" },
    { id: uid(), empleado_id: empAnita.id, sucursal_id: sucCentro.id, dia_semana: 5, apertura: "11:00", cierre: "19:00" },
    { id: uid(), empleado_id: empCamila.id, sucursal_id: sucCentro.id, dia_semana: 1, apertura: "10:00", cierre: "18:00" },
    { id: uid(), empleado_id: empCamila.id, sucursal_id: sucCentro.id, dia_semana: 2, apertura: "10:00", cierre: "18:00" },
    { id: uid(), empleado_id: empCamila.id, sucursal_id: sucCentro.id, dia_semana: 4, apertura: "10:00", cierre: "18:00" },
    { id: uid(), empleado_id: empEliana.id, sucursal_id: sucBarrioNorte.id, dia_semana: 3, apertura: "10:00", cierre: "14:00" },
    { id: uid(), empleado_id: empEliana.id, sucursal_id: sucBarrioNorte.id, dia_semana: 3, apertura: "15:00", cierre: "19:00" },
    { id: uid(), empleado_id: empEliana.id, sucursal_id: sucBarrioNorte.id, dia_semana: 5, apertura: "10:00", cierre: "19:00" },
  ];

  // Clientes
  const cliMaria = { id: uid(), nombre: "Maria Perez", telefono: "+5493815552001", activo: true, saldo_cc: 0, cuenta_corriente_habilitada: true };
  const cliLucia = { id: uid(), nombre: "Lucia Gomez", telefono: "+5493815552002", activo: true, saldo_cc: 0, cuenta_corriente_habilitada: true };
  const cliSofia = { id: uid(), nombre: "Sofia Lopez", telefono: "+5493815552003", activo: true, saldo_cc: 0, cuenta_corriente_habilitada: true };
  const cliConsumidor = { id: uid(), nombre: "Consumidor Final", activo: true, saldo_cc: 0, cuenta_corriente_habilitada: false };

  // Servicios
  const servCorteMujer = {
    id: uid(),
    rubro: "SERVICIOS DE PELUQUERIA",
    nombre: "Corte mujer",
    precio_lista: 25000,
    precio_efectivo: 22000,
    comision_default_pct: 30,
    activo: true,
    duracion_min: 50,
    descripcion_corta: "Asesoria y terminacion personalizada.",
  };
  const servBrushing = {
    id: uid(),
    rubro: "SERVICIOS DE PELUQUERIA",
    nombre: "Brushing",
    precio_lista: 18000,
    precio_efectivo: 16000,
    comision_default_pct: 30,
    activo: true,
    duracion_min: 45,
    descripcion_corta: "Peinado con movimiento y brushing final.",
  };
  const servColorRaiz = {
    id: uid(),
    rubro: "SERVICIOS DE PELUQUERIA",
    nombre: "Color raiz",
    precio_lista: 45000,
    precio_efectivo: 40000,
    comision_default_pct: 30,
    activo: true,
    duracion_min: 90,
    descripcion_corta: "Cobertura de crecimiento y brillo.",
    destacado_pct: 15,
  };
  const servManosEsmaltado = {
    id: uid(),
    rubro: "BELLEZA DE MANOS Y PIES",
    nombre: "Esmalte comun - Manos",
    precio_lista: 12000,
    precio_efectivo: 10000,
    comision_default_pct: 30,
    activo: true,
    duracion_min: 45,
    descripcion_corta: "Manicuria tradicional con color.",
    destacado_pct: 20,
  };
  const servManosSemi = {
    id: uid(),
    rubro: "BELLEZA DE MANOS Y PIES",
    nombre: "Esmaltado Semi (manos o pies)",
    precio_lista: 18000,
    precio_efectivo: 15000,
    comision_default_pct: 30,
    activo: true,
    duracion_min: 45,
    descripcion_corta: "Duracion extendida y brillo espejo.",
    destacado_pct: 20,
  };
  const servPiesSemi = {
    id: uid(),
    rubro: "BELLEZA DE MANOS Y PIES",
    nombre: "Podo + semi o tradicional",
    precio_lista: 20000,
    precio_efectivo: 17000,
    comision_default_pct: 30,
    activo: true,
    duracion_min: 75,
    descripcion_corta: "Spa rapido para pies con esmaltado.",
    destacado_pct: 20,
  };
  const servEsculpidas = {
    id: uid(),
    rubro: "BELLEZA DE MANOS Y PIES",
    nombre: "Esculpidas / softgel",
    precio_lista: 31000,
    precio_efectivo: 25000,
    comision_default_pct: 30,
    activo: true,
    duracion_min: 75,
    descripcion_corta: "Extension con acabado natural.",
    destacado_pct: 20,
  };
  const servCejas = {
    id: uid(),
    rubro: "CEJAS Y PESTANAS",
    nombre: "Diseno de cejas",
    precio_lista: 10000,
    precio_efectivo: 8000,
    comision_default_pct: 30,
    activo: true,
    duracion_min: 30,
    descripcion_corta: "Diseno y perfilado segun visagismo.",
  };
  const servLaminado = {
    id: uid(),
    rubro: "CEJAS Y PESTANAS",
    nombre: "Laminado de cejas",
    precio_lista: 18000,
    precio_efectivo: 15000,
    comision_default_pct: 30,
    activo: true,
    duracion_min: 45,
    descripcion_corta: "Definicion y fijacion de cejas.",
  };
  const servFacial = {
    id: uid(),
    rubro: "FACIAL",
    nombre: "Limpieza facial basica",
    precio_lista: 30000,
    precio_efectivo: 26000,
    comision_default_pct: 30,
    activo: true,
    duracion_min: 60,
    descripcion_corta: "Limpieza profunda y mascara final.",
  };
  const servPromoHair = {
    id: uid(),
    rubro: "PROMO HAIR",
    nombre: "Nutricion + brushing",
    precio_lista: 36000,
    precio_efectivo: 32000,
    comision_default_pct: 30,
    activo: true,
    duracion_min: 75,
    descripcion_corta: "Tratamiento express con peinado.",
    destacado_pct: 10,
  };

  const profesionalesServicios = [
    { id: uid(), empleado_id: empAnita.id, sucursal_id: sucCentro.id, servicio_id: servCorteMujer.id },
    { id: uid(), empleado_id: empAnita.id, sucursal_id: sucCentro.id, servicio_id: servBrushing.id },
    { id: uid(), empleado_id: empAnita.id, sucursal_id: sucCentro.id, servicio_id: servColorRaiz.id },
    { id: uid(), empleado_id: empCamila.id, sucursal_id: sucCentro.id, servicio_id: servManosEsmaltado.id },
    { id: uid(), empleado_id: empCamila.id, sucursal_id: sucCentro.id, servicio_id: servManosSemi.id },
    { id: uid(), empleado_id: empCamila.id, sucursal_id: sucCentro.id, servicio_id: servEsculpidas.id },
    { id: uid(), empleado_id: empEliana.id, sucursal_id: sucBarrioNorte.id, servicio_id: servManosSemi.id },
    { id: uid(), empleado_id: empEliana.id, sucursal_id: sucBarrioNorte.id, servicio_id: servPiesSemi.id },
    { id: uid(), empleado_id: empCarolina.id, sucursal_id: sucCentro.id, servicio_id: servCejas.id },
    { id: uid(), empleado_id: empCarolina.id, sucursal_id: sucCentro.id, servicio_id: servLaminado.id },
  ];

  // Insumos
  const insShampoo = {
    id: uid(),
    nombre: "Shampoo neutro 1L",
    proveedor_ids: [provVlinda.id],
    unidad_medida: "ml" as const,
    tamano_envase: 1000,
    precio_envase: 8000,
    precio_unitario: 8,
    umbral_stock_bajo: 500,
    activo: true,
    tipo: "bacha" as const,
    vendible: false,
  };
  const insTinturaCastano = {
    id: uid(),
    nombre: "Tintura castano 60g",
    proveedor_ids: [provKeraplus.id],
    unidad_medida: "g" as const,
    tamano_envase: 60,
    precio_envase: 4500,
    precio_unitario: 75,
    umbral_stock_bajo: 240,
    activo: true,
    tipo: "bacha" as const,
    vendible: false,
  };
  const insOxidante20 = {
    id: uid(),
    nombre: "Oxidante 20vol 1L",
    proveedor_ids: [provKeraplus.id],
    unidad_medida: "ml" as const,
    tamano_envase: 1000,
    precio_envase: 6000,
    precio_unitario: 6,
    umbral_stock_bajo: 1000,
    activo: true,
    tipo: "bacha" as const,
    vendible: false,
  };
  const insEsmalteSemi = {
    id: uid(),
    nombre: "Esmalte semipermanente 15ml",
    proveedor_ids: [provDistrilook.id],
    unidad_medida: "ml" as const,
    tamano_envase: 15,
    precio_envase: 3500,
    precio_unitario: 233.33,
    umbral_stock_bajo: 60,
    activo: true,
    tipo: "bacha" as const,
    vendible: false,
  };
  const insAlgodonDisco = {
    id: uid(),
    nombre: "Disco algodon",
    proveedor_ids: [provVlinda.id],
    unidad_medida: "ud" as const,
    tamano_envase: 100,
    precio_envase: 1500,
    precio_unitario: 15,
    umbral_stock_bajo: 200,
    activo: true,
    tipo: "bacha" as const,
    vendible: false,
  };
  const insAcetona = {
    id: uid(),
    nombre: "Acetona 500ml",
    proveedor_ids: [provVlinda.id],
    unidad_medida: "ml" as const,
    tamano_envase: 500,
    precio_envase: 2500,
    precio_unitario: 5,
    umbral_stock_bajo: 500,
    activo: true,
    tipo: "bacha" as const,
    vendible: false,
  };
  const insMascarillaFacial = {
    id: uid(),
    nombre: "Mascarilla facial unidosis",
    proveedor_ids: [provDistrilook.id],
    unidad_medida: "aplicacion" as const,
    tamano_envase: 1,
    precio_envase: 1200,
    precio_unitario: 1200,
    umbral_stock_bajo: 10,
    activo: true,
    tipo: "bacha" as const,
    vendible: false,
  };

  // Insumos y recetas son por sucursal: en el mock viven todos en la sucursal centro.
  const insumos = [
    insShampoo,
    insTinturaCastano,
    insOxidante20,
    insEsmalteSemi,
    insAlgodonDisco,
    insAcetona,
    insMascarillaFacial,
  ].map((i) => ({ ...i, sucursal_id: sucCentro.id }));

  // Recetas
  const recetas = [
    { id: uid(), servicio_id: servCorteMujer.id, insumo_id: insShampoo.id, cantidad: 30 },
    { id: uid(), servicio_id: servBrushing.id, insumo_id: insShampoo.id, cantidad: 20 },
    { id: uid(), servicio_id: servColorRaiz.id, insumo_id: insTinturaCastano.id, cantidad: 30 },
    { id: uid(), servicio_id: servColorRaiz.id, insumo_id: insOxidante20.id, cantidad: 60 },
    { id: uid(), servicio_id: servColorRaiz.id, insumo_id: insAlgodonDisco.id, cantidad: 4 },
    { id: uid(), servicio_id: servManosSemi.id, insumo_id: insEsmalteSemi.id, cantidad: 2 },
    { id: uid(), servicio_id: servManosSemi.id, insumo_id: insAcetona.id, cantidad: 5 },
    { id: uid(), servicio_id: servPiesSemi.id, insumo_id: insEsmalteSemi.id, cantidad: 2 },
    { id: uid(), servicio_id: servManosEsmaltado.id, insumo_id: insAcetona.id, cantidad: 3 },
    { id: uid(), servicio_id: servFacial.id, insumo_id: insMascarillaFacial.id, cantidad: 1 },
  ].map((r) => ({ ...r, sucursal_id: sucCentro.id }));

  const stockSucursal = insumos.map((i) => ({
    id: uid(),
    insumo_id: i.id,
    sucursal_id: i.sucursal_id,
    cantidad: i.umbral_stock_bajo * 3,
  }));

  // Ventas / ingresos de muestra
  const ingresos: Store["ingresos"] = [];
  const ingresoLineas: Store["ingresoLineas"] = [];

  function fechaHaceDias(dias: number, hora = 14) {
    return toIsoDateTime(addDays(today, -dias), hora);
  }

  function crearTicket(args: {
    fecha: string;
    sucursalId: string;
    clienteId?: string;
    lineas: Array<{
      servicioId: string;
      empleadoId: string;
      precio: number;
      comisionPct?: number;
    }>;
    mp1Id: string;
    valor1?: number;
    mp2Id?: string;
    valor2?: number;
    descuentoPct?: number;
    observacion?: string;
  }) {
    const ingresoId = uid();
    const subtotal = args.lineas.reduce((acc, l) => acc + l.precio, 0);
    const descuentoPct = args.descuentoPct ?? 0;
    const descuentoMonto = subtotal * (descuentoPct / 100);
    const total = subtotal - descuentoMonto;

    ingresos.push({
      id: ingresoId,
      fecha: args.fecha,
      sucursal_id: args.sucursalId,
      cliente_id: args.clienteId,
      subtotal,
      descuento_pct: descuentoPct,
      descuento_monto: descuentoMonto,
      total,
      mp1_id: args.mp1Id,
      valor1: args.valor1 ?? total,
      mp2_id: args.mp2Id,
      valor2: args.valor2,
      observacion: args.observacion,
      usuario_id: userEncargadaCentro.id,
      anulado: false,
    });

    for (const l of args.lineas) {
      const pct = l.comisionPct ?? 30;
      ingresoLineas.push({
        id: uid(),
        ingreso_id: ingresoId,
        servicio_id: l.servicioId,
        empleado_id: l.empleadoId,
        precio_efectivo: l.precio,
        cantidad: 1,
        subtotal: l.precio,
        comision_pct: pct,
        comision_monto: l.precio * (pct / 100),
      });
    }
  }

  crearTicket({
    fecha: fechaHaceDias(0, 11),
    sucursalId: sucCentro.id,
    clienteId: cliMaria.id,
    lineas: [
      { servicioId: servColorRaiz.id, empleadoId: empAnita.id, precio: 40000 },
      { servicioId: servBrushing.id, empleadoId: empAnita.id, precio: 16000 },
    ],
    mp1Id: mpEF.id,
  });

  crearTicket({
    fecha: fechaHaceDias(0, 13),
    sucursalId: sucCentro.id,
    clienteId: cliLucia.id,
    lineas: [
      { servicioId: servManosSemi.id, empleadoId: empCamila.id, precio: 15000 },
      { servicioId: servPiesSemi.id, empleadoId: empCamila.id, precio: 17000 },
    ],
    mp1Id: mpTC.id,
    valor1: 32000,
  });

  crearTicket({
    fecha: fechaHaceDias(0, 16),
    sucursalId: sucCentro.id,
    clienteId: cliSofia.id,
    lineas: [
      { servicioId: servCorteMujer.id, empleadoId: empAnita.id, precio: 22000 },
      { servicioId: servManosEsmaltado.id, empleadoId: empCamila.id, precio: 10000 },
    ],
    mp1Id: mpEF.id,
    valor1: 20000,
    mp2Id: mpTR.id,
    valor2: 12000,
  });

  crearTicket({
    fecha: fechaHaceDias(0, 15),
    sucursalId: sucBarrioNorte.id,
    clienteId: cliMaria.id,
    lineas: [{ servicioId: servManosSemi.id, empleadoId: empEliana.id, precio: 15000 }],
    mp1Id: mpEF.id,
  });

  crearTicket({
    fecha: fechaHaceDias(1, 17),
    sucursalId: sucCentro.id,
    clienteId: cliConsumidor.id,
    lineas: [{ servicioId: servCejas.id, empleadoId: empCarolina.id, precio: 8000 }],
    mp1Id: mpEF.id,
  });

  crearTicket({
    fecha: fechaHaceDias(3, 12),
    sucursalId: sucCentro.id,
    clienteId: cliLucia.id,
    lineas: [
      { servicioId: servCorteMujer.id, empleadoId: empAnita.id, precio: 22000 },
      { servicioId: servColorRaiz.id, empleadoId: empAnita.id, precio: 40000 },
    ],
    mp1Id: mpTC.id,
    descuentoPct: 10,
    observacion: "Cliente frecuente",
  });

  type TurnoBase = Omit<
    Store["turnos"][number],
    "cliente_id" | "cliente_telefono_e164" | "token_acceso" | "token_expira_en"
  >;
  const turnosBase: TurnoBase[] = [
    {
      id: uid(),
      sucursal_id: sucCentro.id,
      servicio_id: servManosSemi.id,
      profesional_id: empCamila.id,
      cliente_nombre: "Valentina Gomez",
      cliente_telefono: "+5493815557771",
      fecha_turno: toIsoDate(today),
      hora: "10:00",
      duracion_min: 45,
      estado: "pendiente",
      canal: "web",
      observacion: "Quiere tono nude.",
      creado_en: toIsoDateTime(addDays(today, -2), 18, 30),
      creado_por_usuario_id: userEmpleadoCentro.id,
      actualizado_en: toIsoDateTime(addDays(today, -1), 9, 15),
      actualizado_por_usuario_id: userEncargadaCentro.id,
      origen: "publico",
      sin_preferencia: false,
    },
    {
      id: uid(),
      sucursal_id: sucCentro.id,
      servicio_id: servColorRaiz.id,
      profesional_id: empAnita.id,
      cliente_nombre: "Julieta Sosa",
      cliente_telefono: "+5493815557772",
      fecha_turno: toIsoDate(today),
      hora: "11:30",
      duracion_min: 90,
      estado: "pendiente",
      canal: "web",
      creado_en: toIsoDateTime(addDays(today, -1), 21, 0),
      creado_por_usuario_id: userAdmin.id,
      origen: "publico",
      sin_preferencia: true,
    },
    {
      id: uid(),
      sucursal_id: sucCentro.id,
      servicio_id: servCejas.id,
      profesional_id: empCarolina.id,
      cliente_nombre: "Rocio Ferreyra",
      cliente_telefono: "+5493815557773",
      fecha_turno: toIsoDate(today),
      hora: "15:00",
      duracion_min: 30,
      estado: "pendiente",
      canal: "recepcion",
      creado_en: toIsoDateTime(today, 9, 45),
      creado_por_usuario_id: userEncargadaCentro.id,
      actualizado_en: toIsoDateTime(today, 15, 5),
      actualizado_por_usuario_id: userEncargadaCentro.id,
      origen: "interno",
      sin_preferencia: false,
    },
    {
      id: uid(),
      sucursal_id: sucBarrioNorte.id,
      servicio_id: servPiesSemi.id,
      profesional_id: empEliana.id,
      cliente_nombre: "Daniela Ruiz",
      cliente_telefono: "+5493815557774",
      fecha_turno: toIsoDate(today),
      hora: "16:15",
      duracion_min: 75,
      estado: "pendiente",
      canal: "web",
      creado_en: toIsoDateTime(addDays(today, -3), 13, 15),
      creado_por_usuario_id: userEncargadaNorte.id,
      origen: "publico",
      sin_preferencia: true,
    },
    {
      id: uid(),
      sucursal_id: sucCentro.id,
      servicio_id: servFacial.id,
      profesional_id: empCarolina.id,
      cliente_nombre: "Martina Lobo",
      cliente_telefono: "+5493815557775",
      fecha_turno: toIsoDate(addDays(today, 1)),
      hora: "12:15",
      duracion_min: 60,
      estado: "pendiente",
      canal: "web",
      creado_en: toIsoDateTime(addDays(today, -1), 10, 0),
      creado_por_usuario_id: userAdmin.id,
      origen: "publico",
      sin_preferencia: false,
    },
    {
      id: uid(),
      sucursal_id: sucCentro.id,
      servicio_id: servEsculpidas.id,
      profesional_id: empCamila.id,
      cliente_nombre: "Agustina Vera",
      cliente_telefono: "+5493815557776",
      fecha_turno: toIsoDate(addDays(today, 2)),
      hora: "17:30",
      duracion_min: 75,
      estado: "pendiente",
      canal: "web",
      creado_en: toIsoDateTime(addDays(today, -1), 19, 15),
      creado_por_usuario_id: userAdmin.id,
      origen: "publico",
      sin_preferencia: false,
    },
    {
      id: uid(),
      sucursal_id: sucBarrioNorte.id,
      servicio_id: servManosEsmaltado.id,
      profesional_id: empEliana.id,
      cliente_nombre: "Paula Diaz",
      cliente_telefono: "+5493815557777",
      fecha_turno: toIsoDate(addDays(today, 3)),
      hora: "10:45",
      duracion_min: 45,
      estado: "cancelado",
      canal: "web",
      creado_en: toIsoDateTime(addDays(today, -4), 17, 5),
      creado_por_usuario_id: userEncargadaNorte.id,
      actualizado_en: toIsoDateTime(addDays(today, -2), 10, 30),
      actualizado_por_usuario_id: userEncargadaNorte.id,
      origen: "publico",
      sin_preferencia: true,
    },
  ];

  function mockToken(turnoId: string) {
    return `mock-token-${turnoId}`;
  }

  const clientesCatalogo: Cliente[] = [
    cliMaria,
    cliLucia,
    cliSofia,
    cliConsumidor,
  ];

  const turnos: Store["turnos"] = turnosBase.map((base) => {
    const clienteMatch = clientesCatalogo.find(
      (c) => c.telefono === base.cliente_telefono,
    );
    const clienteId = clienteMatch?.id ?? `mock-cli-${base.id}`;
    if (!clienteMatch) {
      clientesCatalogo.push({
        id: clienteId,
        nombre: base.cliente_nombre,
        telefono: base.cliente_telefono,
        telefono_e164: base.cliente_telefono,
        email: base.cliente_email,
        activo: true,
        saldo_cc: 0,
        cuenta_corriente_habilitada: true,
      });
    }
    return {
      ...base,
      cliente_id: clienteId,
      cliente_telefono_e164: base.cliente_telefono,
      token_acceso: mockToken(base.id),
      token_expira_en: `${base.fecha_turno}T${base.hora}:00-03:00`,
    };
  });

  const turnoEventos: Store["turnoEventos"] = turnos.flatMap((turno) => {
    const eventos: Store["turnoEventos"] = [
      {
        id: uid(),
        turno_id: turno.id,
        tipo: "creado" as const,
        actor_usuario_id: turno.creado_por_usuario_id,
        fecha: turno.creado_en,
        detalle: `Turno creado via ${turno.canal}`,
      },
    ];

    if (turno.estado === "cancelado") {
      eventos.push({
        id: uid(),
        turno_id: turno.id,
        tipo: "cancelado" as const,
        actor_usuario_id: turno.actualizado_por_usuario_id ?? turno.creado_por_usuario_id,
        fecha: turno.actualizado_en ?? turno.creado_en,
        detalle: "Cancelado por cliente",
      });
    }

    return eventos;
  });

  const egresos: Store["egresos"] = [
    {
      id: uid(),
      fecha: fechaHaceDias(0, 10),
      sucursal_id: sucCentro.id,
      rubro_id: rgInsumos.id,
      proveedor_id: provKeraplus.id,
      valor: 42000,
      mp_id: mpTR.id,
      observacion: "Reposicion coloracion",
      pagado: true,
      anulado: false,
      usuario_id: userEncargadaCentro.id,
    },
    {
      id: uid(),
      fecha: fechaHaceDias(1, 9),
      sucursal_id: sucBarrioNorte.id,
      rubro_id: rgServicios.id,
      valor: 18500,
      mp_id: mpEF.id,
      observacion: "Limpieza y mantenimiento",
      pagado: true,
      anulado: false,
      usuario_id: userEncargadaNorte.id,
    },
    {
      id: uid(),
      fecha: fechaHaceDias(2, 18),
      sucursal_id: sucCentro.id,
      rubro_id: rgVarios.id,
      valor: 12500,
      mp_id: mpMP.id,
      observacion: "Amenidades clientes",
      pagado: true,
      anulado: false,
      usuario_id: userAdmin.id,
    },
  ];

  return {
    sucursales: [sucCentro, sucBarrioNorte],
    horariosSucursal,
    usuarios: [
      userAdmin,
      userAdminNorte,
      userEncargadaCentro,
      userEmpleadoCentro,
      userEncargadaNorte,
      userEmpleadoNorte,
    ],
    empleados: [empAnita, empCamila, empEliana, empCarolina],
    profesionalesAgenda,
    profesionalesHorarios,
    profesionalesServicios,
    clientes: clientesCatalogo,
    proveedores: [provVlinda, provKeraplus, provDistrilook],
    servicios: [
      servCorteMujer,
      servBrushing,
      servColorRaiz,
      servManosEsmaltado,
      servManosSemi,
      servPiesSemi,
      servEsculpidas,
      servCejas,
      servLaminado,
      servFacial,
      servPromoHair,
    ],
    insumos,
    recetas,
    mediosPago: [mpEF, mpTR, mpTC, mpTD, mpMP, mpCC],
    rubrosGasto: [rgInsumos, rgServicios, rgSueldos, rgVarios],
    stockSucursal,
    movimientosStock: [],
    ingresos,
    ingresoLineas,
    turnos,
    turnoEventos,
    egresos,
    cierresCaja: [],
  };
}

