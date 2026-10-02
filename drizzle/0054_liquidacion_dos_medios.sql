-- Pagar una liquidacion con dos medios (parte efectivo, parte transferencia).
--
-- Es como pagan de verdad: la caja no siempre tiene todo el sueldo en efectivo.
-- Hasta ahora el pago aceptaba un solo medio, asi que o se partia a mano en dos
-- gastos sueltos —que quedan desenganchados de la liquidacion y no se revierten
-- si se anula— o se cargaba todo con un medio y el arqueo quedaba mal.
--
-- La tabla de egresos ya tenia mp2_id/valor2 y createEgreso ya emitia un
-- movimiento por medio; esto es extender eso a la liquidacion, no inventar
-- nada nuevo.
ALTER TABLE liquidaciones
  ADD COLUMN IF NOT EXISTS mp2_id text REFERENCES medios_pago(id),
  ADD COLUMN IF NOT EXISTS valor2 double precision;

-- Retiro de socios para Centro.
--
-- El rubro existia solo en Yerba Buena, asi que en Centro no habia donde cargar
-- lo que se llevan los duenos. Grupo 6: un retiro no es un costo de operar el
-- salon, es reparto de ganancia, y mezclarlo hace que el salon se vea mas caro
-- de lo que es (ver src/lib/grupos-gasto.ts).
--
-- Idempotente: si ya esta vinculado a la sucursal no hace nada.
with existente as (
  select id from rubros_gasto where lower(trim(rubro)) = 'retiro socios' limit 1
), creado as (
  insert into rubros_gasto (id, rubro, subrubro, activo, grupo)
  select gen_random_uuid()::text, 'retiro socios', null, true, 6
   where not exists (select 1 from existente)
  returning id
), rubro as (
  select id from existente union all select id from creado
)
insert into rubro_sucursal (id, rubro_id, sucursal_id)
select gen_random_uuid()::text, r.id, s.id
  from rubro r cross join sucursales s
 where s.activo
   and not exists (
     select 1 from rubro_sucursal rs
      where rs.rubro_id = r.id and rs.sucursal_id = s.id
   );
