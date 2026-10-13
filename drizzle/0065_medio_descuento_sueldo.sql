-- Forma de pago "Descuento de sueldo".
--
-- Una empleada compra algo —tipicamente una gift card con su descuento de
-- empleada— y lo paga con su sueldo, en una o varias cuotas. No entra plata a
-- la caja ese dia y no entra nunca: lo que pasa es que el sabado se le paga
-- menos.
--
-- Antes habia que fiarlo por cuenta corriente, y ahi quedaba un agujero que el
-- salon vio antes que nosotros: "ese monto se salda automaticamente cuando la
-- encargada haga la liquidacion el sabado? Me parece que falta una cosita mas
-- ahi para que quede en cero la cuenta corriente". No se saldaba: no hay forma
-- de cancelar una cuenta corriente sin registrar un ingreso que nunca existio.
--
-- Con este medio la deuda vive en un solo lugar, Descuentos, y se cobra sola en
-- la liquidacion.
--
-- mueve_plata = false y sin cuenta: igual que Gift card y Cuenta corriente.
INSERT INTO medios_pago (id, sucursal_id, codigo, nombre, activo, cuenta_id, recargo_pct, moneda, mueve_plata)
SELECT
  'mp-dtosueldo-' || s.id,
  s.id,
  'DTOSUELDO',
  'Descuento de sueldo',
  true,
  NULL,
  0,
  'ARS',
  false
FROM sucursales s
WHERE NOT EXISTS (
  SELECT 1 FROM medios_pago mp
  WHERE mp.sucursal_id = s.id AND upper(mp.codigo) = 'DTOSUELDO'
);
