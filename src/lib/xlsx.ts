/**
 * Planillas de Excel (.xlsx) sin dependencias.
 *
 * El salón pide "descargarlo en Excel" para contar con la planilla en la mano y
 * para mandar la lista de compras. Un .xlsx es un zip con unos XML adentro; para
 * escribir tablas simples alcanza con esto, sin sumar una librería al servidor.
 *
 * Sólo escribe: texto, números, un encabezado en negrita y anchos de columna.
 * Las celdas de texto van "inline" (sin tabla de strings compartidos), que Excel,
 * LibreOffice y Google Sheets abren igual.
 */
import { deflateRawSync } from "node:zlib";

export type FormatoColumna =
  /** Texto. */
  | "texto"
  /** Número tal cual (103,5). */
  | "numero"
  /** Con dos decimales (103,50). */
  | "decimal"
  /** Pesos sin decimales ($ 12.345). */
  | "moneda"
  /** Celda vacía con borde y fondo, para escribir a mano lo contado. */
  | "entrada";

export interface ColumnaXlsx {
  titulo: string;
  /** En caracteres, como el ancho de columna de Excel. */
  ancho?: number;
  formato?: FormatoColumna;
}

export type CeldaXlsx = string | number | null | undefined;

export interface HojaXlsx {
  /** Hasta 31 caracteres y sin : \ / ? * [ ] (lo exige Excel). */
  nombre: string;
  /** Renglones antes del encabezado (título, fecha). Van en negrita. */
  titulo?: string[];
  columnas: ColumnaXlsx[];
  filas: CeldaXlsx[][];
  /** Para imprimir: horizontal y todas las columnas en una hoja. */
  horizontal?: boolean;
}

// Índices de cellXfs en styles.xml.
const ESTILO = {
  normal: 0,
  encabezado: 1,
  moneda: 2,
  decimal: 3,
  entrada: 4,
  titulo: 5,
} as const;

function estiloDe(formato: FormatoColumna | undefined): number {
  switch (formato) {
    case "moneda":
      return ESTILO.moneda;
    case "decimal":
      return ESTILO.decimal;
    case "entrada":
      return ESTILO.entrada;
    default:
      return ESTILO.normal;
  }
}

function escaparXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Caracteres de control que XML no admite (salvo tab y salto de línea).
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

