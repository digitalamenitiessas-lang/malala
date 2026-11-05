-- Interruptor del control de stock (conteo, reporte y lista para comprar).
--
-- Se desplegó el 05/11/2026 junto con el tercer medio de pago y se entrega al
-- salón al día siguiente: hasta entonces queda apagado. Apagado, los botones de
-- Stock no aparecen y las pantallas mandan a /stock. Solo las ven los emails de
-- MALALA_PREVIEW_EMAILS (en /etc/malala/app.env), para revisarlas. Se prende con:
--   update sucursales set control_stock_habilitado = true;
alter table sucursales
  add column if not exists control_stock_habilitado boolean not null default false;
