# Cargar una venta
palabras: venta, cargar venta, ticket, cobrar, nueva venta, servicio, producto, comisión, promo, descuento, venta de otro día
quién: dueño/admin, encargada (las empleadas no cargan ventas; solo ven "Mis ventas")

Sirve para registrar lo que se le hizo y vendió a una clienta. Al guardar, el stock se descuenta solo y la plata entra en la caja del día.

## Paso a paso
1. La caja del día tiene que estar abierta (Caja diaria). Si no, al guardar sale: "Tenés que abrir la caja de hoy antes de registrar ventas."
2. Menú "Ventas" → "Nueva venta".
3. En "Cliente" buscá a la clienta. Si no existe, "+ Nuevo" (pide "Nombre *" y "Teléfono") → "Crear". Vacío = "Consumidor Final".
4. Si la venta es de otro día, tocá "+ Es de otro día" y elegí la fecha (hasta 60 días atrás). La caja de ESE día tiene que estar abierta y sin cerrar.
5. Agregá las líneas:
   - "Agregar servicio": servicio (se busca tipeando), profesional en "— Empleado —", cantidad y precio con "Lista" o "Efectivo". El % de comisión viene de la ficha de la profesional y se puede cambiar en la línea.
   - "Agregar producto": producto, "Cantidad", "Precio unitario" y en "Vendió" quién lo vendió (arranca en 10%) o "— Sin comisión —".
   - "+ Agregar promo": suma una línea por servicio del combo, con precio fijo.
6. Descuento: primero "Motivo", después "Tipo" ("Porcentaje (%)" o "Monto ($)") y "Valor".
7. Completá "Medios de pago" (ver tema medios de pago) y, si querés, "Observación".
8. Si la clienta no quedó conforme, destildá "El cliente quedó satisfecho".
9. Tocá "Guardar venta".

## Ojo con / casos comunes
- Servicio hecho entre dos: "+ Lo hicieron dos", elegí "— Con quién —" y el reparto (ej. 50 / 50). En promos no se puede.
- La comisión de un servicio sale del precio EFECTIVO del catálogo aunque se cobre a precio de lista: por eso no siempre da el 30% de lo cobrado.
- Clienta propia de una profesional con otro %: cambialo en esa línea antes de guardar.
- Línea en "Efectivo" + descuento: avisa "Cuidado: estás acumulando descuentos".
- Con descuento el motivo es obligatorio. Algunos motivos no le bajan la comisión a la empleada (se configura en Catalogos → Motivos de descuento).
- Promo vencida o fuera de horario: avisa "Promo fuera de vigencia" pero deja vender. Se puede quitar un servicio suelto de un combo.
- Enter no guarda: hay que tocar el botón.
- Caja ya cerrada: "La caja de hoy ya está cerrada para esta sucursal. Reabrí el cierre desde Caja para registrar más ventas."
- Sin stock suficiente se guarda igual, con aviso "Stock negativo en …".
