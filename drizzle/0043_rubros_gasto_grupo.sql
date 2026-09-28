-- Cada rubro de gasto pasa a tener un grupo (1 a 6).
--
-- Lo que esto arregla: hoy "Flujo de caja" suma todos los egresos pagados y
-- muestra $1.528.165. Pero $350.000 de eso es retiro de socios, que no es un
-- costo de operar el salón: es reparto de ganancia. El gasto operativo real es
-- $1.178.165. O sea que el salón se ve un 23% más caro de lo que es, y con
-- Equipamiento (inversión) pasaría lo mismo en cuanto se use.
--
-- El tipo (operativo / no operativo) NO se guarda: se deriva del grupo. Del 1
-- al 5 son costos del salón, el 6 va bajo la línea. Guardar las dos cosas
-- permitiría que quedaran contradiciéndose.

alter table rubros_gasto
  add column if not exists grupo integer;

alter table rubros_gasto
  drop constraint if exists rubros_gasto_grupo_chk;

alter table rubros_gasto
  add constraint rubros_gasto_grupo_chk
  check (grupo is null or (grupo >= 1 and grupo <= 6));

-- Clasificación inicial de los rubros que existen.
--
-- Los dos que mueven el resultado son retiro de socios y Equipamiento: van al
-- 6 y dejan de ensuciar el operativo. El resto es acomodar.
--
-- Tres son criterio discutible y quedan marcados para revisar con el salón:
-- Lavado Toallas (se puso en 2, es mantenimiento recurrente), Imprenta (en 4,
-- por marketing, pero podría ser papelería) y Librería (en 5, papelería).
-- Ninguno de los tres cambia el resultado operativo, sólo en qué renglón cae.

update rubros_gasto set grupo = 1 where rubro in ('Insumos');
update rubros_gasto set grupo = 2 where rubro in ('Sueldos', 'Limpieza', 'Lavado Toallas');
update rubros_gasto set grupo = 4 where rubro in ('Imprenta');
update rubros_gasto set grupo = 5 where rubro in ('Gastos Varios', 'Pedido Ya', 'Libreria', 'Test');
update rubros_gasto set grupo = 6 where rubro in ('Equipamiento') or rubro ilike '%retiro%socio%';
