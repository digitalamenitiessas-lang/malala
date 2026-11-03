-- Tercer medio de pago en las ventas.
--
-- Yerba Buena, 03/11/2026: una clienta pagó con dos gift cards (GC-0191 y
-- GC-0192) y el resto por transferencia. La venta aceptaba dos medios, así que
-- la partieron en dos ventas, cada una con una gift card y una transferencia:
-- el ticket queda partido y la transferencia, que fue una sola, aparece dos
-- veces en el banco.
--
-- Mismo patrón que mp2: medio, importe en pesos y banco destino si fue
-- transferencia. Todo nullable; mp3 sólo se usa si hay mp2.
--
-- Hay que aplicarla ANTES de desplegar: el código lee estas columnas en cada
-- select de ventas.
alter table ingresos
  add column if not exists mp3_id text references medios_pago(id),
  add column if not exists valor3 double precision,
  add column if not exists mp3_cuenta_id text references cuentas_bancarias(id);
