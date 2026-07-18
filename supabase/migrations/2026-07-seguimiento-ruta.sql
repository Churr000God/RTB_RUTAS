-- =====================================================================
-- Módulo de Seguimiento de Ruta (Estado / Estadísticas / Edición)
-- Ejecútalo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Qué hace:
--  1) Añade `recorridos.edit_log` para conservar, dentro del histórico,
--     el registro de qué editó el despacho en la ruta (agregar/quitar/
--     reordenar/nota) una vez que el chofer la termina.
--  2) Crea la función `merge_ruta_activa`: fusión ATÓMICA (fila bloqueada)
--     del estado JSONB de `ruta_activa` cuando dos escritores — el chofer
--     y el despacho — pueden estar guardando cambios casi al mismo tiempo.
--     Reemplaza el `upsert` ciego que antes usaba `saveRutaActiva`
--     (src/lib/supabase.js), que pisaba el objeto `state` completo.
--
-- No cambia ningún permiso: usa las mismas políticas RLS que ya existen
-- sobre `ruta_activa` (el chofer solo su fila; admin/supervisor cualquiera).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) recorridos: columna para persistir el registro de ediciones
-- ---------------------------------------------------------------------
alter table public.recorridos
  add column if not exists edit_log jsonb not null default '[]';

-- ---------------------------------------------------------------------
-- 2) Modelo de concurrencia por grupos de campos
--
-- El state de ruta_activa se divide en tres grupos, cada uno con su
-- propio sello de escritura (Date.now() del último cambio a ESE grupo):
--   _wDriver   → route, phase, nextStop, nextLegKm, done, horaInicio,
--                noticeAckAt        (dueño: el CHOFER)
--   _wPlan     → remaining                            (dueño: el DESPACHO)
--   _wDispatch → notes, notice, editLog                (dueño: el DESPACHO)
-- El sello legado `_w` se conserva como el máximo de los tres (compat.
-- con el anti-eco de realtime y la caché offline, que ya lo usaban).
-- Estados creados antes de este modelo solo tienen `_w`: cada grupo cae
-- a él como respaldo (ver _stamp_of).
--
-- Esta MISMA lógica vive también en JS puro, en
-- src/lib/rutaActivaMerge.js (mergeRutaActiva), usada para fusionar
-- lecturas (realtime, caché offline). Si se cambia una, cambiar la otra.
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

-- ---------------------------------------------------------------------
-- 3) merge_ruta_activa: lee la fila actual CON BLOQUEO, fusiona el
--    estado entrante por grupo de campos, y escribe el resultado.
--    `security invoker`: corre con los permisos del usuario que llama
--    (respeta las políticas RLS de ruta_activa tal cual están hoy).
-- ---------------------------------------------------------------------
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

-- Nota: si la fila de ruta_activa aún NO existe (base is null) y quien
-- llama es staff editando la ruta de OTRO chofer, el insert de arriba
-- fallará por RLS ("ruta_activa: insert propia" exige driver_id =
-- auth.uid()). No debería ocurrir en la práctica: el despacho solo edita
-- rutas ya activas (la fila la crea el chofer al iniciar). El código
-- cliente (applyDispatchEdit) verifica que la ruta exista antes de editar.
