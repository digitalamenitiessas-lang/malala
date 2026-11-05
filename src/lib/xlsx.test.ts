import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, crearXlsx, letraColumna } from "./xlsx";

/** Lee el zip por el directorio central, como lo hace Excel. */
function leerZip(buf: Buffer): Map<string, string> {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const total = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < total; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const crc = buf.readUInt32LE(p + 16);
    const comp = buf.readUInt32LE(p + 20);
    const largo = buf.readUInt32LE(p + 24);
    const nLen = buf.readUInt16LE(p + 28);
    const offset = buf.readUInt32LE(p + 42);
    const nombre = buf.subarray(p + 46, p + 46 + nLen).toString("utf8");
    expect(buf.readUInt32LE(offset)).toBe(0x04034b50);
    const ini = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const datos = inflateRawSync(buf.subarray(ini, ini + comp));
    expect(datos.length).toBe(largo);
    expect(crc32(datos)).toBe(crc);
    out.set(nombre, datos.toString("utf8"));
    p += 46 + nLen;
  }
  return out;
}

describe("crearXlsx", () => {
  it("arma un zip válido con las partes de un libro", () => {
    const archivo = crearXlsx([
      {
        nombre: "Uso del salón",
        titulo: ["Planilla de conteo", "Yerba Buena"],
        columnas: [
          { titulo: "Producto", ancho: 30 },
          { titulo: "Sistema", formato: "numero" },
          { titulo: "Contado", formato: "entrada" },
          { titulo: "Valor", formato: "moneda" },
        ],
        filas: [
          ["Tintura Igora <Royal> & cía", 103.5, null, 1234.5],
          ["Oxidante", -2, null, "—"],
        ],
      },
      { nombre: "Reventa", columnas: [{ titulo: "Producto" }], filas: [] },
    ]);
    const partes = leerZip(archivo);
    expect([...partes.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    const hoja = partes.get("xl/worksheets/sheet1.xml")!;
    // Título en A1, A2; renglón en blanco; encabezado en la 4.
    expect(hoja).toContain('<row r="1"><c r="A1" s="5" t="inlineStr">');
    expect(hoja).toContain('<pane ySplit="4" topLeftCell="A5"');
    expect(hoja).toContain("Tintura Igora &lt;Royal&gt; &amp; cía");
    expect(hoja).toContain('<c r="B5"><v>103.5</v></c>');
    // La celda para escribir va vacía pero con estilo.
    expect(hoja).toContain('<c r="C5" s="4"/>');
    expect(hoja).toContain('<c r="D5" s="2"><v>1234.5</v></c>');
    // Un texto en columna de pesos no lleva formato de número.
    expect(hoja).toContain('<c r="D6" t="inlineStr">');
    expect(hoja).toContain('<autoFilter ref="A4:D6"/>');
    expect(partes.get("xl/workbook.xml")).toContain(
      "'Uso del salón'!$A$4:$D$6",
    );
  });

  it("no repite nombres de hoja", () => {
    const partes = leerZip(
      crearXlsx([
        { nombre: "Stock", columnas: [], filas: [] },
        { nombre: "stock", columnas: [], filas: [] },
      ]),
    );
    expect(partes.get("xl/workbook.xml")).toContain('name="stock (2)"');
  });
});

describe("letraColumna", () => {
  it("cuenta como Excel", () => {
    expect([0, 25, 26, 27, 51, 52].map(letraColumna)).toEqual(["A", "Z", "AA", "AB", "AZ", "BA"]);
  });
});
