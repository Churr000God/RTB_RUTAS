# Despliegue del módulo de Seguimiento de Ruta

Un solo paso a correr una vez en tu proyecto real de Supabase
(`defqmhnzuraqmqwrfkry`, el que está en tu `.env`). No requiere Edge
Functions ni cambios de Auth — todo es SQL.

## 1. Base de datos (SQL Editor)

Dashboard → **SQL Editor → New query**. Pega y corre completo
[`migrations/2026-07-seguimiento-ruta.sql`](./migrations/2026-07-seguimiento-ruta.sql).
Es idempotente (se puede volver a correr sin romper nada).

Esto hace dos cosas:
1. Agrega `recorridos.edit_log` (columna `jsonb`, default `'[]'`) para
   guardar, dentro del recorrido terminado, el registro de qué editó el
   despacho en la ruta mientras estaba en curso.
2. Crea la función `merge_ruta_activa` (más dos helpers privados,
   `_stamp_of`/`_merge_json_list`): fusiona de forma **atómica** (fila
   bloqueada) el estado de `ruta_activa` cuando el chofer y el despacho
   escriben casi al mismo tiempo, en vez del `upsert` ciego de antes que
   pisaba el objeto completo. No cambia ningún permiso — usa las mismas
   políticas RLS que ya existen sobre `ruta_activa`.

## 2. Verificación

- **Table Editor → recorridos**: confirma que aparece la columna
  `edit_log` (tipo `jsonb`).
- **Database → Functions**: confirma que aparece `merge_ruta_activa`
  (schema `public`).
- Prueba end-to-end: con dos sesiones abiertas (una como chofer, otra
  como admin/supervisor), inicia una ruta con el chofer y desde
  **Seguimiento** (admin/supervisor) agrega/quita/reordena una parada
  pendiente o manda un mensaje — debe aparecer del lado del chofer sin
  perder el progreso ya registrado.

## Si no la corres todavía

La app sigue funcionando sin esta migración: `saveRutaActiva`
(`src/lib/supabase.js`) detecta que la función RPC no existe y cae
automáticamente al `upsert` directo de antes (el chofer y el despacho
podrían pisarse si editan exactamente al mismo tiempo, pero nada se
rompe). El registro de ediciones (`edit_log`) simplemente no se persiste
con el recorrido hasta que exista la columna.

---

Con este paso hecho, el módulo queda 100% funcional: línea de tiempo,
estadísticas en vivo, identidad por color, edición del plan de
pendientes, alertas de desviación y el chat de mensajes entre despacho y
chofer.

## Troubleshooting: el despacho (admin/supervisor) no puede mandar mensajes ni editar el plan

Síntoma detectado en campo (2026-07-20): el chofer sí envía mensajes y
los tres roles los ven, pero cuando admin o supervisor responden desde
**Seguimiento**, el mensaje no le llega al chofer. En consola del
navegador aparece:

```
POST .../rest/v1/rpc/merge_ruta_activa 403 (Forbidden)
{code: '42501', message: 'new row violates row-level security policy for table "ruta_activa"'}
```

**Causa:** `merge_ruta_activa` guarda con
`INSERT ... ON CONFLICT (driver_id) DO UPDATE`. Postgres evalúa la
política de **INSERT** (`WITH CHECK`) sobre la fila propuesta aunque el
resultado sea un UPDATE de una fila ya existente. La política de INSERT
de `ruta_activa` solo dejaba `driver_id = auth.uid()` — sin la excepción
`is_staff()` que sí tenían UPDATE y DELETE — así que el despacho nunca
podía escribir en la fila de OTRO chofer (mensaje, agregar/quitar/
reordenar parada), aunque sí podía leerla y aunque el error no se veía
en la UI (se tragaba en silencio).

**Arreglo:** correr
[`migrations/2026-07-seguimiento-insert-staff.sql`](./migrations/2026-07-seguimiento-insert-staff.sql)
(idempotente, no bloquea la tabla, seguro con rutas activas en curso):

```sql
drop policy if exists "ruta_activa: insert propia" on public.ruta_activa;
drop policy if exists "ruta_activa: insert propia o staff" on public.ruta_activa;
create policy "ruta_activa: insert propia o staff"
  on public.ruta_activa for insert to authenticated
  with check (driver_id = auth.uid() or public.is_staff());
```

De paso, `applyDispatchEdit` (`src/App.jsx`) ahora captura cualquier
error de estas 4 acciones y muestra un toast ("No se pudo enviar el
cambio al chofer...") en vez de fallar en silencio — para detectar un
problema similar sin depender de la consola del navegador.
