-- Valentina pasa a tipo_comision = 'mixto'.
--
-- Con la regla nueva, tipo_comision deja de ser una etiqueta y pasa a decidir
-- cuanto cobra cada una:
--
--   porcentaje   profesional: comision O asegurado, la mayor. Nunca las dos.
--   sueldo_fijo  encargada: horas por tarifa MAS comision de productos.
--   mixto        las dos cosas en la misma semana, todo suma.
--
-- Valentina es la unica excepcion del salon: es profesional, pero los lunes y
-- dos horas del sabado esta de encargada, y ademas tiene $50.000 semanales de
-- basico. Estaba como 'porcentaje', asi que con la regla nueva cobraria la
-- mayor entre comision y horas y perderia tanto las horas de encargada como el
-- basico.
--
-- Idempotente.
UPDATE empleados
   SET tipo_comision = 'mixto'
 WHERE nombre = 'Valentina'
   AND sucursal_principal_id = 'seed-000001'
   AND activo
   AND tipo_comision <> 'mixto';
