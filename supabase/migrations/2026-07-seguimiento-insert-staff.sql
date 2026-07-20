-- =====================================================================
-- Fix: el despacho (admin/supervisor) no podía enviar mensajes ni editar
-- el plan de pendientes de la ruta de OTRO chofer.
-- Ejecútalo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Causa: merge_ruta_activa (ver 2026-07-seguimiento-ruta.sql) guarda con
-- `INSERT ... ON CONFLICT (driver_id) DO UPDATE`. Postgres evalúa la
-- política de INSERT (WITH CHECK) sobre la fila propuesta aunque el
-- resultado sea un UPDATE de una fila ya existente. La política de
-- INSERT de ruta_activa solo permitía `driver_id = auth.uid()` (sin
-- excepción para staff), así que:
--   - El chofer escribiendo su propia fila: pasa (driver_id = auth.uid()).
--   - El despacho escribiendo la fila de OTRO chofer (mensaje, agregar/
--     quitar/reordenar parada): RLS lo rechaza en silencio.
-- Las políticas de UPDATE y DELETE ya tenían la excepción `is_staff()`;
-- solo faltaba en INSERT.
--
-- No amplía de forma significativa lo que el staff ya podía hacer: ya
-- tenía UPDATE/DELETE sobre cualquier fila. Esto solo cubre el camino
-- INSERT del ON CONFLICT.
-- =====================================================================

drop policy if exists "ruta_activa: insert propia" on public.ruta_activa;
drop policy if exists "ruta_activa: insert propia o staff" on public.ruta_activa;
create policy "ruta_activa: insert propia o staff"
  on public.ruta_activa for insert to authenticated
  with check (driver_id = auth.uid() or public.is_staff());
