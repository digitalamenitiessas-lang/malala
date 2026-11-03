# Fiado y deuda de una clienta (cuenta corriente)
palabras: fiado, fiar, deuda, debe, cuenta corriente, CC, saldar, pago de deuda, saldo a favor, vuelto, a cuenta
quién: dueño/admin, encargada (revertir un movimiento: solo superadmin)

La cuenta corriente anota lo que una clienta debe (fiado) y lo que deja a favor. Se ve y se maneja en la ficha de la clienta.

## Habilitarla
1. Menú "Clientes" → abrí la clienta.
2. En "Cuenta corriente" tocá "Habilitar cuenta corriente".

## Cómo se genera la deuda
- En una venta, cobrando una parte o todo con "CC — Cuenta corriente" (solo aparece si la clienta la tiene habilitada).
- Vendiendo una gift card fiada.
- A mano: en la ficha, "Registrar cargo" → "Monto" y "Descripcion (opcional)" → "Registrar cargo".

## Registrar un pago
1. Ficha de la clienta → "Registrar pago" (viene con la deuda completa; se puede bajar para un pago parcial).
2. Si pagó otro día, completá "Cuándo la entregó (opcional)"; la plata entra en la caja de ese día.
3. Elegí "Medio de pago" y, si es bancario, la "Cuenta de cobro".
4. Tocá "Registrar pago".

## Saldo a favor
- Si deja el vuelto para la próxima: "Dejó saldo a favor" → monto y medio → "Guardar saldo a favor". La plata entra hoy a la caja.
- Se usa en la próxima venta cobrando esa parte con "CC".

## Dónde se ve
- En la ficha: "Deuda actual" o "Saldo a favor", y la lista de "Movimientos" (Cargo / Pago / A favor).
- En "Clientes", la columna "Saldo CC".
- En "Caja diaria", el cuadro "Deudas pendientes · cuenta corriente", con el botón "Saldar" que lleva a la ficha.

## Ojo con / casos comunes
- La deuda es POR SUCURSAL: lo fiado en Yerba Buena solo se ve y se cobra desde Yerba Buena, y lo mismo con Centro.
- No se puede cobrar más de lo que debe en esa sucursal: "El pago no puede superar la deuda de esta sucursal (…)". Si no debe nada ahí: "El cliente no tiene deuda pendiente en esta sucursal".
- Si el día del pago ya tiene la caja cerrada, primero hay que reabrir ese cierre (Caja → Cierres anteriores → "Reabrir cierre").
- Sin cuenta habilitada sale "El cliente no tiene la cuenta corriente habilitada".
- "Deshabilitar" solo aparece sin deuda ni saldo a favor. Si debe en la otra sucursal, sale "No se puede deshabilitar la cuenta corriente con saldo pendiente. Saldá la deuda primero."
- Un pago mal cargado lo revierte solo un usuario superadmin con "Revertir" → "¿Seguro?". Si no tenés ese perfil, pedíselo a quien lo tenga o reportalo.
- Si se anula una venta fiada, la deuda se borra sola.
