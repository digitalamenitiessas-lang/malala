import { describe, expect, it } from "vitest";
import { bloquesDeCodigos, type InsumoNumerado } from "./codigos-insumo";

const fila = (
  codigo: string | null,
  nombre = "X",
  tipo: "bacha" | "venta" = "bacha",
): InsumoNumerado => ({ codigo, nombre, tipo });

describe("bloquesDeCodigos", () => {
  it("sin códigos no sugiere nada", () => {
    expect(bloquesDeCodigos([])).toEqual([]);
    expect(bloquesDeCodigos([fila(null), fila("")])).toEqual([]);
  });

  it("agrupa por centena y da el siguiente de cada bloque", () => {
    const r = bloquesDeCodigos([
      fila("INS101"),
      fila("INS102"),
      fila("INS201"),
    ]);
    expect(r.map((b) => [b.bloque, b.ultimo, b.siguiente])).toEqual([
      ["INS1xx", "INS102", "INS103"],
      ["INS2xx", "INS201", "INS202"],
    ]);
  });

  it("saltea el siguiente si ya lo usa otro bloque", () => {
    // INS199 cierra el bloque 1xx y el 200 ya existe: hay que saltearlo.
    const r = bloquesDeCodigos([fila("INS199"), fila("INS200")]);
    const b1 = r.find((b) => b.bloque === "INS1xx")!;
    expect(b1.siguiente).toBe("INS201");
  });

  it("separa por prefijo aunque compartan centena", () => {
    const r = bloquesDeCodigos([fila("VPC100"), fila("VDJ100")]);
    expect(r.map((b) => b.bloque)).toEqual(["VDJ1xx", "VPC1xx"]);
  });

  it("ignora los códigos que no son letras + dígitos", () => {
    const r = bloquesDeCodigos([fila("INS101"), fila("A-1"), fila("123")]);
    expect(r).toHaveLength(1);
    expect(r[0].bloque).toBe("INS1xx");
  });

  it("no pierde el ancho: respeta el padding de la planilla", () => {
    const r = bloquesDeCodigos([fila("INS008")]);
    expect(r[0].siguiente).toBe("INS009");
  });

  it("el tipo del bloque es el que predomina", () => {
    const r = bloquesDeCodigos([
      fila("VPC100", "Shampoo", "venta"),
      fila("VPC101", "Serum", "venta"),
      fila("VPC102", "Mal cargado", "bacha"),
    ]);
    expect(r[0].tipo).toBe("venta");
  });

  it("los ejemplos son los primeros del bloque, de a dos", () => {
    const r = bloquesDeCodigos([
      fila("INS103", "Tercero"),
      fila("INS101", "Primero"),
      fila("INS102", "Segundo"),
    ]);
    expect(r[0].ejemplos).toEqual(["Primero", "Segundo"]);
    expect(r[0].cantidad).toBe(3);
  });

  it("reproduce la numeración real de Yerba Buena", () => {
    // Los bloques tal como están hoy en la base: cada uno es una familia.
    const reales: Array<[string, number, number]> = [
      ["INS0", 1, 4], // INS001..INS004
      ["INS1", 101, 118], // + INS121, INS122 abajo
      ["INS2", 201, 213],
      ["INS3", 301, 312],
      ["INS5", 501, 504],
      ["INS6", 601, 603],
      ["INS7", 701, 716],
      ["INS8", 801, 859],
      ["VPC1", 100, 146],
    ];
    const filas: InsumoNumerado[] = [];
    for (const [prefijo, desde, hasta] of reales) {
      const letras = prefijo.slice(0, 3);
      const tipo = letras === "INS" ? "bacha" : "venta";
      for (let n = desde; n <= hasta; n++) {
        filas.push(fila(`${letras}${n}`, `Producto ${n}`, tipo));
      }
    }
    filas.push(fila("INS121"), fila("INS122"));
    // El 4xx tiene un hueco real (no existe INS403) y termina en 407.
    for (const n of [401, 402, 404, 405, 406, 407]) {
      filas.push(fila(`INS${n}`));
    }
    // La reventa también tiene un hueco: falta VPC147.
    for (const n of [148, 149, 150, 151, 152]) {
      filas.push(fila(`VPC${n}`, "Producto", "venta"));
    }
    for (let n = 100; n <= 108; n++) {
      filas.push(fila(`VDJ${n}`, "Collar", "venta"));
    }

    const porBloque = Object.fromEntries(
      bloquesDeCodigos(filas).map((b) => [b.bloque, b]),
    );

    expect(porBloque["INS1xx"].ultimo).toBe("INS122");
    expect(porBloque["INS1xx"].siguiente).toBe("INS123");
    // El hueco de INS403 NO se ofrece: la numeración sigue donde quedó.
    expect(porBloque["INS4xx"].ultimo).toBe("INS407");
    expect(porBloque["INS4xx"].siguiente).toBe("INS408");
    expect(porBloque["INS8xx"].ultimo).toBe("INS859");
    expect(porBloque["INS8xx"].siguiente).toBe("INS860");
    expect(porBloque["VPC1xx"].siguiente).toBe("VPC153");
    expect(porBloque["VDJ1xx"].siguiente).toBe("VDJ109");
    // Y los bloques de reventa quedan marcados como tales, para que el alta de
    // un insumo de bacha no muestre la numeración de los productos de venta.
    expect(porBloque["VPC1xx"].tipo).toBe("venta");
    expect(porBloque["INS8xx"].tipo).toBe("bacha");
  });
});
