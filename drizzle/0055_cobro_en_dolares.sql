-- Cobrar en dolares.
--
-- Una clienta pago en USD y no habia donde cargarlo: la encargada saco la
-- cuenta a mano con el tipo de cambio venta del Galicia y cargo los pesos. El
-- numero queda bien pero la cotizacion no queda en ningun lado, asi que despues
-- no hay forma de explicar de donde salio ese importe ni de reconciliar cuando
-- se cambien los dolares.
--
-- Tres piezas:
--
-- 1. Una cuenta "Caja Dolares" por sucursal, aparte de la de pesos. Los dolares
--    no se mezclan con el efectivo: si entraran a Caja Efectivo, el arqueo
--    pediria contar pesos que no estan en el cajon.
--
-- 2. Un medio de pago USD apuntando a esa cuenta.
--
-- 3. moneda y cotizacion en medios_pago: la cotizacion la carga quien cobra, en
--    el momento, que es como lo pidio el salon (cada dia es otro dolar). Lo que
--    se guarda en la cuenta son PESOS al cambio de ese momento.
--
-- Nota sobre lo que esto NO resuelve: si el salon se queda los dolares y los
-- cambia semanas despues a otra cotizacion, la plata real va a diferir de lo
-- registrado. Esa diferencia aparece en el arqueo de la cuenta y se ajusta como
-- cualquier otra; no se calcula sola.
--
-- Idempotente.
ALTER TABLE medios_pago
  ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'ARS';

ALTER TABLE ingresos
  ADD COLUMN IF NOT EXISTS cotizacion double precision;

-- Cuenta de dolares por sucursal activa.
insert into cuentas_bancarias (id, sucursal_id, nombre, tipo, activo)
select gen_random_uuid()::text, s.id, 'Caja Dolares', 'efectivo', true
  from sucursales s
 where s.activo
   and not exists (
     select 1 from cuentas_bancarias c
      where c.sucursal_id = s.id and lower(trim(c.nombre)) = 'caja dolares'
   );

-- Medio de pago USD apuntando a la caja de dolares de su sucursal.
insert into medios_pago (id, sucursal_id, codigo, nombre, activo, cuenta_id, recargo_pct, moneda)
select gen_random_uuid()::text, s.id, 'USD', 'Dolares', true, c.id, 0, 'USD'
  from sucursales s
  join cuentas_bancarias c
    on c.sucursal_id = s.id and lower(trim(c.nombre)) = 'caja dolares'
 where s.activo
   and not exists (
     select 1 from medios_pago m where m.sucursal_id = s.id and upper(trim(m.codigo)) = 'USD'
   );
