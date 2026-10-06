-- Pagos a cuenta de un proveedor.
--
-- Elu: "nunca pagamos toda una factura junta. Se pagan montos aislados todas
-- las semanas".
--
-- Hasta ahora una factura se pagaba entera o no se pagaba: el gasto tenia un
-- flag `pagado` y marcarlo bajaba la deuda por el total. Con la forma real de
-- pagar del salon eso no sirve nunca, asi que la deuda del proveedor quedaba
-- congelada y los pagos no se registraban en ningun lado.
--
-- El modelo que si representa lo que hacen: las facturas impagas suman deuda
-- (eso ya pasaba) y los pagos la bajan, sin tener que decir a que factura va
-- cada uno. Es la cuenta corriente del proveedor.
--
-- anulado y no delete: un pago mueve plata de la caja, asi que borrarlo
-- dejaria el movimiento bancario huerfano o la deuda mal. Se anula, se revierte
-- y queda el rastro.
CREATE TABLE IF NOT EXISTS pagos_proveedor (
  id text PRIMARY KEY,
  proveedor_id text NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  sucursal_id text NOT NULL REFERENCES sucursales(id),
  fecha timestamptz NOT NULL,
  monto double precision NOT NULL,
  mp_id text REFERENCES medios_pago(id),
  mp_cuenta_id text REFERENCES cuentas_bancarias(id),
  observacion text,
  anulado boolean NOT NULL DEFAULT false,
  usuario_id uuid NOT NULL REFERENCES profiles(user_id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pagos_proveedor_prov_idx
  ON pagos_proveedor (proveedor_id, fecha);
