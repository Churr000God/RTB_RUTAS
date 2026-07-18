-- =====================================================================
-- Módulo de Generación y Carga de Rutas · parche sobre el schema.sql
-- Ejecútalo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
-- =====================================================================

-- rutas_guardadas: hora de salida planeada (opcional). Viaja con la ruta
-- asignada hasta el chofer para calcular su ETA por parada.
alter table public.rutas_guardadas
  add column if not exists hora_inicio time;
