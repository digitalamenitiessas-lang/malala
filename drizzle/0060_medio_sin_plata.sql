-- Medios de pago que no mueven plata.
--
-- Centro quiere cargar un medio "sin costo influencer": el servicio se presta y
-- no entra un peso. Igual que Gift card (canjear no trae plata nueva) y que
-- Cuenta corriente (la venta genera deuda, no cobro).
--
-- Hasta ahora eso se deducia del codigo, con GIFT y CC escritos a mano en el
-- codigo fuente. Un medio nuevo no podia participar de esa categoria sin tocar
-- el repositorio, y mientras tanto quedaba marcado como error: el aviso de
-- "medio sin cuenta destino" lo iba a gritar para siempre. Peor todavia, el
-- camino para callar ese aviso es asignarle una cuenta, y ahi cada cortesia
-- empezaria a inventar plata en la caja.
--
-- Se backfillea GIFT y CC para que lo que ya era verdad quede escrito.
ALTER TABLE medios_pago
  ADD COLUMN IF NOT EXISTS mueve_plata boolean NOT NULL DEFAULT true;

UPDATE medios_pago SET mueve_plata = false WHERE upper(codigo) IN ('GIFT', 'CC');
