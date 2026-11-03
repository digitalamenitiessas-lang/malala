# Cobrar: medios de pago de una venta
palabras: medio de pago, cobrar, efectivo, transferencia, tarjeta, recargo, dos medios, tres medios, medio 3, pago dividido, gift card, fiado, cuenta corriente, dólares
quién: dueño/admin, encargada

Es la parte "Medios de pago" de "Nueva venta": con qué pagó la clienta. Se puede cobrar con uno o dos medios, y con tres si la sucursal tiene habilitado el tercer medio (hoy apagado en las dos; es una función aparte que se contrata).

## Paso a paso
1. En "Medio 1" elegí cómo cobrás. Si existe efectivo ("EF") viene elegido; si no, dice "— Elegí cómo cobrás —".
2. Con un solo medio, "Valor 1" se llena solo con el total.
3. Para dos medios, elegí "Medio 2 (opcional)": "Valor 2" se completa con lo que falta y, si corregís uno, el otro se ajusta.
4. Para tres medios (por ejemplo dos gift cards y el resto por transferencia), si la sucursal lo tiene habilitado, con el Medio 2 ya elegido aparece "Medio 3 (opcional)": "Valor 3" se lleva lo que falta. Si corregís el Valor 1 o el 2, se ajusta el 3; si corregís el 3, se ajusta el 2. Si sacás el Medio 2, el 3 se va con él.
5. En medios bancarios aparece "Cuenta de cobro (Medio 1)" (o del 2 o el 3): dejá "— Cuenta por defecto del medio —" o elegí la cuenta.
6. "Pagado · Total · Diferencia" tiene que dar diferencia $0 para poder guardar.

## Con gift card
1. Elegí el medio de gift card ("GIFT — …").
2. En "Gift card (Medio 1)" elegí la tarjeta; primero salen las de la clienta. Las usadas o anuladas aparecen deshabilitadas.
3. El valor se pone solo con lo que cubre ("Le quedan $…"). Si no alcanza, el resto va en "Medio 2".
4. Dos o tres gift cards: cada medio con gift card lleva su tarjeta (no se puede repetir la misma).

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
- Errores: "Falta elegir la gift card del Medio 1" (o 2, o 3), "La gift card no tiene saldo suficiente para ese monto.", "Esa gift card se vendió en otra sucursal".
- Si un medio es en otra moneda, aparecen "Cuántos …" (en esa moneda) y "Cotización"; la venta se guarda en pesos. El Medio 3 no ofrece medios en otra moneda: la conversión completa el Medio 1 o el 2.
