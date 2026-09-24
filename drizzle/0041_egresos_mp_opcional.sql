-- El medio de pago de un gasto pasa a ser opcional mientras no esté pagado.
--
-- El salón compra a cuenta corriente: el proveedor entrega, y viene a cobrar
-- una vez por semana. Al cargar esa compra todavía no se sabe con qué se le va
-- a pagar, pero el formulario exigía elegir un medio igual.
--
-- No era sólo un campo de más. "Marcar pagado" genera el movimiento bancario
-- usando el medio guardado, sin volver a preguntar: si se eligió efectivo de
-- relleno y al final se pagó por transferencia, la plata salía de la cuenta
-- equivocada y la conciliación quedaba mal sin que nadie se enterara.
--
-- Ahora el medio queda vacío hasta que el gasto se marca pagado, y ahí se
-- elige. Los gastos ya cargados conservan el suyo.

alter table egresos
  alter column mp_id drop not null;
