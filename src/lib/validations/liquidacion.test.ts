import { describe, expect, it } from "vitest";
import { liquidacionPagoSchema } from "./liquidacion";

const pago = (total_pagado: unknown) =>
  liquidacionPagoSchema.parse({ mp_id: "ef", total_pagado });

describe("liquidacionPagoSchema · total_pagado", () => {
  it("cero es un monto, no vacío: es lo que se entrega con total negativo", () => {
    expect(pago("0").total_pagado).toBe(0);
    expect(pago(0).total_pagado).toBe(0);
  });

  it("vacío sigue siendo 'lo que diga la liquidación'", () => {
    expect(pago("").total_pagado).toBeUndefined();
    expect(pago(null).total_pagado).toBeUndefined();
    expect(pago(undefined).total_pagado).toBeUndefined();
  });

  it("un monto negativo o basura no se toma", () => {
    expect(pago("-100").total_pagado).toBeUndefined();
    expect(pago("abc").total_pagado).toBeUndefined();
  });

  it("un monto redondeado pasa tal cual", () => {
    expect(pago("237000").total_pagado).toBe(237_000);
  });
});
