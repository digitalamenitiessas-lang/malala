/**
 * Lector mínimo de xlsx para los scripts de carga: un xlsx es un zip con XML
 * adentro, así que se descomprime y se parsea a mano. Se implementa acá en vez
 * de sumar una dependencia al proyecto por un par de scripts que corren una vez.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateRawSync, inflateRawSync } from "node:zlib";

/** Descomprime el zip en memoria: devuelve nombre de archivo → contenido. */
export function leerZip(buf: Buffer): Map<string, Buffer> {
  const archivos = new Map<string, Buffer>();
  // El End Of Central Directory está al final; se busca su firma hacia atrás.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("No es un zip válido (falta el EOCD)");

  const entradas = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < entradas; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Central directory corrupto");
    const metodo = buf.readUInt16LE(p + 10);
    const tamComprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    const offsetLocal = buf.readUInt32LE(p + 42);
    const nombre = buf.toString("utf8", p + 46, p + 46 + largoNombre);

    // El header local repite nombre y extra, con largos propios.
    const nombreLocal = buf.readUInt16LE(offsetLocal + 26);
    const extraLocal = buf.readUInt16LE(offsetLocal + 28);
    const inicio = offsetLocal + 30 + nombreLocal + extraLocal;
    const crudo = buf.subarray(inicio, inicio + tamComprimido);

    archivos.set(nombre, metodo === 0 ? crudo : inflateRawSync(crudo));
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return archivos;
}

