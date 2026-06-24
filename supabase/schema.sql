-- =====================================================================
-- Despacho RTB · Esquema Supabase para el optimizador de rutas
-- Ejecútalo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

create extension if not exists pgcrypto;   -- para gen_random_uuid()

-- ---------------------------------------------------------------------
-- puntos: almacén (depósito) y clientes de entrega / recolección
-- ---------------------------------------------------------------------
create table if not exists public.puntos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  tipo       text not null check (tipo in ('deposito','entrega','recoleccion')),
  lat        double precision,
  lng        double precision,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- recorridos: cada recorrido es una unidad re-evaluable.
-- Las paradas van en JSONB:
--   stops = [{ "point": "<uuid del punto>", "legMin": 14, "legKm": 6.2, "waitMin": 5 }, ...]
-- (legMin / legKm son null en la primera parada)
-- ---------------------------------------------------------------------
create table if not exists public.recorridos (
  id         uuid primary key default gen_random_uuid(),
  fecha      date   not null,
  ts         bigint not null,          -- epoch ms (mediodía de 'fecha'); lo usa el cálculo por día de la semana
  stops      jsonb  not null,
  created_at timestamptz not null default now()
);

create index if not exists recorridos_ts_idx    on public.recorridos (ts);
create index if not exists recorridos_fecha_idx on public.recorridos (fecha);

-- ---------------------------------------------------------------------
-- Row Level Security (puntos y recorridos: datos compartidos de empresa)
-- ---------------------------------------------------------------------
alter table public.puntos     enable row level security;
alter table public.recorridos enable row level security;

create policy "puntos: acceso total autenticados"
  on public.puntos for all
  to authenticated
  using (true) with check (true);

create policy "recorridos: acceso total autenticados"
  on public.recorridos for all
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- profiles: rol de cada usuario (admin / driver)
-- Se crea manualmente desde Supabase Dashboard → Authentication → Users,
-- luego se inserta la fila de profile en SQL Editor:
--   insert into public.profiles (user_id, nombre, role)
--   values ('<uuid>', 'Nombre', 'admin');   -- o 'driver'
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null,
  role       text not null default 'driver' check (role in ('admin','driver')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Todos los autenticados pueden leer perfiles (nombres para el monitor y selector de asignación)
create policy "profiles: lectura autenticados"
  on public.profiles for select to authenticated using (true);

-- Helper SECURITY DEFINER: evita recursión de RLS al consultar is_admin() desde otras policies
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------
-- rutas_guardadas: planes de ruta diseñados con antelación.
-- assigned_to: chofer asignado (null = sin asignar, cualquier driver puede cargarla).
-- Driver ve solo las que le asignaron (o las sin asignar); admin ve todas.
-- Solo el admin puede crear / editar / borrar / asignar.
-- stops = [{id, name}] en orden; stops[0] = punto de inicio/almacén.
-- ---------------------------------------------------------------------
create table if not exists public.rutas_guardadas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  fecha       date,
  closed      boolean not null default true,
  stops       jsonb not null,
  assigned_to uuid references auth.users(id),  -- chofer asignado (null = sin asignar)
  created_at  timestamptz not null default now()
);

alter table public.rutas_guardadas enable row level security;

-- Driver ve las rutas asignadas a él o sin asignar; admin ve todas
create policy "rutas_guardadas: lectura"
  on public.rutas_guardadas for select to authenticated
  using (public.is_admin() or assigned_to = auth.uid() or assigned_to is null);

-- Solo el admin crea, edita y borra
create policy "rutas_guardadas: gestion admin"
  on public.rutas_guardadas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- ruta_activa: progreso en curso de la ruta del día, por chofer.
-- Una fila por chofer activo (driver_id = PK). Se borra al terminar la
-- ruta; driver ve/escribe solo la suya; admin ve todas y puede borrar
-- cualquiera (desbloqueo remoto).
-- state = objeto rutaDia serializado (mismo shape que el estado React).
-- ---------------------------------------------------------------------
create table if not exists public.ruta_activa (
  driver_id     uuid primary key references auth.users(id) on delete cascade,
  driver_nombre text,                -- denormalizado para mostrar en el monitor sin JOIN
  state         jsonb not null,
  updated_at    timestamptz not null default now()
);

alter table public.ruta_activa enable row level security;

create policy "ruta_activa: lectura"
  on public.ruta_activa for select to authenticated
  using (driver_id = auth.uid() or public.is_admin());

create policy "ruta_activa: insert propia"
  on public.ruta_activa for insert to authenticated
  with check (driver_id = auth.uid());

create policy "ruta_activa: update propia o admin"
  on public.ruta_activa for update to authenticated
  using  (driver_id = auth.uid() or public.is_admin())
  with check (driver_id = auth.uid() or public.is_admin());

create policy "ruta_activa: delete propia o admin"
  on public.ruta_activa for delete to authenticated
  using (driver_id = auth.uid() or public.is_admin());

-- Realtime: notificaciones en vivo cuando cualquier ruta activa cambia
alter publication supabase_realtime add table public.ruta_activa;
