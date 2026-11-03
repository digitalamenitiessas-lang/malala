# Deuda con proveedores y pagos a cuenta
palabras: proveedor, deuda, saldo, cuenta corriente, le debemos, pago a cuenta, pagar proveedor, facturas impagas, en cuenta, historial de pagos
quién: dueño/admin, encargada

Muestra cuánto se le debe a cada proveedor y permite registrar lo que se le va pagando, aunque sean montos sueltos y no facturas enteras.

## Dónde se ve la deuda
1. Entrá a "Catalogos" → "Proveedores" y tocá el nombre del proveedor. (La lista solo muestra "Total comprado", no la deuda.)
2. Arriba está "Saldo a favor del proveedor": es lo que se le debe hoy (total histórico, no cambia con el filtro de fechas). También "Total comprado", "Ticket promedio" y "Pagado".
3. La deuda se forma con los gastos cargados a ese proveedor sin tildar "Ya está pagado". En "Histórico de egresos" esos aparecen como "En cuenta", con la columna "Factura" si se cargó el número.

## Registrar un pago a cuenta
1. En la ficha del proveedor, bajá a "Registrar un pago" (solo aparece si el saldo no está en cero).
2. "Monto": lo que le pagaste.
3. "Sucursal" (solo si tenés más de una) y "Con qué": el medio de pago, que define de qué cuenta sale la plata.
4. "Día (opcional)": vacío es hoy; no acepta fechas futuras.
5. "Observación", por ejemplo "a cuenta de las facturas de septiembre".
6. Antes de guardar te muestra "Deuda actual … → queda …". Tocá "Registrar pago".
7. El pago queda en "Pagos hechos" con fecha, medio y detalle: sirve de prueba si el proveedor dice que no se le pagó.

## Pagar una factura entera
En "Histórico de egresos", la factura "En cuenta" tiene "Marcar pagado". Pregunta "¿Con qué se pagó?", elegís y tocás "Pagado". También se puede hacer desde "Gastos".

## Ojo con / casos comunes
- Las dos formas bajan el saldo. No uses las dos para la misma plata: si pagás a cuenta y después marcás la factura como pagada, la deuda se descuenta dos veces.
- Pagaste a cuenta y las facturas siguen diciendo "En cuenta": es normal, el pago no se asigna a una factura. Lo que vale es el saldo.
- Si pagan de más, el saldo queda negativo: es plata a favor del salón.
- Errores comunes: "Elegí con qué pagaste", "El monto debe ser mayor a 0", "No se puede pagar a futuro".
- Anular un gasto que estaba pendiente también lo saca de la deuda.
- "Registrar compra" (arriba en la ficha) abre "Nuevo gasto" con el proveedor ya elegido y la compra de insumo tildada.
- No hay botón para anular o corregir un pago a proveedor ya registrado: si se cargó mal, hay que reportarlo a soporte.
