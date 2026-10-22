-- Un pack es una cantidad de SESIONES, no un monto.
--
-- Hasta ahora la gift card guardaba solo plata, y cada sesion se cobraba
-- cargando el servicio a precio normal y descontando a mano hasta el precio de
-- sesion. Si el descuento no quedaba exacto, el saldo bajaba de mas o de menos.
-- De 14 canjes contra packs, 4 quedaron en el monto correcto.
--
-- El resultado: Bernardo Pastorino uso sus 4 sesiones y le quedaban $60.000 --dos
-- masajes de regalo--, Mariana Carlino y Nathalia Herrera tenian una sesion de
-- mas cada una, y a Noelia Marino le faltaban $5.000, justo la cuarta sesion que
-- es la gratis del 4x3. Hubo que recalcular los seis packs a mano.
--
-- Pedido textual: "podemos poner un ALTO que no te deje avanzar si no esta bien
-- cargada con el monto correcto? Estamos yendo al finito de todo para evitar
-- minimas diferencias que a veces siguen existiendo y no logramos entender de
-- donde vienen".
--
-- Las dos columnas van juntas: con sesiones NULL la tarjeta es de plata y se
-- comporta igual que siempre. Con sesiones cargado, el canje tiene que ser
-- exactamente de precio_sesion.
alter table gift_cards add column if not exists sesiones integer;
alter table gift_cards add column if not exists precio_sesion double precision;

-- O las dos o ninguna: media configuracion deja un pack que no sabe cuanto vale
-- una sesion, que es justo el agujero que esto viene a tapar.
alter table gift_cards drop constraint if exists gift_cards_pack_completo;
alter table gift_cards add constraint gift_cards_pack_completo check (
  (sesiones is null and precio_sesion is null)
  or (sesiones > 0 and precio_sesion > 0)
);
