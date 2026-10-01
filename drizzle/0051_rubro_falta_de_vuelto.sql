-- Rubro de gasto "Falta de vuelto", pedido desde el mostrador.
--
-- Cuando no hay cambio, la venta se cobra igual por su precio pero a la caja
-- entra menos. Hoy eso se cargaba como "Gastos Varios" con una observacion a
-- mano, asi que no habia forma de saber cuanto se pierde por ese motivo.
--
-- Va como GASTO y no como descuento a proposito. Un descuento baja la base de
-- la comision, o sea que la empleada terminaria absorbiendo un problema de
-- cambio que no es suyo; por eso el intento de contemplarlo como descuento
-- quedo en la nada. Como gasto, la venta conserva su precio, la comision sale
-- completa y la caja cuadra.
--
-- Grupo 5 (Gastos varios): es un costo de operar, asi que entra al estado de
-- resultados. Se puede mover de grupo desde Catalogos > Rubros de gasto.
--
-- Se crea para las dos sucursales: la pantalla de alta solo lo engancha a la
-- sucursal en la que esta parado quien lo crea, y este lo necesitan las dos.
--
-- Idempotente: si el rubro ya existe no hace nada.
with nuevo as (
  insert into rubros_gasto (id, rubro, subrubro, activo, grupo)
  select gen_random_uuid()::text, 'Falta de vuelto', null, true, 5
   where not exists (
     select 1 from rubros_gasto where lower(trim(rubro)) = 'falta de vuelto'
   )
  returning id
)
insert into rubro_sucursal (id, rubro_id, sucursal_id)
select gen_random_uuid()::text, n.id, s.id
  from nuevo n cross join sucursales s
 where s.activo;
