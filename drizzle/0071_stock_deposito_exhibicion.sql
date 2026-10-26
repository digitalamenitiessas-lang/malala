-- Stock de reventa en dos lugares: depósito y exhibición.
--
-- Yerba Buena: "una cosa es lo que existe en depósito, otra lo que existe en
-- salón exhibido y otra los productos que estaban en exhibición y se
-- destinaron a bacha". El depósito es el backup; la góndola se repone desde
-- ahí. Con un solo número no se podía controlar ninguno de los dos.
--
-- cantidad sigue siendo el TOTAL (todo lo que ya lee el stock sigue andando).
-- cantidad_deposito es la parte guardada; exhibición = cantidad - depósito.
-- Los insumos de bacha no usan depósito: queda en 0.
--
-- 'reposicion' pasa unidades del depósito a la góndola: no cambia el total.
-- movimientos_stock.ubicacion dice de qué lugar entró o salió un movimiento
-- ('deposito' | 'exhibicion'); null en los anteriores a esta migración.
--
-- Ojo: el ADD VALUE tiene que quedar committeado antes de que alguien inserte
-- una 'reposicion'. Corriendo el archivo con psql (autocommit) alcanza.
ALTER TYPE tipo_movimiento_stock ADD VALUE IF NOT EXISTS 'reposicion';

alter table stock_sucursal add column if not exists cantidad_deposito double precision not null default 0;
alter table movimientos_stock add column if not exists ubicacion text;
