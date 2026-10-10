-- Lo que de verdad se pago de una liquidacion, y lo que se arrastra.
--
-- Yerba Buena: "cuando me dice $237.340 una liquidacion yo pago $237.000 (esa
-- sobrante no lo pago). En el sistema viejo la empleada queda con un saldo a
-- favor para la semana que viene".
--
-- total_pagado: lo entregado. Vacio significa que se pago el total, que es el
-- caso normal y no hay nada que migrar.
--
-- arrastre: cuanto de lo que se debia de semanas anteriores entro en ESTA
-- liquidacion. Sin esta columna no habria forma de saber que diferencias ya se
-- saldaron y cuales siguen pendientes: se pagarian dos veces.
ALTER TABLE liquidaciones
  ADD COLUMN IF NOT EXISTS total_pagado double precision;

ALTER TABLE liquidaciones
  ADD COLUMN IF NOT EXISTS arrastre double precision NOT NULL DEFAULT 0;
