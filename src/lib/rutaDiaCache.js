/* ============================================================
   Caché offline de `ruta_activa` (rutaDia) en el teléfono.

   Guarda/lee el estado de la ruta en curso en localStorage, keyed
   por chofer, para no perder progreso si se cae la conexión. La
   reconciliación entre la copia local y la del servidor usa el
   mismo sello `_w` (Date.now() de la última escritura) que ya
   protege contra ecos/lecturas viejas de Supabase Realtime.
   ============================================================ */

const KEY_PREFIX = "rtb_ruta_activa_";

function keyFor(driverId) {
  return `${KEY_PREFIX}${driverId}`;
}

function defaultStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function saveLocal(driverId, state, storage = defaultStorage()) {
  if (!storage || !driverId || !state) return;
  try {
    storage.setItem(keyFor(driverId), JSON.stringify(state));
  } catch {
    // Cuota llena / storage no disponible: la ruta sigue guardándose en servidor si hay red.
  }
}

export function readLocal(driverId, storage = defaultStorage()) {
  if (!storage || !driverId) return null;
  try {
    const raw = storage.getItem(keyFor(driverId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearLocal(driverId, storage = defaultStorage()) {
  if (!storage || !driverId) return;
  try {
    storage.removeItem(keyFor(driverId));
  } catch {
    // ignorar
  }
}

/**
 * Decide qué estado usar entre la copia local (teléfono) y la del servidor,
 * quedándose con la de sello `_w` más reciente. Sin sello se trata como -1
 * (más vieja que cualquier escritura real).
 */
export function reconcile(localState, dbState) {
  if (localState && !dbState) return localState;
  if (dbState && !localState) return dbState;
  if (!localState && !dbState) return null;
  const lw = localState._w ?? -1;
  const dw = dbState._w ?? -1;
  return lw >= dw ? localState : dbState;
}
