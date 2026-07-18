// =====================================================================
// src/lib/rutaActivaMerge.js
// Fusión por grupos de campos del estado de `ruta_activa`.
//
// Dos escritores tocan la misma fila: el CHOFER (progreso: paradas
// visitadas, fase, destino inmediato) y el DESPACHO (plan de pendientes,
// notas, avisos). Para que ninguno pise al otro se separan responsabilidades
// por grupo de campos, cada uno con su propio sello `_wX` (Date.now() de la
// última escritura de ESE grupo):
//
//   _wDriver   → route, phase, nextStop, nextLegKm, done, horaInicio, noticeAckAt
//   _wPlan     → remaining (plan de pendientes, dueño: despacho)
//   _wDispatch → notes, notice, editLog
//
// El sello legado `_w` se conserva como el máximo de los tres, para no
// romper el anti-eco de realtime ni la caché offline existentes (ver
// rutaDiaCache.js). Estados creados antes de este módulo solo tienen `_w`:
// cada grupo hace fallback a él (ver stampOf).
//
// Sin dependencias de React — testeable como routing.js.
// =====================================================================

import { buildMatrices, buildWaits } from "./routing";

export const DRIVER_FIELDS = ["route", "phase", "nextStop", "nextLegKm", "done", "horaInicio", "noticeAckAt"];
export const PLAN_FIELDS = ["remaining"];
export const DISPATCH_FIELDS = ["notes", "notice", "editLog"];

/** Sello de un grupo, con fallback al `_w` legado (estados anteriores a este modelo). */
function stampOf(state, key) {
  if (!state) return -1;
  const v = state[key];
  return v !== undefined && v !== null ? v : (state._w ?? -1);
}

/** Grupo con mayor sello gana; empate → gana `base` (evita perder progreso reciente propio). */
function pick(base, incoming, stampKey) {
  return stampOf(incoming, stampKey) > stampOf(base, stampKey) ? incoming : base;
}

/** Une dos listas append-only (notas, registro de ediciones) por id, sin duplicar. */
function unionById(a, b) {
  const seen = new Map();
  for (const entry of [...(a || []), ...(b || [])]) {
    if (!entry) continue;
    const key = entry.id ?? `${entry.at}-${entry.action ?? entry.text ?? ""}`;
    if (!seen.has(key)) seen.set(key, entry);
  }
  return [...seen.values()].sort((x, y) => (x.at ?? 0) - (y.at ?? 0));
}

export function mergeEditLog(a, b) {
  return unionById(a, b);
}

export function mergeNotes(a, b) {
  return unionById(a, b);
}

/**
 * Fusiona dos versiones del state de `ruta_activa` por grupo de campos.
 * `base`/`incoming` pueden ser null (ruta inexistente / borrada).
 */
export function mergeRutaActiva(base, incoming) {
  if (!base) return incoming;
  if (!incoming) return base;

  const driverSrc = pick(base, incoming, "_wDriver");
  const planSrc = pick(base, incoming, "_wPlan");
  const dispatchSrc = pick(base, incoming, "_wDispatch");

  const out = {
    // Campos fijados por quien crea la ruta: no tienen dueño en curso,
    // se preserva el que no sea nulo (deberían coincidir en ambos lados).
    title: base.title ?? incoming.title,
    closed: base.closed ?? incoming.closed,
    startId: base.startId ?? incoming.startId,
    startName: base.startName ?? incoming.startName,
    endId: base.endId ?? incoming.endId,
    driverNombre: incoming.driverNombre ?? base.driverNombre,
  };

  for (const f of DRIVER_FIELDS) out[f] = driverSrc[f];
  out.remaining = planSrc.remaining ?? [];
  out.notes = mergeNotes(base.notes, incoming.notes);
  out.notice = dispatchSrc.notice ?? null;
  out.editLog = mergeEditLog(base.editLog, incoming.editLog);

  out._wDriver = Math.max(stampOf(base, "_wDriver"), stampOf(incoming, "_wDriver"));
  out._wPlan = Math.max(stampOf(base, "_wPlan"), stampOf(incoming, "_wPlan"));
  out._wDispatch = Math.max(stampOf(base, "_wDispatch"), stampOf(incoming, "_wDispatch"));
  out._w = Math.max(out._wDriver, out._wPlan, out._wDispatch);

  return out;
}

/** Ids ya "consumidos" del plan: visitados, más el destino inmediato en curso. */
export function consumedIds(state) {
  const ids = new Set((state?.route || []).map((s) => s.id));
  if (state?.phase === "traveling" && state?.nextStop?.id) ids.add(state.nextStop.id);
  return ids;
}

/**
 * Pendientes "vistos" por el chofer: el plan (`remaining`, dueño del
 * despacho) menos lo ya consumido. El chofer nunca escribe `remaining`
 * directamente — elegir/llegar/cambiar destino solo mueve ids dentro
 * del grupo driver, y esta función deriva el resultado visible.
 */
export function effectivePending(state) {
  if (!state) return [];
  const consumed = consumedIds(state);
  return (state.remaining || []).filter((r) => !consumed.has(r.id));
}

export const DEVIATION_DEFAULTS = { minAbs: 10, ratio: 1.5 };

/**
 * Alerta de desviación al vuelo: compara el tiempo transcurrido en la
 * parada actual (o en el tramo en curso) contra lo esperado (aprendido
 * de recorridos pasados, o estimado). No persiste nada — se recalcula
 * en cada render con `now`.
 */
export function computeDeviation(state, { allPoints = [], segments = [], waits = [] } = {}, now = Date.now(), threshold = DEVIATION_DEFAULTS) {
  if (!state || state.done) return null;
  const byId = (id) => allPoints.find((p) => p.id === id);
  const route = state.route || [];
  const cur = route[route.length - 1];
  if (!cur) return null;

  if (state.phase === "at-stop" && cur.arrivedAt) {
    const point = byId(cur.id);
    if (!point) return null;
    const W = buildWaits([point], waits);
    const expectedMin = W[point.id] ?? 0;
    const realMin = Math.max(0, (now - cur.arrivedAt) / 60000 - (cur.waitBreakMin || 0));
    if (expectedMin > 0 && realMin > expectedMin * threshold.ratio && realMin - expectedMin > threshold.minAbs) {
      return { kind: "wait", pointId: point.id, pointName: point.name ?? cur.name, expectedMin, realMin };
    }
    return null;
  }

  if (state.phase === "traveling" && state.nextStop && cur.departedAt) {
    const origin = byId(cur.id);
    const dest = byId(state.nextStop.id);
    if (!origin || !dest) return null;
    const { timeM, learned } = buildMatrices([origin, dest], segments);
    const expectedMin = timeM?.[0]?.[1];
    if (expectedMin == null) return null;
    const realMin = Math.max(0, (now - cur.departedAt) / 60000);
    if (realMin > expectedMin * threshold.ratio && realMin - expectedMin > threshold.minAbs) {
      return { kind: "leg", pointId: dest.id, pointName: state.nextStop.name, expectedMin, realMin, approx: !learned?.[0]?.[1] };
    }
    return null;
  }
  return null;
}
