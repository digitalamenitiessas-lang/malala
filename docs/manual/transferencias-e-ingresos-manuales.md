# Saldos, transferencias e ingresos que no son ventas
palabras: cuentas y saldos, bancos, saldo, movimientos, transferir, depositar efectivo, ingreso manual, entró plata, anular ingreso, impuestos, extracto
quién: dueño/admin, encargada

Ver cuánta plata hay en cada cuenta, pasar plata entre cuentas y registrar plata que entra sin ser una venta.

## Paso a paso
**Ver saldos y movimientos**
1. Abrí "Cuentas y saldos". Vas a ver el total y una tarjeta por cuenta. Si manejás las dos sucursales, podés elegir "Todas" o una sola.
2. Tocá una tarjeta para ver solo esa cuenta. Para volver, "← Ver todas las cuentas".
3. Para comparar con el extracto del banco, elegí "Desde" y "Hasta" y tocá "Filtrar". "Entró", "Salió" y "Neto del período" suman lo que estás viendo. "Quitar el filtro" vuelve a los últimos 150 movimientos.

**Registrar un ingreso que no es venta** (una comisión que les transfieren, una devolución, un aporte)
1. En "Registrar un ingreso" completá "A qué cuenta", "Monto" y "De qué es". Si entró en efectivo, elegí Caja Efectivo.
2. "Día (opcional)": si lo dejás vacío, se carga en la caja de hoy. Si ponés otra fecha, va a la caja de ese día.
3. Tocá "Registrar ingreso" y va a aparecer "Ingreso registrado". No cuenta como facturación ni genera comisión.

**Anular un ingreso:** en su fila tocá "Anular", escribí el "Motivo" y tocá "Confirmar anulación". No se borra: queda tachado como "Anulado", más otra fila "Anulación" que lo compensa.

**Transferir entre cuentas** (por ejemplo, depositar en el banco efectivo del cajón)
1. En "Transferir entre cuentas (misma sucursal)" elegí "Desde", "Hacia", "Monto" y, si querés, "Detalle".
2. Tocá "Transferir". Se generan dos filas: "Transf. salida" y "Transf. entrada".
3. Para deshacerla, tocá "Anular" en cualquiera de las dos filas y se anulan juntas.

## Ojo con / casos comunes
- «Escribí de qué es este ingreso» / «El monto debe ser mayor a 0»: falta un dato.
- «La caja del … ya está cerrada. Reabrí ese cierre desde Caja o cargá el ingreso con otra fecha.»: ese día está cerrado (ver "Corregir un día que ya se cerró"). Para anular pasa lo mismo.
- «No se puede cargar a futuro»: la fecha no puede ser posterior a hoy.
- Acá solo se anulan ingresos manuales y transferencias. Ventas, gastos y gift cards se anulan desde su pantalla.
- La transferencia no pide fecha: queda con el momento en que la cargás.
- Si después de "Transferir" no aparecen las dos filas nuevas, la transferencia no se hizo: revisá que "Desde" y "Hacia" sean cuentas distintas y que el monto sea mayor a 0.
- **Impuestos:** si una cuenta tiene impuestos cargados ("Catalogos" → "Cuentas bancarias" → "Impuestos por cuenta"), cada cobro o pago genera solo una fila "Impuesto" que resta del saldo ("Impuestos en la vista: $…"). Ingresos manuales, transferencias y ajustes no generan impuestos.
