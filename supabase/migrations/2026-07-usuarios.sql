-- =====================================================================
-- Módulo de Gestión de Usuarios · parche sobre el schema.sql ya aplicado
-- Ejecútalo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) profiles: tercer rol 'supervisor' + columna 'disabled'
-- ---------------------------------------------------------------------

-- Elimina el CHECK viejo del rol sea cual sea su nombre real (evita
-- depender del nombre autogenerado por Postgres).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','supervisor','driver'));

alter table public.profiles
  add column if not exists disabled boolean not null default false;

alter table public.profiles
  add column if not exists email text;

-- Rellena el email de las cuentas ya existentes (denormalizado desde auth.users;
-- las cuentas nuevas lo reciben directo desde admin-crear-usuario).
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.user_id and p.email is null;

-- ---------------------------------------------------------------------
-- 2) Helpers de rol
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_staff()
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.profiles where user_id = auth.uid() and role in ('admin','supervisor'));
$$;

-- ---------------------------------------------------------------------
-- 3) Trigger anti-escalada de rol + protección del superadmin
-- ---------------------------------------------------------------------
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

drop trigger if exists trg_impedir_cambio_de_rol on public.profiles;
create trigger trg_impedir_cambio_de_rol
  before update on public.profiles
  for each row execute function public.impedir_cambio_de_rol();

-- ---------------------------------------------------------------------
-- 4) Políticas RLS de profiles: se formaliza UPDATE (antes solo SELECT)
-- ---------------------------------------------------------------------
drop policy if exists "profiles: update propio" on public.profiles;
create policy "profiles: update propio"
  on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "profiles: update admin" on public.profiles;
create policy "profiles: update admin"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 5) rutas_guardadas y ruta_activa: is_admin() → is_staff() (supervisor
--    entra al mismo nivel de gestión que el admin en estas dos tablas)
-- ---------------------------------------------------------------------
drop policy if exists "rutas_guardadas: lectura" on public.rutas_guardadas;
create policy "rutas_guardadas: lectura"
  on public.rutas_guardadas for select to authenticated
  using (public.is_staff() or assigned_to = auth.uid() or assigned_to is null);

drop policy if exists "rutas_guardadas: gestion admin" on public.rutas_guardadas;
drop policy if exists "rutas_guardadas: gestion staff" on public.rutas_guardadas;
create policy "rutas_guardadas: gestion staff"
  on public.rutas_guardadas for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists "ruta_activa: lectura" on public.ruta_activa;
create policy "ruta_activa: lectura"
  on public.ruta_activa for select to authenticated
  using (driver_id = auth.uid() or public.is_staff());

drop policy if exists "ruta_activa: update propia o admin" on public.ruta_activa;
drop policy if exists "ruta_activa: update propia o staff" on public.ruta_activa;
create policy "ruta_activa: update propia o staff"
  on public.ruta_activa for update to authenticated
  using  (driver_id = auth.uid() or public.is_staff())
  with check (driver_id = auth.uid() or public.is_staff());

drop policy if exists "ruta_activa: delete propia o admin" on public.ruta_activa;
drop policy if exists "ruta_activa: delete propia o staff" on public.ruta_activa;
create policy "ruta_activa: delete propia o staff"
  on public.ruta_activa for delete to authenticated
  using (driver_id = auth.uid() or public.is_staff());
