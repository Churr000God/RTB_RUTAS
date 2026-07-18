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
