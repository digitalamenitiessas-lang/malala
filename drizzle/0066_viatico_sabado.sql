-- Viatico distinto para el sabado, en la ficha de la empleada.
--
-- "Las chicas del centro cobran los viaticos dia de semana $3.000 y los
-- sabados $7.000."
--
-- Ya se podia poner un monto de sabado al cargar un rango, pero el salon lo
-- fue a buscar donde correspondia: a la ficha, que es donde esta todo lo demas
-- que cobra. Estuvo tocando los dias de viatico esperando que cambiara el
-- monto, porque el monto era uno solo.
--
-- Vacio o cero = el sabado cobra lo mismo que el resto, asi que Yerba Buena
-- ($4.000 todos los dias) no cambia.
ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS viatico_sabado double precision NOT NULL DEFAULT 0;
