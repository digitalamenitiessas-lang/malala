-- Permite anular un gasto en vez de borrarlo.
--
-- Hasta ahora los egresos no se podían dar de baja de ninguna forma: no hay
-- acción de borrado ni de anulación en el sistema. Cuando el salón cargó una
-- factura larga y duplicó un renglón, hubo que borrarlo por base a mano.
--
-- Mismo criterio que los ingresos, que ya tenían esta columna: el gasto no se
-- borra, se marca, y las lecturas lo filtran. Así el número de la caja de ese
-- día sigue pudiendo explicarse y queda el rastro de que existió.
--
-- default false: todos los gastos que ya están cargados quedan como válidos,
-- que es lo correcto.

alter table egresos add column if not exists anulado boolean not null default false;

create index if not exists egresos_anulado_idx on egresos (anulado);
