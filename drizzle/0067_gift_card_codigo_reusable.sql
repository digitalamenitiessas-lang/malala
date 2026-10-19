-- Un codigo de gift card anulada vuelve a quedar libre.
--
-- El indice unico era sobre (sucursal_id, upper(codigo)) sin mirar el estado,
-- asi que una tarjeta anulada se quedaba el numero para siempre. Cuando hay que
-- anular y reemitir --el caso normal: se cargo con el medio de pago equivocado--
-- la tarjeta FISICA que se llevo la clienta sigue diciendo el mismo numero, pero
-- el sistema no deja volver a usarlo.
--
-- Yerba Buena lo resolvio sola agregandole una letra: GC-0223 anulada paso a
-- GC-0223D, y GC-0224 a "GC-024D" --sin el segundo 2, de apuro--. "Por la
-- voragine del dia decidimos ponerle asi xq estaban anuladas y despues no
-- aparecian como opcion". El costo aparece semanas despues: la clienta llega con
-- una tarjeta que dice 0224, en el sistema buscan 0224 y encuentran la anulada.
--
-- El indice pasa a ignorar las anuladas. Dos activas con el mismo codigo siguen
-- siendo imposibles, que es lo unico que el indice tenia que garantizar.
drop index if exists gift_cards_sucursal_codigo_uq;

create unique index gift_cards_sucursal_codigo_uq
  on gift_cards (sucursal_id, upper(codigo))
  where estado <> 'anulada';
