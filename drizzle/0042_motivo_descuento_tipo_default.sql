-- Cada motivo de descuento dice si se carga en pesos o en porcentaje.
--
-- El salón lo pidió por los packs: una sesión de pack vale $30.000 en vez de
-- $40.000, o sea $10.000 menos. Eso se sabe en pesos. Para cargarlo había que
-- traducirlo a 25% de cabeza, en el mostrador, con la clienta esperando, y
-- equivocarse ahí sale plata.
--
-- Pero poner pesos como default global hubiera movido el problema de lugar: de
-- los diez motivos que tienen, siete son porcentajes fijos ("35% off",
-- "30 % Golden Concept", "15% Macro"). Ahí la cuenta de cabeza sería la otra.
--
-- Así que la preferencia vive en el motivo, que es quien la conoce: "Pack de
-- sesiones" se carga en pesos, "Descuento Familia (35% off)" en porcentaje.
-- null = sin preferencia, el formulario queda como esté.

alter table motivos_descuento
  add column if not exists descuento_tipo_default text;

alter table motivos_descuento
  drop constraint if exists motivos_descuento_tipo_default_chk;

alter table motivos_descuento
  add constraint motivos_descuento_tipo_default_chk
  check (descuento_tipo_default in ('pct', 'monto'));

-- Los packs se cargan en pesos: es la diferencia contra el precio normal.
update motivos_descuento
set descuento_tipo_default = 'monto'
where nombre = 'Pack de sesiones';

-- Los que llevan el porcentaje en el nombre se cargan en porcentaje. Se listan
-- uno por uno a propósito: adivinar el número leyendo el nombre es justo la
-- clase de atajo que después le cobra de menos a alguien.
update motivos_descuento
set descuento_tipo_default = 'pct'
where nombre in (
  '30 %  Golden Concept',
  'Autoconsumo Socios (50 % off)',
  'Descuento clientas  - wsapp (30 %)',
  'Descuento empleadas (35 % off)',
  'Descuento Familia -pago tarjeta (15% off)',
  'Descuento Familia (35% off)',
  'Promos Septiembre (35 % off)',
  'Tarjetas banco Macro (15% off)'
);
