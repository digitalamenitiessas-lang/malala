-- El campo de jornada pasa a ser SEMANAL, que es como lo acordó el salón.
--
-- El salón carga la jornada en horas por semana: 34, 52, 48, 47. El campo pedía
-- horas por día, así que los dos números convivían mal — 34 leído como diario
-- es imposible, y leído como semanal es exactamente lo que suma el horario de
-- Ángela (lunes a jueves 6 h, viernes 6, sábado 4).
--
-- La migración anterior (0044) los "corrigió" dividiendo por los días de
-- trabajo, entendiendo que el dato estaba mal. Estaba mal el campo, no el dato.
-- Acá se restituyen los valores originales y el campo pasa a llamarse por lo
-- que realmente contiene.
--
-- La cuenta al liquidar da lo mismo —días laborables × (semanal ÷ días por
-- semana)— pero ahora se carga lo que el salón tiene escrito, sin traducir de
-- cabeza y sin perder precisión al redondear.

alter table empleados
  rename column horas_por_dia to horas_por_semana;

-- Deshace el 0044: vuelve a la jornada semanal que estaba cargada.
update empleados set horas_por_semana = 34 where nombre = 'Ángela'   and horas_por_semana < 12;
update empleados set horas_por_semana = 52 where nombre = 'Anita'    and horas_por_semana < 12;
update empleados set horas_por_semana = 48 where nombre = 'Camila'   and horas_por_semana < 12;
update empleados set horas_por_semana = 47 where nombre = 'Carolina' and horas_por_semana < 12;
