# Stock de insumos y reventa
palabras: stock, insumos, reventa, productos, depósito, góndola, exhibición, reponer, ajuste, conteo, uso interno, bacha, retirar para bacha, sacar del depósito, movimientos, stock bajo, negativo
quién: dueño/admin y encargada (ver, reponer, uso interno); solo dueño/admin hace "Ajuste manual"

Muestra cuánto hay de cada insumo y producto de reventa. En reventa el stock se divide en depósito y exhibición (góndola).

## Ver el stock
- En "Stock": "Valor del stock", "Stock bajo" y "Stock negativo". Filtros "Todo", "Reventa", "Uso del salón", el buscador "Buscar insumo..." y "Todos" / "Bajo" / "Negativo".
- La columna "Stock" está en ml, g o ud, con el equivalente en envases. En reventa muestra "exhib. … · dep. …".
- "Bajo" = por debajo del "Umbral". Se configura en Catalogos → Insumos ("Umbral stock bajo"), en ml/g/ud, no en envases.

## Compra (entra stock)
1. "Gastos" → "Nuevo gasto" → tildá "Es compra de insumo o producto".
2. "Proveedor", "Insumo" (o "➕ Crear insumo nuevo"), "Cantidad de envases" y "Monto total pagado".
3. "Registrar compra". Suma envases × contenido, actualiza el precio del envase (monto ÷ envases) y va al rubro Insumos. La reventa entra al depósito.

## Reponer exhibición (depósito → góndola)
"Reponer exhibición" → "Producto" → "Cantidad que pasa a la góndola" (envases enteros) → "Reponer". No cambia el total. Si una venta se lleva algo que no figuraba en exhibición, el sistema lo repone solo desde el depósito.

## Retiro para uso interno o bacha
Para sacar un producto (del depósito o de la góndola) y usarlo en bacha **no se usa "Ajuste manual"**: es "Uso interno". Así queda registrado quién lo sacó y por qué.

"Uso interno" → "Producto de venta" → "De dónde sale" ("Exhibición" o "Depósito") → "Envases retirados" → "Quién lo retiró" → "Motivo" → "Retirar para uso interno". Baja el stock y queda valuado a costo; no genera gasto.

## Ajuste manual
"Ajuste manual" → "Insumo" (en reventa, "Dónde") → "Sumar / restar" o "Fijar stock en" (para un conteo) → cantidad en envases ("Cargar en ml", "g" o "ud" cambia la unidad) → revisá "Movimiento" y "Queda en" → "Motivo" → "Aplicar ajuste".

## Ver movimientos
"Movimientos": filtrá por "Tipo" (Compra, Venta, Ajuste manual, Uso interno, Reposición…), "Desde" y "Hasta", y tocá "Ver". Sin filtros muestra los últimos 200.

## Ojo con / casos comunes
- Un insumo creado desde una compra nace como uso del salón. Si es de reventa, cambiá "Tipo de producto" a "Venta — venta directa al público" en Catalogos → Insumos.
- "Uso interno" y "Reponer exhibición" solo aceptan productos de venta; los de bacha se consumen por receta.
- Tinturas: se descuentan solas al cobrar el servicio de color, en gramos según la receta. Si se usó otra del mismo grupo (Igora en vez de Majirel), se elige en la venta en "Tintura usada". Para cargar un conteo, "Ajuste manual" → "Fijar stock en", con todo junto (depósito + abiertas).
- Del depósito no se saca más de lo que hay: "En depósito hay …: no se puede reponer más que eso" (ese número va en ml/g/ud).
- El ajuste pide "Motivo" y no acepta cero.
- Anular la compra en "Gastos" descuenta el stock que había sumado.
- El gráfico "Stock critico por sucursal" del Dashboard solo lo ve el superadmin; para el resto, en "Stock" está el filtro "Bajo".
