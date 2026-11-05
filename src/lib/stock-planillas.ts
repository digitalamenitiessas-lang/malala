/**
 * Las planillas de Excel del control de stock y los números que comparten con
 * las pantallas. Todo en ENVASES, que es como se cuenta y se compra: nadie
 * cuenta 6.210 g de tintura, cuenta 103 pomos y medio.
 */
import type {
  ConteoDetalle,
  FilaCompra,
  FilaConteo,
  FilaReporte,
  InsumoControl,
} from "@/lib/data/stock-control";
import { CONCEPTO_LABEL, type ParametrosCompra } from "./stock-control";
import type { HojaXlsx } from "./xlsx";

const UNIDAD: Record<string, string> = { ud: "ud", ml: "ml", g: "g", aplicacion: "apl." };

export function unidadDe(insumo: Pick<InsumoControl, "unidad_medida">): string {
  return UNIDAD[insumo.unidad_medida] ?? insumo.unidad_medida;
}

/** "pomo de 60 g", o la unidad si se cuenta por unidad. */
export function envaseDe(insumo: Pick<InsumoControl, "unidad_medida" | "tamano_envase">): string {
  return insumo.tamano_envase === 1
    ? unidadDe(insumo)
    : `${insumo.tamano_envase.toLocaleString("es-AR")} ${unidadDe(insumo)}`;
}

/** Unidad base → envases, con dos decimales. */
export function aEnvases(base: number, insumo: Pick<InsumoControl, "tamano_envase">): number {
  const factor = insumo.tamano_envase > 0 ? insumo.tamano_envase : 1;
  return Math.round((base / factor) * 100) / 100;
}

