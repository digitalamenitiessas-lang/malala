-- De donde salio cada gift card.
--
-- Habia un solo booleano, emitida_pre_sistema, que en realidad mezclaba dos
-- cosas: "no entro plata al emitirla" (lo mecanico) y "esa plata ya se cobro
-- antes del sistema" (el motivo). Mientras el unico caso sin cobro eran las
-- tarjetas viejas daba igual, pero el salon tambien regala tarjetas: ahi
-- tampoco entra plata, y el motivo es el contrario — esa plata no entro nunca y
-- no va a entrar, la absorbe el negocio.
--
-- Usar el booleano para las dos cosas hacia que la pantalla afirmara algo
-- falso: al elegir una cortesia para cobrar decia "su venta ya se conto como
-- facturacion". Eso no se descubre el dia que pasa, se descubre meses despues
-- cuando alguien cuadra numeros creyendo esa frase.
--
--   venta        se cobro al emitirla (el caso normal)
--   pre_sistema  se vendio antes de usar el sistema; esa plata ya entro
--   cortesia     la regala el salon; no entra plata nunca
--
-- emitida_pre_sistema queda y se sigue escribiendo, derivado de origen, para no
-- romper el deploy anterior mientras sale el nuevo. Nadie mas lo lee.
ALTER TABLE gift_cards
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'venta';

UPDATE gift_cards SET origen = 'pre_sistema'
 WHERE emitida_pre_sistema AND origen = 'venta';
