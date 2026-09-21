-- Segundo precio de venta para los productos de reventa.
--
-- Los servicios ya tienen dos precios (lista y efectivo) y la venta deja
-- elegir cuál se cobra con un botón. Los productos tenían uno solo, así que
-- para hacer el mismo 20% había que cargar un descuento manual sobre TODO el
-- ticket — y si el ticket mezclaba servicio + producto, el descuento caía
-- también sobre el servicio, que no correspondía.
--
-- Queda nullable a propósito: null = este producto tiene un precio y punto,
-- que es como están cargados los 64 productos de venta hoy. Recién cuando el
-- salón le carga un precio efectivo aparece el botón en la venta.

alter table insumos add column if not exists precio_venta_efectivo double precision;
