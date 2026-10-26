-- Retiro de productos de venta para usar en el salón.
--
-- Yerba Buena empieza a llevar stock y saca productos de la góndola para usarlos
-- adentro (ej. el Twel de Question). Hasta ahora eso sólo se podía cargar como
-- ajuste manual con un texto libre, y en la bitácora quedaba igual que un
-- faltante: a fin de mes no había forma de separar lo que se usó de lo que se
-- perdió.
--
-- Por eso un tipo propio, con el costo congelado al momento del retiro (si
-- después cambia el precio de compra, el consumo de ese mes no se mueve) y la
-- empleada que lo retiró. No genera egreso: la plata ya salió con la compra.
--
-- Ojo: el ADD VALUE tiene que quedar committeado antes de que alguien inserte
-- un movimiento 'uso_interno'. Con scripts/apply-migration.ts cada statement va
-- por separado, así que alcanza con correr el archivo una vez.
ALTER TYPE tipo_movimiento_stock ADD VALUE IF NOT EXISTS 'uso_interno';

alter table movimientos_stock add column if not exists costo_unitario double precision;
alter table movimientos_stock add column if not exists empleado_id text references empleados(id);
