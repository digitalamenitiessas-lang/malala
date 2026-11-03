# Cobrar: medios de pago de una venta
palabras: medio de pago, cobrar, efectivo, transferencia, tarjeta, recargo, dos medios, pago dividido, gift card, fiado, cuenta corriente, dólares
quién: dueño/admin, encargada

Es la parte "Medios de pago" de "Nueva venta": con qué pagó la clienta. Se puede cobrar con uno o dos medios.

## Paso a paso
1. En "Medio 1" elegí cómo cobrás. Si existe efectivo ("EF") viene elegido; si no, dice "— Elegí cómo cobrás —".
2. Con un solo medio, "Valor 1" se llena solo con el total.
3. Para dos medios, elegí "Medio 2 (opcional)": "Valor 2" se completa con lo que falta y, si corregís uno, el otro se ajusta.
4. En medios bancarios aparece "Cuenta de cobro (Medio 1)": dejá "— Cuenta por defecto del medio —" o elegí la cuenta.
5. "Pagado · Total · Diferencia" tiene que dar diferencia $0 para poder guardar.

## Con gift card
1. Elegí el medio de gift card ("GIFT — …").
2. En "Gift card (Medio 1)" elegí la tarjeta; primero salen las de la clienta. Las usadas o anuladas aparecen deshabilitadas.
3. El valor se pone solo con lo que cubre ("Le quedan $…"). Si no alcanza, el resto va en "Medio 2".
4. Dos gift cards: Medio 1 y Medio 2 con gift card, cada uno con su tarjeta (no la misma).

## Fiado
- "CC — Cuenta corriente" aparece solo si la clienta tiene la cuenta corriente habilitada.
- Avisa "Se generará una deuda de $… en la cuenta corriente de …". Esa parte no entra a caja.
- Si tiene plata a favor, avisa "… tiene $… a favor. Para usarlo, cobrá esa parte con CC."

## Ojo con / casos comunes
- "Lista" o "Efectivo" se elige en cada línea, no en el medio: el sistema no lo cambia solo al cobrar con tarjeta.
- Un medio con recargo muestra "(+X%)" y "+ recargo X% = $… a cobrar"; el ticket guarda el total con recargo.
- Medio "sin cuenta asignada": la venta se guarda pero esa plata no aparece en la caja del día (se arregla en Catalogos → Medios de pago).
- Gift card vencida: se puede usar; avisa "se va a registrar como canje fuera de término".
- Pack de sesiones: el cobro tiene que ser justo el precio de una sesión; si no, sale "… es un pack: cada sesión se cobra $…".
- Errores: "Falta elegir la gift card del Medio 1", "La gift card no tiene saldo suficiente para ese monto.", "Esa gift card se vendió en otra sucursal".
- Si un medio es en otra moneda, aparecen "Cuántos …" (en esa moneda) y "Cotización"; la venta se guarda en pesos.
