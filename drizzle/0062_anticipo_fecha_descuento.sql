-- Cuando se le descuenta un anticipo, que no es cuando se le dio la plata.
--
-- Yerba Buena: "Carolina pide $250.000, se le pago un dia x de la semana. Se
-- acuerda que se descuenta de su semanal, despues pide que sea recien el
-- 24/10". Y: "la plata sale pero se les descuenta mas adelante... SON TODO EL
-- TIEMPO".
--
-- El anticipo tenia una sola fecha haciendo dos trabajos: cuando sale la plata
-- de la caja —que define el arqueo de ese dia— y en que liquidacion se
-- descuenta. Mientras coinciden no molesta; el dia que el salon acuerda
-- descontarlo mas adelante, no hay forma de expresarlo sin mentir en el
-- arqueo.
--
-- Nullable: vacio significa que se descuenta en su propia fecha, que es el
-- caso normal y no hay nada que migrar.
ALTER TABLE anticipos
  ADD COLUMN IF NOT EXISTS fecha_descuento date;
