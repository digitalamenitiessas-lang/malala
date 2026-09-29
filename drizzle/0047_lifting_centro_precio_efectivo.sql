-- Centro cobra el Lifting de pestañas a $22.000 en efectivo, no a $20.000.
--
-- Lo detectó el salón por la comisión: "el 30% de 22.000 es 6.600, ¿por qué
-- sale 6.000?". La comisión estaba bien calculada —sale del precio en efectivo
-- del catálogo, que es la regla— pero el catálogo tenía el precio viejo. Es el
-- precio que traían del sistema anterior y que vienen cobrando desde entonces.
--
-- Se toca sólo el precio en efectivo, que es el que confirmaron. El de lista
-- queda en $25.000 hasta que digan cuál va: el resto del catálogo de Centro usa
-- lista = efectivo × 1,25, que acá daría $27.500, pero no es algo para asumir.
--
-- Las dos ventas de hoy se recalculan abajo: son de hoy, no están liquidadas, y
-- la comisión de Valentina sube $600 en cada una.

update servicios
set precio_efectivo = 22000
where nombre = 'Lifting de pestañas'
  and precio_efectivo = 20000
  and id in (
    select servicio_id from servicio_sucursal where sucursal_id = 'seed-000001'
  );

update ingreso_lineas l
set comision_monto = s.precio_efectivo * l.cantidad * l.comision_pct / 100.0
from ingresos i, servicios s
where l.ingreso_id = i.id
  and l.servicio_id = s.id
  and i.anulado = false
  and i.sucursal_id = 'seed-000001'
  and s.nombre = 'Lifting de pestañas'
  and l.soporta_descuento = true
  and i.descuento_monto = 0
  and l.id not in (
    select ingreso_linea_id from liquidacion_lineas where ingreso_linea_id is not null
  );