export function fmtEnvases(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

/** Por proveedor, con los que no tienen al final. */
export function compararProveedor(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return (a ? 0 : 1) - (b ? 0 : 1);
  return a.localeCompare(b, "es");
}

/** Por proveedor y después por nombre: en el salón se guardan por marca. */
function porProveedor<T extends { insumo?: InsumoControl } | InsumoControl>(
  filas: T[],
  insumoDe: (f: T) => InsumoControl,
): T[] {
  return [...filas].sort((a, b) => {
    const ia = insumoDe(a);
    const ib = insumoDe(b);
    return (
      compararProveedor(ia.proveedor, ib.proveedor) ||
      ia.nombre.localeCompare(ib.nombre, "es")
    );
  });
}

export function hojasPlanillaConteo(
  filas: FilaConteo[],
  encabezado: { sucursal: string; momento: string },
): HojaXlsx[] {
  const titulo = (que: string) => [
    `Planilla de conteo · ${que} · ${encabezado.sucursal}`,
    `Stock del sistema al ${encabezado.momento}. Anotá lo contado en envases; los abiertos como fracción (medio = 0,5).`,
  ];
  const bacha = porProveedor(
    filas.filter((f) => f.tipo === "bacha"),
    (f) => f,
  );
  const venta = porProveedor(
    filas.filter((f) => f.tipo === "venta"),
    (f) => f,
  );
  return [
    {
      nombre: "Uso del salón",
      titulo: titulo("Uso del salón"),
      horizontal: true,
      columnas: [
        { titulo: "Código", ancho: 9 },
        { titulo: "Producto", ancho: 40 },
        { titulo: "Proveedor", ancho: 22 },
        { titulo: "Envase", ancho: 10 },
        { titulo: "Sistema (env.)", ancho: 12, formato: "numero" },
        { titulo: "Contado (env.)", ancho: 14, formato: "entrada" },
        { titulo: "Observaciones", ancho: 30, formato: "entrada" },
      ],
      filas: bacha.map((f) => [
        f.codigo ?? "",
        f.nombre,
        f.proveedor ?? "",
        envaseDe(f),
        aEnvases(f.sistema.cantidad, f),
        null,
        null,
      ]),
    },
    {
      nombre: "Reventa",
      titulo: titulo("Reventa"),
      horizontal: true,
      columnas: [
        { titulo: "Código", ancho: 9 },
        { titulo: "Producto", ancho: 40 },
        { titulo: "Proveedor", ancho: 22 },
        { titulo: "Envase", ancho: 10 },
        { titulo: "Sistema depósito", ancho: 11, formato: "numero" },
        { titulo: "Sistema exhibición", ancho: 11, formato: "numero" },
        { titulo: "Contado depósito", ancho: 11, formato: "entrada" },
        { titulo: "Contado exhibición", ancho: 11, formato: "entrada" },
        { titulo: "Observaciones", ancho: 26, formato: "entrada" },
      ],
      filas: venta.map((f) => [
        f.codigo ?? "",
        f.nombre,
        f.proveedor ?? "",
        envaseDe(f),
        aEnvases(f.sistema.deposito, f),
        aEnvases(f.sistema.cantidad - f.sistema.deposito, f),
        null,
        null,
        null,
      ]),
    },
  ];
}

export function hojaConteo(
  conteo: ConteoDetalle,
  encabezado: { sucursal: string; momento: string },
): HojaXlsx {
  return {
    nombre: "Conteo",
    titulo: [
      `Conteo del ${encabezado.momento} · ${encabezado.sucursal}`,
      [
        conteo.contado_por ? `Contó: ${conteo.contado_por}` : null,
        `Cargó: ${conteo.usuario_nombre}`,
        conteo.nota || null,
      ]
        .filter(Boolean)
        .join(" · "),
    ],
    horizontal: true,
    columnas: [
      { titulo: "Producto", ancho: 40 },
      { titulo: "Tipo", ancho: 12 },
      { titulo: "Envase", ancho: 10 },
      { titulo: "Sistema (env.)", ancho: 12, formato: "numero" },
      { titulo: "Contado (env.)", ancho: 12, formato: "numero" },
      { titulo: "Diferencia (env.)", ancho: 12, formato: "numero" },
      { titulo: "Diferencia $", ancho: 13, formato: "moneda" },
      { titulo: "Depósito sistema", ancho: 11, formato: "numero" },
      { titulo: "Depósito contado", ancho: 11, formato: "numero" },
    ],
    filas: conteo.items.map((i) => [
      i.insumo.nombre,
      i.insumo.tipo === "venta" ? "Reventa" : "Uso del salón",
      envaseDe(i.insumo),
      aEnvases(i.sistema, i.insumo),
      aEnvases(i.contado, i.insumo),
      aEnvases(i.contado - i.sistema, i.insumo),
      (i.contado - i.sistema) * (i.costo_unitario ?? 0),
      i.sistema_deposito != null ? aEnvases(i.sistema_deposito, i.insumo) : null,
      i.contado_deposito != null ? aEnvases(i.contado_deposito, i.insumo) : null,
    ]),
  };
}

export function hojaReporte(
  filas: FilaReporte[],
  encabezado: { sucursal: string; periodo: string },
): HojaXlsx {
  return {
    nombre: "Reporte de stock",
    titulo: [
      `Reporte de stock · ${encabezado.sucursal}`,
      `${encabezado.periodo}. En envases; las salidas en negativo. Valores a costo de hoy.`,
    ],
    horizontal: true,
    columnas: [
      { titulo: "Producto", ancho: 38 },
      { titulo: "Tipo", ancho: 12 },
      { titulo: "Proveedor", ancho: 20 },
      { titulo: "Envase", ancho: 10 },
      { titulo: "Stock inicial", ancho: 10, formato: "numero" },
      { titulo: CONCEPTO_LABEL.compras, ancho: 10, formato: "numero" },
      { titulo: "Consumo / ventas", ancho: 11, formato: "numero" },
      { titulo: CONCEPTO_LABEL.uso_interno, ancho: 10, formato: "numero" },
      { titulo: CONCEPTO_LABEL.conteo, ancho: 11, formato: "numero" },
      { titulo: CONCEPTO_LABEL.otros, ancho: 10, formato: "numero" },
      { titulo: "Stock final", ancho: 10, formato: "numero" },
      { titulo: "Depósito inicial", ancho: 10, formato: "numero" },
      { titulo: "Depósito final", ancho: 10, formato: "numero" },
      { titulo: "Exhibición final", ancho: 10, formato: "numero" },
      { titulo: "Consumo $", ancho: 12, formato: "moneda" },
      { titulo: "Dif. conteo $", ancho: 12, formato: "moneda" },
      { titulo: "Valor final $", ancho: 13, formato: "moneda" },
    ],
    filas: filas.map((f) => {
      const i = f.insumo;
      const c = f.conceptos;
      const pu = i.precio_unitario ?? 0;
      const venta = i.tipo === "venta";
      return [
        i.nombre,
        venta ? "Reventa" : "Uso del salón",
        i.proveedor ?? "",
        envaseDe(i),
        aEnvases(f.inicial.cantidad, i),
        aEnvases(c.compras, i),
        aEnvases(c.consumo + c.ventas, i),
        aEnvases(c.uso_interno, i),
        aEnvases(c.conteo, i),
        aEnvases(c.otros, i),
        aEnvases(f.final.cantidad, i),
        venta ? aEnvases(f.inicial.deposito, i) : null,
        venta ? aEnvases(f.final.deposito, i) : null,
        venta ? aEnvases(f.final.cantidad - f.final.deposito, i) : null,
        -(c.consumo + c.ventas + c.uso_interno) * pu,
        c.conteo * pu,
        Math.max(f.final.cantidad, 0) * pu,
      ];
    }),
  };
}

export function hojaCompras(
  filas: FilaCompra[],
  encabezado: { sucursal: string; fecha: string; dias: number; p: ParametrosCompra },
): HojaXlsx {
  return {
    nombre: "Para comprar",
    titulo: [
      `Lista para comprar · ${encabezado.sucursal} · ${encabezado.fecha}`,
      `Consumo de los últimos ${encabezado.dias} días. Alcanza para ${encabezado.p.frecuenciaDias} días hasta la próxima compra, más ${encabezado.p.margenDias} de margen.`,
    ],
    columnas: [
      { titulo: "Proveedor", ancho: 22 },
      { titulo: "Producto", ancho: 40 },
      { titulo: "Envase", ancho: 10 },
      { titulo: "Stock (env.)", ancho: 10, formato: "numero" },
      { titulo: "Uso por semana (env.)", ancho: 12, formato: "numero" },
      { titulo: "Alcanza (días)", ancho: 10, formato: "numero" },
      { titulo: "Comprar (env.)", ancho: 10, formato: "numero" },
      { titulo: "Costo estimado", ancho: 13, formato: "moneda" },
    ],
    filas: porProveedor(filas, (f) => f.insumo).map((f) => [
      f.insumo.proveedor ?? "Sin proveedor",
      f.insumo.nombre,
      envaseDe(f.insumo),
      aEnvases(f.stock, f.insumo),
      aEnvases(f.sugerencia.consumoDiario * 7, f.insumo),
      f.sugerencia.diasQueAlcanza != null ? Math.floor(f.sugerencia.diasQueAlcanza) : null,
      f.sugerencia.comprarEnvases,
      f.sugerencia.comprarEnvases * f.insumo.precio_envase,
    ]),
  };
}
