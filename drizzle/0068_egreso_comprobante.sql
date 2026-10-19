-- Numero de factura/remito del gasto.
--
-- Lo venian escribiendo a mano en observaciones, y la misma factura aparece
-- tipeada de tres formas distintas: "0070-0436916", "00436916",
-- "0070-00436916", "facTURa 0018-0081901". Asi no se puede buscar una factura
-- ni cruzar la cuenta corriente contra los papeles del proveedor.
--
-- Pedido textual: "necesito que independientemente del lugar desde donde cargue
-- el gasto yo le pueda poner datos de la factura que estoy ingresando (factura
-- que contiene los insumos), esos datos tienen que aparecerme luego en cuenta
-- corriente del proveedor y hoy no aparecen".
--
-- Sin unique: un mismo numero puede repetirse entre proveedores distintos, y
-- dos renglones de la misma factura cargados por separado comparten numero a
-- proposito.
alter table egresos add column if not exists comprobante text;

create index if not exists egresos_comprobante_idx
  on egresos (comprobante)
  where comprobante is not null;
