/* ============================================================
   Caché offline de `ruta_activa` (rutaDia) en el teléfono.

   Guarda/lee el estado de la ruta en curso en localStorage, keyed
   por chofer, para no perder progreso si se cae la conexión. La
   reconciliación entre la copia local y la del servidor fusiona
   por grupo de campos (progreso del chofer vs. plan/notas del
   despacho) — ver rutaActivaMerge.js. Así, si el despacho editó el
   plan mientras el chofer estaba sin señal, al reconectar se
   conservan AMBOS: el progreso offline del chofer y el plan nuevo.
   ============================================================ */

import { mergeRutaActiva } from "./rutaActivaMerge";

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
 * Decide qué estado usar entre la copia local (teléfono) y la del servidor.
 * Delega en mergeRutaActiva: por cada grupo de campos (progreso del chofer /
 * plan de pendientes / notas del despacho) gana el de sello más reciente;
 * un lado sin sello se trata como -1 (más viejo que cualquier escritura real).
 */
export function reconcile(localState, dbState) {
  return mergeRutaActiva(localState, dbState);
}