export function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/** "AB" → 28. Las columnas de Excel son base-26 con letras. */
export function columnaANumero(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Lee un xlsx y devuelve, por hoja, una matriz de strings (fila → columna). */
export function leerXlsx(ruta: string): Map<string, string[][]> {
  const zip = leerZip(readFileSync(ruta));
  const texto = (n: string) => zip.get(n)?.toString("utf8") ?? "";

  const compartidas: string[] = [];
  for (const m of texto("xl/sharedStrings.xml").matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)) {
    const partes = [...m[1].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((t) => desescapar(t[1]));
    compartidas.push(partes.join(""));
  }

  // Los atributos vienen en cualquier orden según qué programa haya escrito el
  // archivo (Id/Target o Type/Target/Id), así que se lee cada tag entero y
  // después se sacan los atributos por separado.
  const atributo = (tag: string, nombre: string) =>
    new RegExp(`${nombre}="([^"]*)"`).exec(tag)?.[1];

  const rels = new Map<string, string>();
  for (const m of texto("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = atributo(m[0], "Id");
    const target = atributo(m[0], "Target");
    if (id && target) rels.set(id, target);
  }

  const hojas = new Map<string, string[][]>();
  for (const tag of texto("xl/workbook.xml").matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const nombreHoja = atributo(tag[0], "name");
    const rid = atributo(tag[0], "r:id");
    if (!nombreHoja || !rid) continue;
    const destino = (rels.get(rid) ?? "").replace(/^\//, "").replace(/^xl\//, "");
    if (!destino) continue;
    const xml = texto(`xl/${destino}`);
    const filas: string[][] = [];
    for (const fm of xml.matchAll(/<(?:\w+:)?row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
      const celdas: string[] = [];
      // Ojo: hay celdas vacías auto-cerradas (<c r="Q4" s="7"/>) que deben
      // consumirse, si no se traga el contenido de las celdas siguientes.
      for (const cm of fm[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const attrs = cm[1];
        const cuerpo = cm[2] ?? "";
        const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
        const tipo = /t="([^"]+)"/.exec(attrs)?.[1];
        const v = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(cuerpo);
        let valor = v ? desescapar(v[1]) : "";
        if (tipo === "s" && v) valor = compartidas[Number(v[1])] ?? "";
        if (tipo === "inlineStr")
          valor = [...cuerpo.matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
            .map((t) => desescapar(t[1]))
            .join("");
        if (ref) celdas[columnaANumero(ref) - 1] = valor;
      }
      filas[Number(fm[1]) - 1] = celdas;
    }
    hojas.set(desescapar(nombreHoja), filas);
  }
  return hojas;
}


/* --------------------------------------------------------------------------
 * Escritura. Misma razon que la lectura: un xlsx es un zip con tres XML, y
 * no vale la pena sumar una dependencia. Hace falta para las planillas que se
 * le mandan al salon a completar: un CSV no sirve porque el Excel en español
 * separa por punto y coma y un CSV con comas se abre todo en una sola columna.
 * -------------------------------------------------------------------------- */
const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** ZIP sin directorios ni extras: lo minimo que Excel acepta. */
function zip(archivos: Array<{ nombre: string; datos: Buffer }>): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let offset = 0;

  for (const a of archivos) {
    const nombre = Buffer.from(a.nombre, "utf8");
    const comprimido = deflateRawSync(a.datos);
    const crc = crc32(a.datos);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version necesaria
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // metodo: deflate
    local.writeUInt32LE(0, 10); // fecha/hora: irrelevante
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(a.datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28);
    locales.push(local, nombre, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(a.datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(0, 38); // atributos externos
    central.writeUInt32LE(offset, 42);
    centrales.push(central, nombre);

    offset += 30 + nombre.length + comprimido.length;
  }

  const cuerpoCentral = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(cuerpoCentral.length, 12);
  fin.writeUInt32LE(offset, 16);

  return Buffer.concat([...locales, cuerpoCentral, fin]);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A, B, ... Z, AA, AB, ... */
function columna(i: number): string {
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) {
    s = String.fromCharCode(65 + (n % 26)) + s;
  }
  return s;
}

export type Celda = string | number | null | undefined;

export interface HojaOpts {
  /** Ancho de cada columna, en caracteres. */
  anchos?: number[];
  /** Nombre de la pestaña. */
  nombre?: string;
}

/**
 * Escribe una hoja. La primera fila se formatea como encabezado (negrita y
 * fondo) y queda fija al hacer scroll: son planillas de 124 filas que alguien
 * va a completar a mano y sin eso se pierde de vista que columna es cual.
 */
export function escribirXlsx(
  ruta: string,
  filas: Celda[][],
  opts: HojaOpts = {},
): void {
  const nombreHoja = esc(opts.nombre ?? "Hoja1");

  const cols = opts.anchos?.length
    ? `<cols>${opts.anchos
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";

  const cuerpo = filas
    .map((fila, r) => {
      const celdas = fila
        .map((v, c) => {
          const ref = `${columna(c)}${r + 1}`;
          const estilo = r === 0 ? ' s="1"' : "";
          if (v == null || v === "") return `<c r="${ref}"${estilo}/>`;
          if (typeof v === "number" && Number.isFinite(v)) {
            return `<c r="${ref}"${estilo}><v>${v}</v></c>`;
          }
          return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${celdas}</row>`;
    })
    .join("");

  const hoja =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    cols +
    `<sheetData>${cuerpo}</sheetData></worksheet>`;

  const estilos =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFEDE7DD"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border/></borders>` +
    `<cellStyleXfs count="1"><xf/></cellStyleXfs>` +
    `<cellXfs count="2"><xf xfId="0"/>` +
    `<xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs>` +
    `</styleSheet>`;

  const archivos = [
    {
      nombre: "[Content_Types].xml",
      datos: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `</Types>`,
        "utf8",
      ),
    },
    {
      nombre: "_rels/.rels",
      datos: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`,
        "utf8",
      ),
    },
    {
      nombre: "xl/workbook.xml",
      datos: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="${nombreHoja}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        "utf8",
      ),
    },
    {
      nombre: "xl/_rels/workbook.xml.rels",
      datos: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`,
        "utf8",
      ),
    },
    { nombre: "xl/styles.xml", datos: Buffer.from(estilos, "utf8") },
    { nombre: "xl/worksheets/sheet1.xml", datos: Buffer.from(hoja, "utf8") },
  ];

  writeFileSync(ruta, zip(archivos));
}
