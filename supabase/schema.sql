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
  direccion  text,                     -- opcional; manual o geocodificación inversa
  created_at timestamptz not null default now()
);

-- Candado de nombre duplicado (case/espacios-insensible). Antes de aplicarlo en una
-- base con datos, revisar que no existan ya duplicados:
--   select lower(btrim(nombre)) as clave, count(*)
--   from public.puntos group by 1 having count(*) > 1;
create unique index if not exists puntos_nombre_unico
  on public.puntos (lower(btrim(nombre)));

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
  driver_id  uuid references auth.users(id),  -- chofer que ejecutó la ruta (null = histórico previo a este módulo)
  edit_log   jsonb  not null default '[]',     -- registro de ediciones del despacho durante la ruta (ver merge_ruta_activa)
  created_at timestamptz not null default now()
);

create index if not exists recorridos_ts_idx        on public.recorridos (ts);
create index if not exists recorridos_fecha_idx     on public.recorridos (fecha);
create index if not exists recorridos_driver_id_idx on public.recorridos (driver_id);

-- Row Level Security de puntos y recorridos: se habilita más abajo, junto
-- a sus políticas, DESPUÉS de definir public.is_staff() (evita crear una
-- política que referencia una función que aún no existe en una
-- instalación nueva corrida de arriba a abajo). Ver esa sección.

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
-- Row Level Security (puntos y recorridos: datos compartidos de empresa)
-- Lectura abierta a todo autenticado; escritura restringida por rol. Un
-- chofer solo puede insertar SU PROPIO recorrido (al terminar su ruta);
-- no puede editar ni borrar puntos ni recorridos, ni tocar los de otro
-- chofer. (Ver supabase/migrations/2026-07-permisos-puntos-recorridos.sql
-- para aplicar este cambio sobre una base ya existente.)
-- ---------------------------------------------------------------------
alter table public.puntos     enable row level security;
alter table public.recorridos enable row level security;

create policy "puntos: lectura autenticados"
  on public.puntos for select to authenticated using (true);

create policy "puntos: gestion staff"
  on public.puntos for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

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
  hora_inicio time,                             -- hora de salida planeada (opcional)
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

create policy "ruta_activa: insert propia o staff"
  on public.ruta_activa for insert to authenticated
  with check (driver_id = auth.uid() or public.is_staff());
-- Necesaria porque merge_ruta_activa (más abajo) guarda con
-- INSERT ... ON CONFLICT DO UPDATE: Postgres evalúa el WITH CHECK de
-- INSERT aunque el resultado final sea un UPDATE de fila existente. Sin
-- esta excepción para staff, el despacho (admin/supervisor) no puede
-- escribir en la fila de otro chofer (mensajes, plan de pendientes) aun
-- teniendo permiso de UPDATE — ver supabase/migrations/2026-07-
-- seguimiento-insert-staff.sql.

create policy "ruta_activa: update propia o staff"
  on public.ruta_activa for update to authenticated
  using  (driver_id = auth.uid() or public.is_staff())
  with check (driver_id = auth.uid() or public.is_staff());

create policy "ruta_activa: delete propia o staff"
  on public.ruta_activa for delete to authenticated
  using (driver_id = auth.uid() or public.is_staff());

-- Realtime: notificaciones en vivo cuando cualquier ruta activa cambia
alter publication supabase_realtime add table public.ruta_activa;

-- ---------------------------------------------------------------------
-- merge_ruta_activa: fusión atómica del estado de ruta_activa cuando el
-- chofer y el despacho pueden estar guardando cambios casi al mismo
-- tiempo. El state se divide en tres grupos, cada uno con su propio
-- sello de escritura (Date.now() del último cambio a ESE grupo):
--   _wDriver   → route, phase, nextStop, nextLegKm, done, horaInicio,
--                noticeAckAt        (dueño: el CHOFER)
--   _wPlan     → remaining                            (dueño: el DESPACHO)
--   _wDispatch → notes, notice, editLog                (dueño: el DESPACHO)
-- El sello legado `_w` se conserva como el máximo de los tres.
--
-- Esta MISMA lógica vive también en JS puro, en src/lib/rutaActivaMerge.js
-- (mergeRutaActiva), usada para fusionar lecturas (realtime, caché
-- offline). Si se cambia una, cambiar la otra.
-- ---------------------------------------------------------------------
create or replace function public._stamp_of(state jsonb, key text)
returns numeric
language sql immutable as $$
  select coalesce(
    (state -> key)::text::numeric,
    (state -> '_w')::text::numeric,
    -1
  );
$$;

