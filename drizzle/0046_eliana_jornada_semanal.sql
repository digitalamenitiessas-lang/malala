-- Eliana: sueldo fijo por 8 horas diarias, seis días por semana.
--
-- Su ficha decía 8 en el campo de jornada, que con el campo leído por día era
-- correcto y ahora, leído por semana, son 8 horas en toda la semana. A $7.500
-- la hora eso le liquidaría $60.000 por mes en vez de $360.000.
--
-- Es el arrastre del cambio de 0045: los que tenían el número cargado como
-- diario quedaron leídos como semanales. Se corrige sólo Eliana porque es la
-- única cuya jornada confirmó el salón (8 h/día × 6 días = 48).

update empleados
set horas_por_semana = 48
where nombre = 'Eliana' and activo = true and horas_por_semana = 8;
