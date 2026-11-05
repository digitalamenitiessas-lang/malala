-- Con qué medio se pagó la gift card.
--
-- Pedido de Yerba Buena el 05/11/2026: "Se podría agregar en esta pantalla la
-- forma de pago de la gift?". Hasta ahora el medio se usaba para saber a qué
-- cuenta entraba la plata y después se perdía: quedaba la cuenta, y la cuenta no
-- alcanza, porque Débito y Crédito entran los dos a Macro y Transferencia y
-- Cheque a Galicia.
alter table gift_cards
  add column if not exists mp_id text references medios_pago(id);

-- Las ya emitidas: sólo donde no hay duda.
--
-- Cobro que entró a una cuenta a la que llega un único medio de la sucursal
-- (Efectivo, Dólares, Mercado Pago). Las que entraron a una cuenta compartida
-- quedan sin medio, y la pantalla muestra la cuenta y los medios posibles.
update gift_cards g
set mp_id = m.id
from movimientos_bancarios mb, medios_pago m
where g.mp_id is null
  and mb.ref_tipo = 'gift_card_venta'
  and mb.ref_id = g.id
  and mb.tipo = 'ingreso'
  and m.cuenta_id = mb.cuenta_id
  and m.sucursal_id = g.sucursal_id
  and (
    select count(*) from medios_pago m2
    where m2.cuenta_id = mb.cuenta_id and m2.sucursal_id = g.sucursal_id
  ) = 1;

-- Fiadas a cuenta corriente.
update gift_cards g
set mp_id = m.id
from medios_pago m
where g.mp_id is null
  and m.sucursal_id = g.sucursal_id
  and m.codigo = 'CC'
  and exists (
    select 1 from movimientos_cc cc
    where cc.ref_tipo = 'gift_card' and cc.ref_id = g.id
  );

-- Pagadas por una empleada con descuento de sueldo. El descuento no apunta a la
-- tarjeta: se reconoce por el concepto, que lleva el código.
update gift_cards g
set mp_id = m.id
from medios_pago m
where g.mp_id is null
  and g.origen = 'venta'
  and m.sucursal_id = g.sucursal_id
  and m.codigo = 'DTOSUELDO'
  and exists (
    select 1 from descuentos d
    where d.sucursal_id = g.sucursal_id
      and (
        d.concepto = 'Gift card ' || g.codigo
        or d.concepto like 'Gift card ' || g.codigo || ' (cuota %'
      )
  );
