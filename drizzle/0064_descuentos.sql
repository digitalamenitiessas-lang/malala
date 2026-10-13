-- Descuentos: lo que se le cobra a una empleada sin que salga plata de la caja.
--
-- Hasta ahora lo unico que bajaba una liquidacion era el anticipo, y un
-- anticipo SACA plata del cajon el dia que se da. Esto es otra cosa: un curso,
-- un producto que se llevo, lo que sea que el salon le descuenta el sabado.
-- Nunca hubo un movimiento de caja asociado y no tiene que haberlo.
--
-- Dicho por Yerba Buena: "Lo de 'descuentos' si sirve. Para muchos items que no
-- salen de la caja hasta el dia del pago del sabado".
--
-- El caso que lo destapo: $47.500 de un curso de Carolina. Se le descontaron de
-- lo que se le pago y no quedaron registrados en ningun lado, porque cargarlos
-- como anticipo hubiera sacado $47.500 de una caja de la que nunca salieron.
CREATE TABLE IF NOT EXISTS descuentos (
  id text PRIMARY KEY,
  empleado_id text NOT NULL REFERENCES empleados(id),
  sucursal_id text NOT NULL REFERENCES sucursales(id),
  fecha timestamptz NOT NULL,
  -- Dia en que se descuenta, si se acordo para mas adelante. Mismo criterio
  -- que los anticipos: vacio = se descuenta en su propia fecha.
  fecha_descuento date,
  monto double precision NOT NULL,
  -- Por que se le descuenta. Obligatorio: un descuento sin motivo es un
  -- numero que nadie va a poder explicar tres semanas despues.
  concepto text NOT NULL,
  observacion text,
  liquidacion_id text REFERENCES liquidaciones(id),
  usuario_id uuid NOT NULL REFERENCES profiles(user_id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS descuentos_empleado_liq_idx
  ON descuentos (empleado_id, liquidacion_id);

CREATE INDEX IF NOT EXISTS descuentos_empleado_fecha_idx
  ON descuentos (empleado_id, fecha);

-- Lo descontado por este concepto en cada liquidacion. Separado de
-- total_anticipos a proposito: uno ya salio de la caja y el otro no, y
-- sumarlos haria que el detalle de la liquidacion mienta sobre que paso.
ALTER TABLE liquidaciones
  ADD COLUMN IF NOT EXISTS total_descuentos double precision NOT NULL DEFAULT 0;
