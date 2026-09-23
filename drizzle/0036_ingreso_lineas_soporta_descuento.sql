-- Deja registrado si el descuento del ticket baja o no la comisión de cada línea.
--
-- Hasta ahora sólo se guardaba el monto, no el criterio. Con eso, mirando un
-- ticket no había forma de saber por qué la comisión era la que era: había que
-- deducirlo dividiendo y comparando. Pasó de verdad cuando el salón preguntó
-- "por qué me da mal la comisión".
--
-- true  = sobre lo que se cobró (el descuento se lo come la empleada)
-- false = sobre el precio de la línea, sin el descuento (lo pone el local)
--
-- default true porque es la regla del salón y es como se calcularon casi todas
-- las líneas ya cargadas.

alter table ingreso_lineas
  add column if not exists soporta_descuento boolean not null default true;

-- Corrección de las dos líneas que quedaron mal.
--
-- El formulario tenía un toggle (ya no está) cuyo criterio alternativo iba a
-- buscar servicios.precio_lista. Eso estaba mal: en este salón precio_lista no
-- es "el precio antes del descuento", es la OTRA columna de precio, la de
-- tarjeta. Así que el toggle no cambiaba el criterio del descuento, cambiaba de
-- columna de precio. Se ve clarísimo en el Balayage del 23/09: ese ticket no
-- tiene descuento y aun así la comisión salió $60.000 (30% de precio_lista
-- $200.000) en vez de $64.500 (30% de los $215.000 que se cobraron).
--
-- Se detectan por el número, no por id: sólo las líneas cuyo monto guardado
-- coincide con el % sobre precio_lista Y NO coincide con lo que da la regla, o
-- sea las que sólo se explican por el toggle viejo. Se les recalcula el monto
-- con el criterio correcto (el precio de la línea, sin el descuento del ticket)
-- y se las marca como excepción.
--
-- No hay ninguna liquidación emitida todavía, así que ninguna de estas
-- comisiones se pagó: corregirlas no contradice ningún pago.
update ingreso_lineas l
set soporta_descuento = false,
    comision_monto = l.subtotal * l.comision_pct / 100.0
from ingresos i, servicios s
where l.ingreso_id = i.id
  and l.servicio_id = s.id
  and i.anulado = false
  and l.comision_pct > 0
  and abs(l.comision_monto - s.precio_lista * l.comision_pct / 100.0) < 0.5
  and abs(
        l.comision_monto
        - (l.subtotal - i.descuento_monto * (l.subtotal / nullif(i.subtotal, 0)))
          * l.comision_pct / 100.0
      ) >= 0.5;
