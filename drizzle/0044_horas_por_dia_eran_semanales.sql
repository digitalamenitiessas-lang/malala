-- Cuatro empleadas tenían las horas de la SEMANA en el campo de horas por día.
--
-- Lo detectó el salón: "34 horas por día no puede ser, ¿no serán semanales?".
-- Tenía razón y se confirma con los números: el campo decía 34, 52, 48 y 47, y
-- coincide EXACTO con lo que suma su horario semanal cargado. Ángela: lunes a
-- jueves 6 h, viernes 6, sábado 4 = 34.
--
-- Hoy no hacía daño porque las cuatro tienen el horario semanal cargado y eso
-- es lo que manda: el campo es sólo el respaldo para cuando no hay horario.
-- Pero si alguna vez se lo borran, la liquidación sugeriría 34 horas por día y
-- a $4.000 la hora eso son cifras delirantes.
--
-- Se pasa a horas por día reales: el total semanal dividido los días que
-- trabaja. No se pone en cero porque cero significaría "no cobra horas", que
-- es lo contrario de lo que pasa.

update empleados
set horas_por_dia = round(
      (horas_por_dia / nullif(jsonb_array_length(dias_trabajo), 0))::numeric,
      2
    )
where activo = true
  and horas_por_dia > 12
  and jsonb_array_length(dias_trabajo) > 0;
