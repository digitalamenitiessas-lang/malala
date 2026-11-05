-- Conteos de stock.
--
-- Yerba Buena, 04/11/2026: "un reporte para comparar con el conteo físico y
-- ajustar". Hasta ahora un conteo se cargaba producto por producto con Ajuste
-- manual → "Fijar stock en", y no quedaba en ningún lado quién contó, cuándo ni
-- cuánto dio la diferencia.
--
-- Un conteo se carga de una vez para muchos productos. Por cada uno queda lo
-- que decía el sistema en el momento del conteo, lo contado y el costo
-- unitario de ese día. El stock se corrige con movimientos ajuste_manual con
-- ref_tipo 'conteo' y ref_id = el conteo, así el reporte los separa como
-- "diferencias de conteo".
--
-- fecha es cuándo se contó, no cuándo se cargó: el sistema se compara contra lo
-- que había a esa hora (ver src/lib/stock-control.ts).
create table if not exists conteos_stock (
  id text primary key,
  sucursal_id text not null references sucursales(id),
  fecha timestamptz not null,
  cargado_en timestamptz not null default now(),
  usuario_id uuid not null references profiles(user_id),
  contado_por text,
  nota text
);
create index if not exists conteos_stock_sucursal_fecha_idx
  on conteos_stock (sucursal_id, fecha desc);

-- En unidad base del insumo, como stock_sucursal. Los *_deposito sólo en
-- reventa; en bacha quedan null.
create table if not exists conteo_stock_items (
  id text primary key,
  conteo_id text not null references conteos_stock(id) on delete cascade,
  insumo_id text not null references insumos(id),
  sistema double precision not null,
  contado double precision not null,
  sistema_deposito double precision,
  contado_deposito double precision,
  costo_unitario double precision
);
create index if not exists conteo_stock_items_conteo_idx
  on conteo_stock_items (conteo_id);
