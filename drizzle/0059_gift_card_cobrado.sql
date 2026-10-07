-- Lo que de verdad pagaron por una gift card, cuando no es su valor.
--
-- Elu: "Venta de GIFT CARD a DUENOS (40% de descuento). Al cargarla obviamente
-- me pregunta importe a favor de la gift card y como paga. En el caso de ellos
-- al pagar con un dto. no coincide lo que pagan con lo que tienen a favor.
-- como se hace en ese caso?".
--
-- Hasta ahora era imposible: `importe` era a la vez el saldo que carga la
-- tarjeta y la plata que entra a caja, asi que una tarjeta de $100.000 vendida
-- a $60.000 solo se podia cargar mintiendo en una de las dos puntas.
--
-- Va nullable y no se backfillea: null significa "se cobro el importe", que es
-- lo que paso en todas las vendidas hasta hoy. Ponerlo en NOT NULL DEFAULT
-- importe obligaria a mantener dos numeros sincronizados para el caso normal,
-- que es el 99%.
ALTER TABLE gift_cards
  ADD COLUMN IF NOT EXISTS cobrado double precision;
