-- Copia a Centro los motivos de descuento que hoy sólo tiene Yerba Buena.
--
-- Los motivos son globales; lo que decide quién los ve es motivo_sucursal. La
-- sincronización anterior se hizo cuando se preparó Centro, y desde entonces
-- en YB se crearon varios más (Publicidad / Sin cargo, Golden Concept,
-- Autoconsumo Socios, clientas wsapp, empleadas). Centro no los tenía, así que
-- al cargar una venta esos descuentos no aparecían en la lista.
--
-- Se copia la membresía, no el motivo: el mismo motivo pasa a estar habilitado
-- en las dos sucursales, y los reportes de descuentos siguen agrupando por la
-- misma fila.
--
-- seed-000001 = Centro, seed-000002 = Yerba Buena.
insert into motivo_sucursal (id, motivo_id, sucursal_id)
select gen_random_uuid()::text, ms.motivo_id, 'seed-000001'
from motivo_sucursal ms
where ms.sucursal_id = 'seed-000002'
  and not exists (
    select 1 from motivo_sucursal x
    where x.motivo_id = ms.motivo_id
      and x.sucursal_id = 'seed-000001'
  );
