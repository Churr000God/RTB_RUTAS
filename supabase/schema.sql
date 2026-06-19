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
-- Row Level Security.
-- El proyecto Supabase está en internet público: SIN RLS, la anon key
-- (que se puede extraer del bundle JS) daría acceso total a tu DB desde
-- cualquier lado. Aquí: acceso solo a usuarios autenticados (login).
-- Todo el personal comparte los mismos datos de la empresa.
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

-- =====================================================================
-- (Opcional) Datos por usuario en vez de compartidos:
--   alter table public.recorridos add column owner uuid default auth.uid();
--   ...y cambia las policies a  using (owner = auth.uid()).
-- Para una herramienta de empresa compartida, deja las policies de arriba.
-- =====================================================================
