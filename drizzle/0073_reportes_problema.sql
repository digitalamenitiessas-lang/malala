-- Problemas que reporta la IA conectada por MCP cuando no puede resolver algo.
--
-- En vez de un audio con una captura a Luciano, la IA deja el problema armado:
-- quién, qué sucursal, de qué día, qué pasó y qué ya revisó. Llega por push a
-- los mails de MALALA_REPORTES_EMAILS y se ve en "Conectar con IA".
-- Es la única escritura del MCP y no toca datos del salón.

create table if not exists reportes_problema (
  id text primary key,
  usuario_id uuid not null references profiles(user_id) on delete cascade,
  sucursal_id text not null references sucursales(id),
  fecha_problema date,
  resumen text not null,
  detalle text not null,
  revisado text,
  estado text not null default 'abierto',
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  resuelto_por uuid references profiles(user_id)
);

create index if not exists reportes_problema_estado_fecha_idx on reportes_problema (estado, creado_en desc);
