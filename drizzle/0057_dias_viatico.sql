-- Que dias le corresponde viatico a cada empleada.
--
-- Elu: "quiero cargar UNA SOLA VEZ los viaticos y que se repliquen
-- semanalmente. Siempre son los mismos con algunas excepciones. Lo ideal seria
-- cargarlos como las franjas horarias y eventualmente ajustar. Hoy el sistema
-- me pide cargar todas las semanas lo mismo y es una x una. No nos suma en
-- tiempo."
--
-- Los dias de viatico NO son los dias de trabajo: hay chicas que trabajan cinco
-- dias y cobran viatico dos, segun como se mueven. Por eso va su propia
-- columna y no se deduce de dias_trabajo.
--
-- El monto reusa viatico_por_dia, que ya existia con esta intencion exacta y
-- hoy esta en cero para todo el mundo: no hay dato que migrar, y dejar dos
-- campos de monto al lado es como se llega a que nadie sepa cual manda.
ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS dias_viatico jsonb NOT NULL DEFAULT '[]'::jsonb;
