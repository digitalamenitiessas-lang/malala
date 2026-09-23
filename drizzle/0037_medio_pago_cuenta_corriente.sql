-- Habilita "CC — Cuenta corriente" como medio de pago en las dos sucursales.
--
-- La cuenta corriente ya estaba entera: saldo por cliente, cargos, pagos, saldo
-- a favor, los deudores en la pantalla de caja, el panel en la ficha del
-- cliente y la validación de que no se puede fiar sin elegir cliente. Lo único
-- que nunca se creó fue la fila en medios_pago, y el formulario de venta busca
-- exactamente codigo = 'CC' para mostrar la opción. Sin esa fila la opción no
-- aparece nunca y todo lo demás queda inalcanzable.
--
-- cuenta_id en null a propósito: fiar no es cobrar. No entra plata a ninguna
-- cuenta, se genera deuda; la plata entra después, cuando se registra el pago
-- desde la ficha del cliente y ahí sí se elige con qué medio.
insert into medios_pago (id, sucursal_id, codigo, nombre, activo, cuenta_id, recargo_pct)
select gen_random_uuid()::text, s.id, 'CC', 'Cuenta corriente', true, null, 0
from sucursales s
where not exists (
  select 1 from medios_pago m
  where m.sucursal_id = s.id and m.codigo = 'CC'
);