/** 0 → A, 25 → Z, 26 → AA. */
export function letraColumna(indice: number): string {
  let n = indice + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function nombreHoja(nombre: string, usados: Set<string>): string {
  const base = nombre.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Hoja";
  let candidato = base;
  for (let i = 2; usados.has(candidato.toLowerCase()); i++) {
    const sufijo = ` (${i})`;
    candidato = base.slice(0, 31 - sufijo.length) + sufijo;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

function celdaXml(ref: string, valor: CeldaXlsx, estilo: number): string {
  const s = estilo ? ` s="${estilo}"` : "";
  if (valor === null || valor === undefined || valor === "") {
    // Las de entrada se escriben igual, vacías, para que tengan el borde.
    return estilo ? `<c r="${ref}"${s}/>` : "";
  }
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "";
    return `<c r="${ref}"${s}><v>${valor}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escaparXml(valor)}</t></is></c>`;
}

function hojaXml(hoja: HojaXlsx): string {
  const filasXml: string[] = [];
  let nro = 1;
  for (const linea of hoja.titulo ?? []) {
    filasXml.push(`<row r="${nro}">${celdaXml(`A${nro}`, linea, ESTILO.titulo)}</row>`);
    nro++;
  }
  if (hoja.titulo?.length) nro++; // un renglón en blanco antes de la tabla
  const filaEncabezado = nro;
  filasXml.push(
    `<row r="${nro}">${hoja.columnas
      .map((c, i) => celdaXml(`${letraColumna(i)}${nro}`, c.titulo, ESTILO.encabezado))
      .join("")}</row>`,
  );
  nro++;
  for (const fila of hoja.filas) {
    const celdas = hoja.columnas
      .map((c, i) => {
        const valor = fila[i];
        // Un texto en una columna numérica (un "—") no lleva formato de número.
        const estilo =
          typeof valor === "string" && c.formato !== "entrada"
            ? ESTILO.normal
            : estiloDe(c.formato);
        return celdaXml(`${letraColumna(i)}${nro}`, valor, estilo);
      })
      .join("");
    filasXml.push(`<row r="${nro}">${celdas}</row>`);
    nro++;
  }

  const cols = hoja.columnas
    .map(
      (c, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${c.ancho ?? 12}" customWidth="1"/>`,
    )
    .join("");
  const ultimaCol = letraColumna(Math.max(hoja.columnas.length - 1, 0));
  const ultimaFila = Math.max(nro - 1, filaEncabezado);
  // Encabezado fijo al scrollear y filtro en cada columna.
  const pane = `<pane ySplit="${filaEncabezado}" topLeftCell="A${filaEncabezado + 1}" activePane="bottomLeft" state="frozen"/>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${filasXml.join("")}</sheetData>` +
    `<autoFilter ref="A${filaEncabezado}:${ultimaCol}${ultimaFila}"/>` +
    `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="${hoja.horizontal ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>` +
    `</worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot; #,##0"/></numFmts>` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="4">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFE7E1D8"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFFFF8E1"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="2">` +
  `<border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left style="thin"><color rgb="FF999999"/></left><right style="thin"><color rgb="FF999999"/></right><top style="thin"><color rgb="FF999999"/></top><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border>` +
  `</borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="6">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** Arma el .xlsx. */
export function crearXlsx(hojas: HojaXlsx[]): Buffer {
  const usados = new Set<string>();
  const nombres = hojas.map((h) => nombreHoja(h.nombre, usados));
  const archivos: { nombre: string; contenido: string }[] = [
    {
      nombre: "[Content_Types].xml",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        hojas
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        `</Types>`,
    },
    {
      nombre: "_rels/.rels",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      nombre: "xl/workbook.xml",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>` +
        nombres
          .map((n, i) => `<sheet name="${escaparXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join("") +
        `</sheets>` +
        // El filtro de cada hoja necesita su nombre definido para que Excel lo
        // muestre activo al abrir.
        `<definedNames>` +
        hojas
          .map((h, i) => {
            const fila = (h.titulo?.length ? h.titulo.length + 1 : 0) + 1;
            const ultimaFila = fila + h.filas.length;
            const col = letraColumna(Math.max(h.columnas.length - 1, 0));
            return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escaparXml(nombres[i].replace(/'/g, "''"))}'!$A$${fila}:$${col}$${ultimaFila}</definedName>`;
          })
          .join("") +
        `</definedNames>` +
        `</workbook>`,
    },
    {
      nombre: "xl/_rels/workbook.xml.rels",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        hojas
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    },
    { nombre: "xl/styles.xml", contenido: STYLES_XML },
    ...hojas.map((h, i) => ({
      nombre: `xl/worksheets/sheet${i + 1}.xml`,
      contenido: hojaXml(h),
    })),
  ];
  return zip(archivos.map((a) => ({ nombre: a.nombre, datos: Buffer.from(a.contenido, "utf8") })));
}

/** Respuesta HTTP para descargar el .xlsx. */
export function respuestaXlsx(archivo: Buffer, nombre: string): Response {
  const seguro = nombre.replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${seguro}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}

// --- zip -------------------------------------------------------------------

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip con compresión deflate. Fecha fija: el contenido no depende del reloj. */
function zip(archivos: { nombre: string; datos: Buffer }[]): Buffer {
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  // 01/01/2026 00:00 en formato DOS.
  const fechaDos = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const a of archivos) {
    const nombre = Buffer.from(a.nombre, "utf8");
    const comprimido = deflateRawSync(a.datos);
    const crc = crc32(a.datos);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // hora
    local.writeUInt16LE(fechaDos, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(a.datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28);
    partes.push(local, nombre, comprimido);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4); // hecho por
    dir.writeUInt16LE(20, 6); // versión necesaria
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(fechaDos, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(comprimido.length, 20);
    dir.writeUInt32LE(a.datos.length, 24);
    dir.writeUInt16LE(nombre.length, 28);
    dir.writeUInt16LE(0, 30); // extra
    dir.writeUInt16LE(0, 32); // comentario
    dir.writeUInt16LE(0, 34); // disco
    dir.writeUInt16LE(0, 36); // atributos internos
    dir.writeUInt32LE(0, 38); // atributos externos
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nombre);

    offset += local.length + nombre.length + comprimido.length;
  }
  const centralBuf = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(centralBuf.length, 12);
  fin.writeUInt32LE(offset, 16);
  fin.writeUInt16LE(0, 20);
  return Buffer.concat([...partes, centralBuf, fin]);
}
