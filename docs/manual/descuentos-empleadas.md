# Descuentos a empleadas (cursos, productos)
palabras: descuento, descontar, cobrarle, curso, producto que se llevó, deuda de la empleada, se le cobra, eliminar descuento, liquidación, sueldo
quién: dueño/admin (se carga desde la ficha de la empleada)

Sirve para anotar algo que se le va a cobrar a una empleada en el pago sin que salga plata de la caja: un curso, un producto que se llevó. A diferencia del anticipo, no genera gasto ni mueve la caja.

## Paso a paso
1. Entrá a "Catalogos" → "Empleados" y tocá "Editar" en la empleada.
2. Bajá hasta "Descuentos" y tocá "Cargar descuento".
3. "Monto" (tiene que ser mayor a 0).
4. "Por qué": obligatorio, por ejemplo "Curso" o "producto que se llevó". Sin esto avisa "Poné por qué se le descuenta".
5. "Cuándo se generó (opcional)": vacío es hoy. No acepta fechas futuras.
6. "Cuándo se le descuenta (opcional)": vacío = se descuenta en la liquidación de esta semana. Si acordaron cobrárselo más adelante, poné ese día.
7. "Observación (opcional)".
8. Tocá "Cargar descuento".

## Cómo se descuenta
- Arriba, "Pendiente de descontar" suma los que todavía no entraron en una liquidación.
- En la nueva liquidación aparece en "Descuentos del período (no salieron de la caja)" y se resta del total. Entra cuando el día de descuento (o, si no hay, el día en que se generó) cae hasta el "Hasta" de la liquidación.
- Después queda marcado "Descontado" y no se vuelve a cobrar.
- Si los descuentos superan lo que cobró, la liquidación da negativo: no se le entrega nada y lo que debe pasa solo a la próxima liquidación.

## Eliminar un descuento
1. En el "Historial", tocá "Eliminar" en el descuento y después "¿Seguro?".
2. Se borra. No hay caja que reabrir porque nunca movió plata.

## Ojo con / casos comunes
- Uno ya "Descontado" no se puede eliminar: "Ese descuento ya se aplicó en una liquidación. Para sacarlo hay que anular esa liquidación primero."
- Si se anula la liquidación, el descuento vuelve a quedar pendiente y se cobra en la siguiente.
- Si le diste plata, no es un descuento: es un anticipo (ese sí sale de la caja).
- El descuento queda en la sucursal principal de la empleada, no en la que tengas en pantalla.
- La observación se puede corregir después desde la liquidación, aunque ya esté pagada.
- La ficha de la empleada solo se abre con usuario admin: si sos encargada, pedíselo a un admin.
