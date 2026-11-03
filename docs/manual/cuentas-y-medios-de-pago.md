# Cuentas y medios de pago
palabras: cuenta bancaria, billetera, Mercado Pago, caja efectivo, banco, medio de pago, forma de cobro, cuenta destino, dónde cae la plata, desactivar, recargo, código
quién: dueño/admin (si la encargada entra, la pantalla la devuelve a Catálogos)

Las **cuentas** son los lugares donde está la plata: el cajón, Galicia, Mercado Pago, etc. Los **medios de pago** son las formas de cobrar, y cada uno dice en qué cuenta cae la plata.

## Paso a paso
**Crear una cuenta:** "Catalogos" → "Cuentas bancarias" → "Agregar cuenta". Completá "Sucursal", "Nombre", "Tipo" y, si querés, "Observación" (CBU, alias). Después tocá "Agregar".
- Hay solo dos tipos: "Banco" y "Efectivo". Mercado Pago y las billeteras virtuales se cargan como "Banco".
- Las cuentas tipo "Efectivo" son el cajón. Para el sistema, un cobro es en efectivo cuando cae en una de ellas, se llame como se llame el medio.

**Crear un medio de pago:** "Catalogos" → "Medios de pago" → "Agregar medio de pago".
1. Completá "Sucursal", "Código", "Nombre", "Cuenta destino" y "Recargo %". El código es un apodo de hasta 8 letras (MP, TRANSF). EF y CC están reservados para efectivo y cuenta corriente.
2. Tildá "No entra plata con este medio" solo para cortesías o canjes: la venta se registra y la chica cobra su comisión, pero no entra plata.
3. Tocá "Agregar".

**Vincular un medio existente a una cuenta:** en la tabla, columna "¿Dónde cae la plata?", elegí la cuenta y tocá "Guardar".

**Activar o desactivar:** usá "Desactivar" o "Reactivar" en cada fila. No se borra nada.

## Ojo con / casos comunes
- Ejemplo con Mercado Pago: creá la cuenta "Mercado Pago" con tipo "Banco" y después elegila en la fila del medio MP.
- Si aparece "Hay un medio de pago sin cuenta destino", lo que se cobre con ese medio **no va a entrar a la caja del día**. No hay que crearlo de nuevo: elegile la cuenta en su fila.
- El medio "GIFT" no lleva cuenta, porque pagar con gift card no trae plata nueva.
- "Cuenta destino" muestra solo las cuentas de la sucursal activa. Un medio solo puede apuntar a una cuenta de su misma sucursal.
- Una cuenta desactivada no aparece en la apertura, en el cierre, en "Caja diaria" ni en los formularios de ingreso y de transferencia. En "Cuentas y saldos" sigue apareciendo, marcada como "Cuenta inactiva".
- Un medio desactivado no aparece en "Nueva venta" ni en "Nuevo gasto".
- Si cambiás la cuenta de un medio, el cambio vale para los cobros que vengan. Los anteriores quedan en la cuenta de antes.
- No puede haber dos medios con el mismo código en una sucursal: si después de "Agregar" el medio no aparece en la tabla, probá con otro código.
