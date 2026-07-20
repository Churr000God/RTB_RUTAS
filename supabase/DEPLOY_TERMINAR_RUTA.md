# Despliegue: fin de ruta — nombre de ruta + limpieza de la plantilla

Un solo paso a correr una vez en tu proyecto real de Supabase. No requiere
Edge Functions ni cambios de Auth — todo es SQL.

## 1. Base de datos (SQL Editor)

Dashboard → **SQL Editor → New query**. Pega y corre completo
[`migrations/2026-07-terminar-ruta-limpieza.sql`](./migrations/2026-07-terminar-ruta-limpieza.sql).
Es idempotente (se puede volver a correr sin romper nada).

Esto hace dos cosas:
1. Agrega `recorridos.nombre_ruta` (columna `text`, opcional) — para que
   el recorrido terminado guarde el nombre de la ruta (`rutas_guardadas.nombre`)
   que lo originó, y ese nombre aparezca en **Evaluación de rutas** y en
   el reporte PDF (`ReporteRuta.jsx`), no solo chofer + fecha.
2. Agrega la política RLS `"rutas_guardadas: delete propia asignada"` —
   permite que un chofer borre su PROPIA fila de `rutas_guardadas` (la que
   tiene `assigned_to` = su propio id). Antes solo el staff podía borrar
   filas de esa tabla. Es necesaria porque, al terminar una ruta, la
   plantilla que la originó ahora se borra automáticamente (ver abajo).
   Una plantilla "sin asignar" (`assigned_to` null) sigue sin poder
   borrarla un chofer — esas las gestiona solo el staff.

## 2. Verificación

- **Table Editor → recorridos**: confirma que aparece la columna
  `nombre_ruta` (tipo `text`).
- **Database → Policies → rutas_guardadas**: confirma que aparece la
  política `rutas_guardadas: delete propia asignada` (DELETE).
- Prueba end-to-end: como chofer, carga una ruta guardada asignada a ti y
  termínala. Debe:
  1. Aparecer la pantalla "¡Ruta completada!" y guardarse el recorrido.
  2. La plantilla que cargaste **desaparecer** de "Rutas guardadas" (ya
     no aparece con botón "Cargar" ni badge "Chofer asignado").
  3. En **Evaluación de rutas** (admin/supervisor), el recorrido recién
     terminado debe mostrar el nombre de la ruta junto a la fecha y el
     chofer.

## Si no la corres todavía

La app sigue funcionando sin esta migración: `addRecorrido`
(`src/lib/supabase.js`) detecta que la columna `nombre_ruta` no existe y
reintenta el insert sin ella (mismo patrón que `driver_id`/`edit_log`) —
el recorrido se guarda igual, solo sin nombre. El borrado de la plantilla
(`onDeleteRutaGuardada`) fallará por RLS y quedará solo logueado en
consola (`console.error`) — no bloquea el guardado del recorrido, pero la
plantilla se seguirá viendo como "cargada" hasta correr la migración.

---

## Troubleshooting: al terminar la ruta no se guardaba y quedaba como plantilla

Síntoma detectado en campo (2026-07-20): el chofer terminaba la ruta, pero
esta no aparecía en el histórico y la ruta seguía viéndose "en curso" /
como plantilla cargada. Ocurría también para admin, no solo choferes.

**Causa raíz:** el `catch` de `saveRoute()`
(`src/components/rutadia/RutaDiaTab.jsx`) estaba vacío
(`catch { setErr("Error al guardar. Intenta de nuevo."); }`) — se tragaba
el error real de Supabase. Si el `INSERT` en `recorridos` (o el `refresh()`
posterior que dispara `onAddRecorrido` en `App.jsx`) fallaba por cualquier
motivo, nunca se llegaba a `patch({ done: true })`, así que:
- `ruta_activa` nunca se borraba (`clearRutaActiva` solo corre si `done === true`).
- La `rutas_guardadas` de origen, que de por sí nunca se tocaba al
  terminar, seguía existiendo — reforzando la sensación de "se quedó como
  plantilla".

**Arreglo:**
1. `saveRoute()` ahora captura el error real y lo muestra
   (`setErr(`Error al guardar: ${e?.message || e}`)`) — permitió
   diagnosticar en vivo que la base de datos en sí estaba bien
   configurada (RLS, columnas y RPC `merge_ruta_activa` correctos; se
   verificó con consultas de solo lectura sobre `pg_policies` /
   `information_schema.columns` / `pg_proc`).
2. `onAddRecorrido()` (`src/App.jsx`) ya no deja que un fallo del
   `refresh()` posterior al `INSERT` tumbe la finalización completa:
   `await refresh().catch((e) => console.error(...))` — si el recorrido
   ya se guardó, la ruta se marca terminada aunque el refresh falle.
3. Se agregó el vínculo `rutaDia.rutaGuardadaId` (id de la
   `rutas_guardadas` de origen, capturado al cargarla con "Cargar") y,
   al terminar con éxito, se borra esa plantilla automáticamente — ver
   migración de este documento. Decisión de producto: la plantilla es de
   **un solo uso** (se borra, no se desasigna) — si se necesita repetir la
   misma ruta, se vuelve a generar/asignar desde "Generación y carga de
   rutas".
