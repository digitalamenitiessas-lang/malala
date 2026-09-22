import { describe, expect, it } from "vitest";
import { parseMontoArs, textoMontoTipeado } from "./monto-ars";
import { formatARS } from "./utils";

describe("parseMontoArs", () => {
  it("vacío o basura es 0", () => {
    expect(parseMontoArs("")).toBe(0);
    expect(parseMontoArs("$")).toBe(0);
    expect(parseMontoArs("abc")).toBe(0);
  });

  it("lee enteros con y sin separador de miles", () => {
    expect(parseMontoArs("1234")).toBe(1234);
    expect(parseMontoArs("$ 1.234")).toBe(1234);
    expect(parseMontoArs("$ 1.234.567")).toBe(1234567);
  });

  it("la coma son los centavos", () => {
    expect(parseMontoArs("12,50")).toBe(12.5);
    expect(parseMontoArs("$ 1.234,56")).toBe(1234.56);
    expect(parseMontoArs("0,05")).toBe(0.05);
    expect(parseMontoArs(",5")).toBe(0.5);
  });

  it("corta en dos decimales: no hay milésimos de peso", () => {
    expect(parseMontoArs("12,999")).toBe(12.99);
  });

  it("una coma sin cifras atrás todavía vale el entero", () => {
    expect(parseMontoArs("12,")).toBe(12);
  });

  it("un punto solitario con una o dos cifras atrás es decimal", () => {
    // El teclado numérico escribe punto; nadie que teclea "12.5" quiere 125.
    expect(parseMontoArs("12.5")).toBe(12.5);
    expect(parseMontoArs("12.50")).toBe(12.5);
  });

  it("pero tres cifras atrás son miles, que es lo que escribe el campo", () => {
    expect(parseMontoArs("1.234")).toBe(1234);
    expect(parseMontoArs("12.345")).toBe(12345);
  });

  it("vuelve a leer exactamente lo que el campo muestra", () => {
    for (const n of [0.05, 12.5, 1234, 1234.56, 1234567, 999999.99]) {
      expect(parseMontoArs(formatARS(n))).toBeCloseTo(n, 2);
    }
  });
});

describe("textoMontoTipeado", () => {
  it("separa los miles mientras se escribe", () => {
    expect(textoMontoTipeado("1234")).toBe("$ 1.234");
    expect(textoMontoTipeado("1234567")).toBe("$ 1.234.567");
  });

  it("deja la coma recién tipeada en pantalla", () => {
    // Este es el caso que hacía imposible cargar centavos: si se formateaba el
    // número, "12," volvía a mostrarse "$ 12" y la coma no sobrevivía.
    expect(textoMontoTipeado("12,")).toBe("$ 12,");
    expect(textoMontoTipeado("12,5")).toBe("$ 12,5");
    expect(textoMontoTipeado("12,50")).toBe("$ 12,50");
  });

  it("vacío es vacío, no '$ 0'", () => {
    expect(textoMontoTipeado("")).toBe("");
    expect(textoMontoTipeado("$")).toBe("");
  });

  it("acepta arrancar por la coma", () => {
    expect(textoMontoTipeado(",")).toBe("$ 0,");
    expect(textoMontoTipeado(",5")).toBe("$ 0,5");
  });
});

describe("formatARS", () => {
  it("los importes redondos no muestran centavos", () => {
    expect(formatARS(1234)).not.toContain(",");
    expect(formatARS(0)).not.toContain(",");
  });

  it("cuando hay centavos, se ven los dos", () => {
    expect(formatARS(1234.5)).toContain(",50");
    expect(formatARS(1234.56)).toContain(",56");
    expect(formatARS(0.05)).toContain(",05");
  });

  it("los negativos también", () => {
    expect(formatARS(-1234)).not.toContain(",");
    expect(formatARS(-1234.56)).toContain(",56");
  });
});

describe("el peligro de tipear encima de un importe ya cargado", () => {
  it("pegar digitos al final multiplica el monto por cien mil", () => {
    // Campo que dice "$ 50.000"; se tipea 50000 sin borrar. Los puntos son
    // separadores de miles, asi que todo se lee como un unico numero.
    expect(parseMontoArs("$ 50.00050000")).toBe(5000050000);
    // El campo MUESTRA ese monto, no lo esconde: el problema es lo facil que
    // es no mirarlo. Por eso el input selecciona todo al hacer clic.
    expect(textoMontoTipeado("$ 50.00050000")).toBe("$ 5.000.050.000");
  });

  it("con centavos el pegado se come lo tipeado en vez de agrandarlo", () => {
    expect(parseMontoArs("$ 50.000,5050000")).toBe(50000.5);
  });
});
