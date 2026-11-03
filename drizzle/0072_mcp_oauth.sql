-- Conexión del sistema con la IA de cada usuario (Claude, ChatGPT) por MCP.
--
-- Isaías, Lu y Elu le pedían a Luciano "conectar el sistema con su IA". Con
-- esto cada uno agrega malala.com.ar/api/mcp como conector, entra con su
-- usuario de MALALA y la IA consulta con SUS permisos. Solo lectura.
--
-- Es un servidor OAuth 2.1 mínimo (registro dinámico de clientes + PKCE):
--   oauth_clientes  la app que se registró (Claude, ChatGPT...)
--   oauth_codigos   el código de un solo uso que sale de la pantalla "Permitir"
--   oauth_tokens    una fila por conexión: access + refresh, guardados como hash
--   mcp_registro    cada consulta que hizo la IA, para saber quién vio qué
--
-- Cortar una conexión es poner revocado_en: el token deja de valer al toque.

create table if not exists oauth_clientes (
  id text primary key,
  nombre text not null,
  redirect_uris jsonb not null,
  secreto_hash text,
  creado_en timestamptz not null default now()
);

create table if not exists oauth_codigos (
  codigo_hash text primary key,
  cliente_id text not null references oauth_clientes(id) on delete cascade,
  usuario_id uuid not null references profiles(user_id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  expira_en timestamptz not null,
  usado_en timestamptz,
  creado_en timestamptz not null default now()
);

create table if not exists oauth_tokens (
  id text primary key,
  cliente_id text not null references oauth_clientes(id) on delete cascade,
  usuario_id uuid not null references profiles(user_id) on delete cascade,
  access_hash text not null unique,
  access_expira_en timestamptz not null,
  refresh_hash text not null unique,
  refresh_expira_en timestamptz not null,
  creado_en timestamptz not null default now(),
  ultimo_uso_en timestamptz,
  revocado_en timestamptz
);

create index if not exists oauth_tokens_usuario_idx on oauth_tokens (usuario_id);

create table if not exists mcp_registro (
  id text primary key,
  token_id text references oauth_tokens(id) on delete set null,
  usuario_id uuid not null references profiles(user_id) on delete cascade,
  herramienta text not null,
  argumentos jsonb,
  sucursal_id text,
  ok boolean not null,
  error text,
  duracion_ms integer,
  creado_en timestamptz not null default now()
);

create index if not exists mcp_registro_usuario_fecha_idx on mcp_registro (usuario_id, creado_en desc);
