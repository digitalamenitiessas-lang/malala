-- Prende RLS en `viaticos`, que quedó afuera.
--
-- QUÉ PASABA: la tabla se creó en 0032_viaticos.sql y ahí me olvidé de
-- prender RLS. Supabase la reportó como "Table publicly accessible" el
-- 13-09-2026. Es el mismo agujero que cerró 0029 para otras 14 tablas: sin
-- RLS, la tabla conserva el grant por defecto de Supabase al rol `anon`, y
-- `anon` usa la anon key, que viaja en el bundle del navegador.
--
-- O sea que cualquiera con la URL del proyecto podía leer cuánto viático
-- cobra cada empleada y qué días trabajó, y además insertar y borrar filas
-- —que es peor, porque los viáticos entran en la liquidación del sueldo.
--
-- POR QUÉ ALCANZA CON PRENDER RLS, SIN POLÍTICAS: con RLS activo y cero
-- políticas, postgres deniega todo a cualquier rol que no tenga BYPASSRLS.
-- La app se conecta como `postgres` (rolbypassrls = true), así que no la
-- afecta: sólo corta el acceso por PostgREST con la clave pública. Es el
-- mismo criterio que las otras 21 tablas de la operación.

alter table viaticos enable row level security;