-- Une dos listas append-only (notas, registro de ediciones) por "id",
-- sin duplicar, ordenadas por "at". Un elemento sin "id" usa su JSON
-- completo como clave (nunca se descarta silenciosamente).
create or replace function public._merge_json_list(a jsonb, b jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  item jsonb;
  key text;
  ids text[] := '{}';
  acc jsonb := '[]'::jsonb;
begin
  for item in select * from jsonb_array_elements(coalesce(a, '[]'::jsonb)) loop
    key := coalesce(item ->> 'id', item::text);
    if not (key = any(ids)) then
      ids := ids || key;
      acc := acc || jsonb_build_array(item);
    end if;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(b, '[]'::jsonb)) loop
    key := coalesce(item ->> 'id', item::text);
    if not (key = any(ids)) then
      ids := ids || key;
      acc := acc || jsonb_build_array(item);
    end if;
  end loop;
  return coalesce(
    (select jsonb_agg(elem order by coalesce((elem ->> 'at')::numeric, 0))
     from jsonb_array_elements(acc) elem),
    '[]'::jsonb
  );
end;
$$;

-- merge_ruta_activa: lee la fila actual CON BLOQUEO, fusiona el estado
-- entrante por grupo de campos, y escribe el resultado. `security
-- invoker`: corre con los permisos del usuario que llama (respeta las
-- políticas RLS de ruta_activa tal cual están arriba).
create or replace function public.merge_ruta_activa(
  p_driver uuid,
  p_driver_nombre text,
  p_incoming jsonb
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  base jsonb;
  merged jsonb;
  driver_wins boolean;
  plan_wins boolean;
  dispatch_wins boolean;
begin
  select state into base from public.ruta_activa where driver_id = p_driver for update;

  if base is null then
    merged := p_incoming;
  else
    driver_wins   := public._stamp_of(p_incoming, '_wDriver')   > public._stamp_of(base, '_wDriver');
    plan_wins     := public._stamp_of(p_incoming, '_wPlan')     > public._stamp_of(base, '_wPlan');
    dispatch_wins := public._stamp_of(p_incoming, '_wDispatch') > public._stamp_of(base, '_wDispatch');

    merged := jsonb_build_object(
      'title',        coalesce(base -> 'title', p_incoming -> 'title'),
      'closed',       coalesce(base -> 'closed', p_incoming -> 'closed'),
      'startId',      coalesce(base -> 'startId', p_incoming -> 'startId'),
      'startName',    coalesce(base -> 'startName', p_incoming -> 'startName'),
      'endId',        coalesce(base -> 'endId', p_incoming -> 'endId'),
      'driverNombre', coalesce(p_incoming -> 'driverNombre', base -> 'driverNombre'),

      'route',        case when driver_wins then p_incoming -> 'route' else base -> 'route' end,
      'phase',        case when driver_wins then p_incoming -> 'phase' else base -> 'phase' end,
      'nextStop',     case when driver_wins then p_incoming -> 'nextStop' else base -> 'nextStop' end,
      'nextLegKm',    case when driver_wins then p_incoming -> 'nextLegKm' else base -> 'nextLegKm' end,
      'done',         case when driver_wins then p_incoming -> 'done' else base -> 'done' end,
      'horaInicio',   case when driver_wins then p_incoming -> 'horaInicio' else base -> 'horaInicio' end,
      'noticeAckAt',  case when driver_wins then p_incoming -> 'noticeAckAt' else base -> 'noticeAckAt' end,

      'remaining',    coalesce(case when plan_wins then p_incoming -> 'remaining' else base -> 'remaining' end, '[]'::jsonb),

      'notes',        public._merge_json_list(base -> 'notes', p_incoming -> 'notes'),
      'notice',       case when dispatch_wins then p_incoming -> 'notice' else base -> 'notice' end,
      'editLog',      public._merge_json_list(base -> 'editLog', p_incoming -> 'editLog'),

      '_wDriver',   greatest(public._stamp_of(base, '_wDriver'), public._stamp_of(p_incoming, '_wDriver')),
      '_wPlan',     greatest(public._stamp_of(base, '_wPlan'), public._stamp_of(p_incoming, '_wPlan')),
      '_wDispatch', greatest(public._stamp_of(base, '_wDispatch'), public._stamp_of(p_incoming, '_wDispatch'))
    );
    merged := merged || jsonb_build_object(
      '_w', greatest(
        (merged ->> '_wDriver')::numeric,
        (merged ->> '_wPlan')::numeric,
        (merged ->> '_wDispatch')::numeric
      )
    );
  end if;

  insert into public.ruta_activa (driver_id, driver_nombre, state, updated_at)
  values (p_driver, p_driver_nombre, merged, now())
  on conflict (driver_id) do update
    set driver_nombre = excluded.driver_nombre,
        state = excluded.state,
        updated_at = excluded.updated_at;

  return merged;
end;
$$;

grant execute on function public.merge_ruta_activa(uuid, text, jsonb) to authenticated;
