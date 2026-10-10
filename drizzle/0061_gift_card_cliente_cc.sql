-- Quien compra la gift card, cuando queda fiada a su cuenta corriente.
--
-- Yerba Buena: "podemos pedirles por favor que agreguen en compra de GC en
-- forma de pago la opcion cuenta corriente?".
--
-- Hasta ahora la tarjeta guardaba un nombre escrito a mano en `compradora`,
-- que alcanza para buscarla pero no para cargarle la deuda a nadie: una cuenta
-- corriente necesita un cliente de verdad. La columna va aparte y nullable
-- porque la mayoria se paga en el momento y ahi no hay cliente que registrar.
ALTER TABLE gift_cards
  ADD COLUMN IF NOT EXISTS compradora_cliente_id text REFERENCES clientes(id);
