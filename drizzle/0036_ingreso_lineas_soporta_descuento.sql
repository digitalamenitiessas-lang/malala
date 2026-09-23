-- Deja registrado sobre qué precio se calculó la comisión de cada línea.
--
-- Hasta ahora sólo se guardaba el monto, no la base. Con eso, mirando un ticket
-- no había forma de saber por qué la comisión era la que era: había que deducir
-- la base dividiendo y comparando contra el precio de lista. Pasó de verdad
-- cuando el salón reportó "me da mal la comisión".
--
-- true  = sobre lo que se cobró (el descuento lo absorbe la empleada)
-- false = sobre el precio de lista (el descuento lo pone el local)
--
-- default true porque es la regla del salón y es como se calcularon casi todas
-- las líneas ya cargadas. Las dos excepciones que existen se corrigen aparte,
-- en el mismo script que aplica esto.

alter table ingreso_lineas
  add column if not exists soporta_descuento boolean not null default true;

-- Backfill de las excepciones que ya existen.
--
-- El default deja todo en true, pero hay líneas viejas cuyo comision_monto se
-- calculó sobre el precio de lista (el formulario tenía un toggle que ya no
-- está). Si no se corrigen, la columna nueva diría una cosa y el monto otra.
--
-- No se tocan por id: se detectan por el número. Sólo se marca la línea cuyo
-- monto guardado coincide con la base "precio de lista" Y NO coincide con la
-- base "lo cobrado" — o sea, las que sólo se explican con la excepción. Si una
-- venta no tiene descuento las dos bases dan igual y la segunda condición la
-- deja afuera, que es lo correcto.
update ingreso_lineas l
set soporta_descuento = false
from ingresos i, servicios s
where l.ingreso_id = i.id
  and l.servicio_id = s.id
  and i.anulado = false
  and i.descuento_monto > 0
  and l.comision_pct > 0
  and abs(l.comision_monto - s.precio_lista * l.comision_pct / 100.0) < 0.5
  and abs(
        l.comision_monto
        - (l.subtotal - i.descuento_monto * (l.subtotal / nullif(i.subtotal, 0)))
          * l.comision_pct / 100.0
      ) >= 0.5;
