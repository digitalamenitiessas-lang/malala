-- Cuánto de una factura ya estaba pagado con pagos a cuenta cuando se la marcó
-- pagada.
--
-- Pedido de Yerba Buena el 06/11/2026, con Walter: dos pagos a cuenta de
-- $200.000 contra una factura de $686.917,45. El saldo del proveedor estaba
-- bien, pero la factura seguía "En cuenta" por el total, y marcarla pagada
-- sacaba de la caja los $686.917 enteros: la plata que ya se le había dado se
-- pagaba dos veces.
--
-- Los pagos a cuenta no apuntan a ninguna factura (ver drizzle/0058): se
-- reparten entre las impagas, de la más vieja a la más nueva. Al marcar una
-- pagada, la parte cubierta se guarda acá y sale de la caja sólo lo que falta.
-- Lo guardado ya no se reparte a las demás. Null = no había nada cubierto.
alter table egresos
  add column if not exists cubierto_a_cuenta double precision;
