-- Motivo de descuento para las sesiones de un pack, en las dos sucursales.
--
-- El salón definió que el descuento del pack lo pone el local: la chica cobra
-- su comisión sobre el precio normal del servicio, no sobre el precio rebajado
-- de la sesión. Con este motivo eso sale solo.
--
-- Cómo se usa: la sesión se carga como el servicio normal a su precio (un
-- masaje de 1 hora a $40.000), se aplica el descuento hasta el precio del pack
-- ($30.000) con este motivo, y se cobra con la gift card del pack. Resultado:
-- la clienta paga $30.000 de su saldo y la profesional cobra el 30% de
-- $40.000. Si en cambio se cargara la sesión directamente a $30.000, la
-- comisión saldría de ahí y la chica perdería $3.000 por sesión.
--
-- Va con comision_ignora_descuento = true, igual que "Publicidad / Sin cargo".

insert into motivos_descuento (id, nombre, activo, comision_ignora_descuento)
select gen_random_uuid()::text, 'Pack de sesiones', true, true
where not exists (
  select 1 from motivos_descuento where nombre = 'Pack de sesiones'
);

insert into motivo_sucursal (id, motivo_id, sucursal_id)
select gen_random_uuid()::text, md.id, s.id
from motivos_descuento md
cross join sucursales s
where md.nombre = 'Pack de sesiones'
  and not exists (
    select 1 from motivo_sucursal ms
    where ms.motivo_id = md.id and ms.sucursal_id = s.id
  );
