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
-- profiles: rol de cada usuario (admin / supervisor / driver).
-- Las cuentas se crean desde la app (Usuarios → Nuevo usuario), vía la
-- Edge Function admin-crear-usuario (invitación por correo + insert con
-- service_role). No hay alta manual ni auto-alta en el primer login.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null,
  email      text,   -- denormalizado desde auth.users al crear la cuenta; usado para resetear contraseña
  role       text not null default 'driver' check (role in ('admin','supervisor','driver')),
  disabled   boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Todos los autenticados pueden leer perfiles (nombres para el monitor y selector de asignación)
create policy "profiles: lectura autenticados"
  on public.profiles for select to authenticated using (true);

-- Cada usuario puede actualizar su propia fila (nombre). El cambio de
-- rol de la propia fila lo bloquea el trigger impedir_cambio_de_rol.
create policy "profiles: update propio"
  on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- El admin puede actualizar cualquier perfil (nombre, rol, disabled)
create policy "profiles: update admin"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Sin política INSERT/DELETE: las cuentas nacen y se borran solo vía
-- Edge Function con service_role (que ignora RLS).

-- Helper SECURITY DEFINER: evita recursión de RLS al consultar is_admin() desde otras policies
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;

-- Helper SECURITY DEFINER: admin o supervisor (personal operativo, no chofer)
create or replace function public.is_staff()
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.profiles where user_id = auth.uid() and role in ('admin','supervisor'));
$$;

-- Trigger anti-escalada de privilegios: nadie salvo un admin puede cambiar
-- el rol de una fila de profiles, y ni siquiera un admin puede cambiar el
-- rol del superadmin (candado a nivel DB, no solo cosmético en la UI).
create or replace function public.impedir_cambio_de_rol()
returns trigger language plpgsql security definer as $$
begin
  if old.user_id = '5ecb861d-7d41-4d01-a916-72eb1c2b1817'
     and new.role is distinct from old.role then
    raise exception 'No se puede cambiar el rol del superadmin';
  end if;
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Solo un admin puede cambiar roles';
  end if;
  return new;
end;
$$;

create trigger trg_impedir_cambio_de_rol
  before update on public.profiles
  for each row execute function public.impedir_cambio_de_rol();

-- ---------------------------------------------------------------------
-- rutas_guardadas: planes de ruta diseñados con antelación.
-- assigned_to: chofer asignado (null = sin asignar, cualquier driver puede cargarla).
-- Driver ve solo las que le asignaron (o las sin asignar); admin y supervisor ven todas.
-- Solo admin/supervisor pueden crear / editar / borrar / asignar.
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

-- Driver ve las rutas asignadas a él o sin asignar; admin/supervisor ven todas
create policy "rutas_guardadas: lectura"
  on public.rutas_guardadas for select to authenticated
  using (public.is_staff() or assigned_to = auth.uid() or assigned_to is null);

-- Solo admin/supervisor crean, editan y borran
create policy "rutas_guardadas: gestion staff"
  on public.rutas_guardadas for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- ruta_activa: progreso en curso de la ruta del día, por chofer.
-- Una fila por chofer activo (driver_id = PK). Se borra al terminar la
-- ruta; driver ve/escribe solo la suya; admin/supervisor ven todas y
-- pueden borrar cualquiera (desbloqueo remoto).
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
  using (driver_id = auth.uid() or public.is_staff());

create policy "ruta_activa: insert propia"
  on public.ruta_activa for insert to authenticated
  with check (driver_id = auth.uid());

create policy "ruta_activa: update propia o staff"
  on public.ruta_activa for update to authenticated
  using  (driver_id = auth.uid() or public.is_staff())
  with check (driver_id = auth.uid() or public.is_staff());

create policy "ruta_activa: delete propia o staff"
  on public.ruta_activa for delete to authenticated
  using (driver_id = auth.uid() or public.is_staff());

-- Realtime: notificaciones en vivo cuando cualquier ruta activa cambia
alter publication supabase_realtime add table public.ruta_activa;
