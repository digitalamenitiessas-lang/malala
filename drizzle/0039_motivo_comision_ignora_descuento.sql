-- Deja el criterio de comisión definido en el motivo de descuento.
--
-- El caso que lo originó: se atendió a una influencer sin cargo, se cargó la
-- venta con 100% de descuento y motivo "Publicidad / Sin cargo", y la comisión
-- de la chica quedó en cero. Correcto según la regla general -la comisión sale
-- de lo que se cobró, y no se cobró nada- pero no es lo que el salón quiere:
-- ahí el descuento lo pone el local y la chica igual trabajó.
--
-- Se marca en el motivo, una vez, en vez de pedirlo ticket por ticket: si
-- dependiera de que alguien se acuerde, alcanza con un olvido para que esa
-- comisión salga distinta a todas las demás y recién se note al liquidar.
-- Para la venta puntual que no encaja en ningún motivo sigue estando el control
-- del ticket.

alter table motivos_descuento
  add column if not exists comision_ignora_descuento boolean not null default false;

-- Publicidad / canje: el servicio se regala por decisión del negocio.
update motivos_descuento
set comision_ignora_descuento = true
where nombre ilike '%publicidad%';
