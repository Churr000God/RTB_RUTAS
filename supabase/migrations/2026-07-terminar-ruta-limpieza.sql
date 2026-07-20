-- =====================================================================
-- Terminar ruta: borrar la plantilla de origen + guardar el nombre de la ruta
-- Ejecútalo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Qué hace:
--  1) Añade `recorridos.nombre_ruta` — hasta ahora un recorrido terminado
--     no guardaba el nombre de la ruta (rutas_guardadas.nombre) que lo
--     originó, así que Evaluación/Análisis de ahorro solo mostraban chofer
--     + fecha. Se llena con `rutaDia.title` al terminar (ver
--     src/components/rutadia/RutaDiaTab.jsx → saveRoute).
--  2) Permite que un chofer borre su PROPIA `rutas_guardadas` (la que tiene
--     assigned_to = su propio id) — hoy solo staff podía borrar filas de
--     esa tabla. Es necesaria porque, al terminar la ruta, la plantilla que
--     la originó se borra automáticamente (es de un solo uso; ver
--     App.jsx → onLoadRutaDia/rutaGuardadaId y RutaDiaTab.jsx → saveRoute).
--     Una plantilla "sin asignar" (assigned_to null) NO puede borrarla un
--     chofer con esta política — solo staff gestiona esas.
-- =====================================================================

alter table public.recorridos
  add column if not exists nombre_ruta text;

drop policy if exists "rutas_guardadas: delete propia asignada" on public.rutas_guardadas;
create policy "rutas_guardadas: delete propia asignada"
  on public.rutas_guardadas for delete to authenticated
  using (assigned_to = auth.uid());
