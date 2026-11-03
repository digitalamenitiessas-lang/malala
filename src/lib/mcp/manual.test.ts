import { describe, expect, it } from "vitest";
import { buscarTemas, cargarManual, consultarManual, parsearTema, type TemaManual } from "./manual";

const caja = parsearTema(
  "caja-cerrar",
  "# Cerrar la caja\r\npalabras: cierre, arqueo, contar plata\r\nquién: encargada\r\n\r\nAl final del día se cuenta la plata.",
);
const viaticos = parsearTema(
  "viaticos",
  "# Viáticos de las chicas\npalabras: viatico, colectivo, Ya se lo di\nquién: encargada\n\nCómo cargar un viático.",
);
const temas: TemaManual[] = [caja, viaticos];

describe("parsearTema", () => {
  it("separa título, palabras, quién y texto (también con CRLF)", () => {
    expect(caja).toEqual({
      id: "caja-cerrar",
      titulo: "Cerrar la caja",
      palabras: ["cierre", "arqueo", "contar plata"],
      quien: "encargada",
      texto: "Al final del día se cuenta la plata.",
    });
  });
});

describe("buscarTemas", () => {
  it("encuentra por palabra clave sin importar tildes ni conjugación", () => {
    expect(buscarTemas(temas, "¿Cómo hago el arqueo?")[0].id).toBe("caja-cerrar");
    expect(buscarTemas(temas, "cargué mal los viáticos")[0].id).toBe("viaticos");
  });

  it("sin coincidencias no devuelve nada", () => {
    expect(buscarTemas(temas, "facturación electrónica AFIP")).toEqual([]);
  });
});

describe("consultarManual", () => {
  it("sin argumentos lista los temas", () => {
    expect(consultarManual(temas, {})).toEqual({
      temas: [
        { id: "caja-cerrar", titulo: "Cerrar la caja", palabras: caja.palabras },
        { id: "viaticos", titulo: "Viáticos de las chicas", palabras: viaticos.palabras },
      ],
    });
  });

  it("si no encuentra nada le pide a la IA que no invente", () => {
    const r = consultarManual(temas, { buscar: "AFIP" }) as { aviso: string };
    expect(r.aviso).toMatch(/No inventes/);
  });
});

describe("el manual del repo responde lo que preguntan los salones", () => {
  const manual = cargarManual();
  // Preguntas tal como llegaron por WhatsApp a Luciano.
  const casos: [string, string][] = [
    ["tengo el efectivo bien pero arriba dice otro importe, no me cierra la caja", "diferencias-de-caja"],
    ["cargué mal los viáticos, me aparecen ya entregado y no pagué todavía", "viaticos"],
    ["cómo doy de alta una cuenta de mercado pago", "cuentas-y-medios-de-pago"],
    ["podemos exportar informes filtrados en pdf o excel", "reportes-y-pdf"],
    ["tengo un pago con 2 gift card", "venta-medios-de-pago"],
    ["me olvidé de cargar una venta de ayer y la caja ya está cerrada", "caja-corregir-dia-pasado"],
    ["cómo le pago a un proveedor lo que le debemos", "proveedores-deuda-y-pagos"],
    ["le di un adelanto de sueldo a una chica", "anticipos"],
  ];
  it.each(casos)("«%s» → %s", (pregunta, tema) => {
    expect(buscarTemas(manual, pregunta).map((t) => t.id)).toContain(tema);
  });
});

describe("el manual del repo", () => {
  it("cada tema tiene título, palabras clave y texto, sin [VERIFICAR] pendientes", () => {
    const manual = cargarManual();
    expect(manual.length).toBeGreaterThan(0);
    for (const t of manual) {
      expect(t.titulo, t.id).not.toBe(t.id);
      expect(t.palabras.length, t.id).toBeGreaterThan(2);
      expect(t.texto.length, t.id).toBeGreaterThan(100);
      expect(t.texto, t.id).not.toContain("[VERIFICAR");
    }
  });
});
