# Anticipos (adelantos de sueldo)
palabras: anticipo, adelanto, adelanto de sueldo, vale, le di plata, revertir anticipo, descontar, transferencia, Galicia, Macro, liquidación
quién: dueño/admin (se carga desde la ficha de la empleada)

Un anticipo es plata que se le da a una empleada antes del pago. Sale de la caja ese día como gasto y se le descuenta sola en la liquidación.

## Paso a paso
1. Entrá a "Catalogos" → "Empleados" y tocá "Editar" en la empleada.
2. Bajá hasta "Anticipos" y tocá "Registrar anticipo".
3. "Monto".
4. "Medio de pago": arranca en Efectivo. Si no es efectivo, aparece "De qué cuenta sale" (por ejemplo Galicia o Macro en una transferencia); vacío usa la cuenta del medio.
5. "Cuándo se lo diste (opcional)": vacío es hoy. No acepta fechas futuras.
6. "Cuándo se le descuenta (opcional)": vacío = en la liquidación de esta semana. Si acordaron descontarlo más adelante, poné ese día: la plata sale igual el día que se la diste.
7. "Observacion (opcional)", por ejemplo "Adelanto quincena".
8. Tocá "Registrar anticipo".

## Cómo impacta
- Se crea un gasto en el rubro Sueldos ("Anticipo [nombre]") y sale de la caja o de la cuenta elegida ese día.
- "Pendiente de descontar" suma los que todavía no entraron en una liquidación.
- En la liquidación aparece en "Anticipos del período (se descuentan)" y se resta. Entra si el día de descuento (o, si no hay, el día en que se dio) cae hasta el "Hasta" de esa liquidación. Después figura "Descontado".

## Revertir un anticipo
En el "Historial", tocá "Revertir" y después "¿Seguro?". Se borra el anticipo y su gasto: la plata vuelve a la caja.

## Ojo con / casos comunes
- La caja de ese día tiene que estar abierta: "Tenés que abrir la caja del … antes de registrar anticipos de ese día."
- Si esa caja ya está cerrada (para cargar o revertir): Caja → Cierres anteriores, abrir ese cierre, "Reabrir cierre", hacer el cambio y volver a cerrar.
- Uno "Descontado" no se revierte: "Para sacarlo hay que anular esa liquidación primero." Anular la liquidación NO devuelve la plata: el anticipo vuelve a quedar pendiente.
- Sin el rubro "Sueldos" no deja cargar anticipos.
- No cargues un adelanto como gasto común en "Gastos": sale de la caja pero no se le descuenta a nadie.
- La observación se puede corregir después desde la liquidación.
- La ficha de la empleada solo se abre con usuario admin: si sos encargada, pedíselo a un admin.
