-- =====================================================================
-- Módulo de Evaluación / Medición de Rutas
-- Ejecútalo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Qué hace:
--  1) Añade `puntos.direccion` (texto libre, opcional) — se llena a mano o
--     por geocodificación inversa desde el mapa, y alimenta el desglose
--     por punto del reporte de evaluación.
--  2) Añade `recorridos.driver_id` (referencia a profiles.user_id) — hasta
--     ahora un recorrido terminado NO guardaba qué chofer lo ejecutó (esa
--     identidad solo vivía en `ruta_activa`, que se borra al terminar la
--     ruta). Sin esta columna las vistas "por usuario" no son posibles.
--     Los recorridos ya guardados quedan con driver_id = null (no es
--     recuperable) y se agrupan como "Sin asignar" en la vista por usuario.
--
-- No cambia ningún permiso: puntos/recorridos ya son visibles para todo
-- el staff (admin/supervisor) bajo las políticas RLS existentes.
-- =====================================================================

alter table public.puntos
  add column if not exists direccion text;

alter table public.recorridos
  add column if not exists driver_id uuid references auth.users(id);

create index if not exists recorridos_driver_id_idx on public.recorridos (driver_id);
