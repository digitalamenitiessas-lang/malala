# Liquidaciones (comisiones y sueldos)
palabras: liquidación, liquidar, sueldo, semanal, comisiones, pagar a las chicas, horas, asegurado, viáticos, anticipos, descuentos, anular liquidación
quién: dueño/admin y encargada crean y pagan; solo dueño/admin anula

Calcula lo que cobra cada empleada en un período y registra el pago.

## Cuánto hay que juntar esta semana
En "Liquidaciones", "Lo que hay que pagar esta semana" muestra lo acumulado por empleada desde su último pago, "Efectivo en caja ahora" y "Falta juntar" o "Sobra después de pagar". Es estimado (horas de la ficha, sin el fijo mensual de las encargadas).

## Crear una liquidación
1. Tocá "Nueva liquidación".
2. Elegí "Empleado *". El período viene con los últimos 7 días hasta hoy ("Desde" / "Hasta"; no se liquida a futuro).
3. Tocá "Calcular comisiones".
4. Revisá:
   - Comisiones de servicios y productos. Las marcadas "de períodos anteriores" no se habían liquidado y entran ahora.
   - "Horas trabajadas en el período": viene sugerido ("Usar sugerido"); corregilo si hace falta.
   - "Sueldo básico del período" (solo si tiene básico en la ficha).
   - "Viáticos del período": los "ya entregados" no se pagan de nuevo.
   - "Anticipos del período (se descuentan)" y "Descuentos del período (no salieron de la caja)".
   - Diferencias de redondeo anteriores: "A favor de la semana pasada" o "Se le adelantó la semana pasada".
5. Mirá el "Total a pagar" y tocá "Guardar liquidación". Queda "Pendiente".

## Pagarla
1. Abrila con "Ver" en la lista.
2. En "Registrar pago", "Cuánto se paga" viene con el total. Si redondeás, poné lo que le das: la diferencia pasa sola a la próxima.
3. "Medio de pago" (arranca en Efectivo). Con "Segundo medio (opcional)" cargás su monto: los dos montos SE SUMAN.
4. "Cuándo se pagó": vacío es hoy; acepta hasta 60 días atrás, con esa caja sin cerrar.
5. "Marcar pagada": se crea el gasto en el rubro Sueldos.

## Anularla
"Zona de riesgo" → "Anular liquidacion" → "Confirmar anulacion". Borra la liquidación y su pago, y libera comisiones, anticipos, descuentos y viáticos para volver a liquidarlos.

## Ojo con / casos comunes
- Según el tipo de comisión: "Porcentaje" cobra la mayor entre comisiones y horas (no se suman); "Mixto" suma horas + comisiones + básico; "Sueldo fijo" suma horas + comisiones.
- "Ya existe una liquidación de este empleado que cubre esas fechas": anulá esa o cambiá el período.
- Con sueldo a cobrar no acepta pagar 0: "Si todavía no se le paga, dejá la liquidación pendiente."
- Con la caja del día del pago cerrada, hay que reabrir el cierre para pagar o anular.
- Anular no devuelve la plata de los anticipos: vuelven a quedar pendientes.
- Si se pagó redondeado y esa diferencia ya entró en otra posterior, primero se anula la posterior.
- Si en el período solo hay viáticos (sin servicios ni horas), al guardar puede salir «No hay servicios, horas ni viatico…». Es un error conocido: reportalo a soporte.
