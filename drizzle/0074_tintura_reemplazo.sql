-- Elegir la tintura usada al cobrar.
--
-- Yerba Buena: "todo Igora, incluso Color 10, se usa en servicios L'Oréal".
-- Cada receta descuenta UNA tintura fija (Color Raiz Loreal → Majirel), así que
-- un color hecho con Igora le restaba a Majirel y la Igora no bajaba nunca.
--
-- insumos.grupo_reemplazo: los insumos con el mismo grupo (en la misma sucursal
-- y la misma unidad) se pueden elegir al cobrar en lugar del de la receta.
-- null = no se reemplaza.
--
-- ingreso_lineas.reemplazos: {insumo de la receta: insumo que se usó}. Solo los
-- que cambiaron; null = se usó lo de la receta. El stock se descuenta del usado
-- y el costo de la línea se calcula con él.
alter table insumos add column if not exists grupo_reemplazo text;
alter table ingreso_lineas add column if not exists reemplazos jsonb;
