-- =====================================================================
-- Endurecer permisos de puntos y recorridos · parche sobre el schema.sql
-- Ejecútalo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Qué hace:
--  Hoy `puntos` y `recorridos` usan "for all ... using(true)": cualquier
--  autenticado (incluido un chofer, vía API directa) puede leer, crear,
--  editar y borrar TODOS los puntos y recorridos de la empresa. Se cierra
--  igual que ya está `rutas_guardadas`: lectura abierta, escritura solo
--  staff (admin/supervisor) — excepto la propia alta de un recorrido, que
--  el chofer necesita para guardar la ruta que acaba de terminar (Ruta
--  del día → onSaveRuta → addRecorrido, src/App.jsx).
--
-- No afecta a `profiles`, `rutas_guardadas` ni `ruta_activa`: esas ya
-- están correctamente cerradas por rol.
-- =====================================================================

-- ---------------------------------------------------------------------
-- puntos: lectura abierta a todo autenticado; alta/edición/borrado solo staff
-- ---------------------------------------------------------------------
drop policy if exists "puntos: acceso total autenticados" on public.puntos;
drop policy if exists "puntos: lectura autenticados" on public.puntos;
drop policy if exists "puntos: gestion staff" on public.puntos;

create policy "puntos: lectura autenticados"
  on public.puntos for select to authenticated using (true);

create policy "puntos: gestion staff"
  on public.puntos for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- recorridos: lectura abierta; alta = el propio chofer o staff;
-- edición/borrado solo staff (un chofer no puede alterar ni borrar el
-- historial, ni el suyo ni el de otros, una vez guardado).
-- ---------------------------------------------------------------------
drop policy if exists "recorridos: acceso total autenticados" on public.recorridos;
drop policy if exists "recorridos: lectura autenticados" on public.recorridos;
drop policy if exists "recorridos: insert propio o staff" on public.recorridos;
drop policy if exists "recorridos: update staff" on public.recorridos;
drop policy if exists "recorridos: delete staff" on public.recorridos;

create policy "recorridos: lectura autenticados"
  on public.recorridos for select to authenticated using (true);

create policy "recorridos: insert propio o staff"
  on public.recorridos for insert to authenticated
  with check (driver_id = auth.uid() or public.is_staff());

create policy "recorridos: update staff"
  on public.recorridos for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "recorridos: delete staff"
  on public.recorridos for delete to authenticated
  using (public.is_staff());
