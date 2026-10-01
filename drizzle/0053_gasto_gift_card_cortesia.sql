-- El costo de las gift cards que regala el salon.
--
-- Cuando se canjea una cortesia el servicio factura por su precio y la chica
-- cobra su comision, pero no entra un peso: ese monto lo pone el negocio. Sin
-- un gasto que lo compense, esa venta suma a la ganancia sin ningun costo al
-- lado y el resultado queda sobrestimado por el valor de la tarjeta.
--
-- Grupo 4 (Marketing) y no 6: el salon lo pidio como perdida, y el 6 va bajo la
-- linea, o sea que no le restaria a la ganancia operativa, que es justo lo
-- contrario de lo que se quiere ver. Se puede mover de grupo con un clic desde
-- Catalogos > Rubros de gasto si prefieren tratarlo como retiro de socios.
--
-- Idempotente.
with nuevo as (
  insert into rubros_gasto (id, rubro, subrubro, activo, grupo)
  select gen_random_uuid()::text, 'Gift cards de cortesia', null, true, 4
   where not exists (
     select 1 from rubros_gasto where lower(trim(rubro)) = 'gift cards de cortesia'
   )
  returning id
)
insert into rubro_sucursal (id, rubro_id, sucursal_id)
select gen_random_uuid()::text, n.id, s.id
  from nuevo n cross join sucursales s
 where s.activo;

-- De que venta salio un gasto generado por el sistema.
--
-- Hace falta para poder deshacerlo: al anular la venta vuelve el saldo de la
-- gift card, y si el gasto quedara, el salon cargaria un costo por un servicio
-- que no presto. Buscarlo por rubro + fecha + monto seria adivinar.
ALTER TABLE egresos
  ADD COLUMN IF NOT EXISTS ingreso_id text REFERENCES ingresos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS egresos_ingreso_id_idx ON egresos (ingreso_id);
