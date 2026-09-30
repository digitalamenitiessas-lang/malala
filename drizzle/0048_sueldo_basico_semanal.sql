-- Sueldo básico semanal, que hoy no tiene dónde ir.
--
-- El caso que lo pide: Valentina, en Centro, cobra comisión del 30% por sus
-- servicios MÁS $50.000 fijos por semana, más horas de encargada los lunes y
-- dos horas los sábados. El total de una liquidación era comisión + horas +
-- viáticos − anticipos: los $50.000 no entraban en ningún renglón.
--
-- Se reutiliza `sueldo_asegurado` en vez de agregar una columna al lado. Esa
-- columna ya existía con esta misma intención, quedó sin usarse en el cálculo
-- y hoy está en cero para todo el mundo, así que no hay dato que migrar. Dejar
-- una columna muerta junto a otra nueva que hace lo mismo es cómo se llega a
-- tener dos campos de sueldo y nadie sabe cuál manda.
--
-- Semanal y no mensual porque el salón liquida por semana: Centro los viernes,
-- Yerba Buena los sábados. Al liquidar se prorratea por los días del período,
-- así una liquidación de dos semanas paga dos, y queda editable para el caso
-- en que esa semana se haya acordado otra cosa.

alter table empleados
  rename column sueldo_asegurado to sueldo_basico_semanal;

alter table liquidaciones
  add column if not exists sueldo_basico double precision not null default 0;

update empleados
set sueldo_basico_semanal = 50000
where nombre = 'Valentina'
  and sucursal_principal_id = 'seed-000001'
  and activo = true;
