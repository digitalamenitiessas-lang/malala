# Cargar un gasto
palabras: gasto, egreso, cargar gasto, pagar, factura, remito, rubro, proveedor, medio de pago, pendiente, a pagar, marcar pagado, anular gasto
quién: dueño/admin, encargada (la empleada no ve "Gastos")

Sirve para anotar cualquier salida de plata del salón (alquiler, servicios, compras) o un gasto que queda a pagar a un proveedor.

## Paso a paso
1. Entrá a "Gastos" y tocá "Nuevo gasto".
2. Si es una compra de mercadería, tildá "Es compra de insumo o producto" (ver el tema de stock).
3. "Fecha": viene la de hoy. La caja de ese día tiene que estar abierta y sin cerrar.
4. "Rubro": obligatorio.
5. "Proveedor (opcional)". Si no existe, elegí "➕ Crear proveedor nuevo" y completá "Nombre del proveedor".
6. "Monto total".
7. "Ya está pagado" viene tildado:
   - Tildado: elegí "Medio de pago" (arranca en Efectivo). Si no es efectivo aparece "Cuenta"; vacía ("— Cuenta por defecto del medio —") sale de la cuenta del medio. Con dos medios, elegí "Medio 2 (opcional)" y su "Monto del medio 2": el primero cubre el resto.
   - Destildado: queda pendiente, no sale plata y la deuda va a la cuenta del proveedor. El campo pasa a "Proveedor (a quien se le debe)" y es obligatorio.
8. "Número de factura o remito (opcional)" y "Observación".
9. Tocá "Registrar gasto".

## Marcar como pagado un gasto pendiente
1. En "Gastos" (podés tildar "Solo pendientes" y "Filtrar"), buscá la fila "Pendiente".
2. Tocá "Marcar pagado". Si se cargó sin medio, aparece "¿Con qué se pagó?": elegilo y tocá "Pagado".
3. La plata sale en ese momento (con fecha de hoy) y baja la deuda del proveedor. "Marcar pendiente" lo vuelve atrás.

## Anular un gasto
1. En la fila, tocá "Anular", escribí un "Motivo (opcional)" y "Confirmar".
2. Vuelve el stock que sumó, sale de la caja si estaba pagado y se saca de la deuda si estaba pendiente. No se borra: se ve tildando "Ver anulados".

## Ojo con / casos comunes
- "Tenés que abrir la caja del … antes de cargar egresos": abrí esa caja primero.
- Si la caja de esa fecha ya está cerrada, hay que ir a Caja → Cierres anteriores y tocar "Reabrir cierre", o usar otra fecha. Lo mismo para anular.
- Pendiente sin proveedor da error: "Elegí el proveedor: si el gasto queda a pagar, la deuda va a su cuenta…".
- Un adelanto a una empleada NO se carga acá: va en su ficha, en "Anticipos", para que se descuente en la liquidación.
- Los gastos de un viático, anticipo o liquidación no se anulan acá: "Anulalo desde ahí, no desde Gastos."
- Anular una compra no devuelve el precio anterior del insumo: se corrige a mano en Catalogos → Insumos.
- El "Monto del medio 2" no puede ser igual o mayor al total.
