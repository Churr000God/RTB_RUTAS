// =====================================================================
// src/lib/evaluacion.js
// Motor de evaluación/puntuación de rutas. Reutiliza el motor de matrices,
// el solver TSP y la misma lógica de comparación real-vs-óptimo que
// `analizarAhorro` (routing.js) — aquí se añaden los otros 3 criterios
// (entregas, esperas, ritmo) y las vistas agregadas (por usuario, semanal,
// general, ranking, alertas).
//
// Sin dependencias de React — JS puro, testeable con Vitest en Node.
// =====================================================================

import {
  deriveObservations, buildMatrices, buildWaits, solveTSP, tourCost, mean,
} from "./routing.js";

/* ============================================================
   Pesos por defecto y utilidades
   ============================================================ */
export const DEFAULT_WEIGHTS = { ruteo: 35, entregas: 30, esperas: 20, ritmo: 15 };

export const ESTADOS_COMPLETADOS = new Set(["entregado", "recolectado"]);

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function etiquetaFor(score) {
  if (score == null || !isFinite(score)) return "Sin datos";
  if (score >= 85) return "Excelente";
  if (score >= 70) return "Bien";
  if (score >= 50) return "Regular";
  return "Bajo";
}

/* ============================================================
   Los 4 criterios (0-100 o null si no aplica -> el peso se redistribuye)
   ============================================================ */

// 0% de brecha vs. el orden óptimo -> 100 pts; decae linealmente con el
// gap (curva simple, documentada, ajustable si hace falta calibrar con
// datos reales).
export function ruteoCriterio(gapPct) {
  if (gapPct == null || !isFinite(gapPct)) return { score: null, aplica: false, detail: "Sin datos de ruteo" };
  const score = clamp(100 - Math.max(0, gapPct), 0, 100);
  return { score, aplica: true, detail: `Brecha ${gapPct.toFixed(1)}% vs. el orden óptimo` };
}

// completadas ("entregado"/"recolectado") / intentadas (cualquier estado
// registrado, incl. "no_se_pudo") x 100. Sin ningún estado registrado en
// el recorrido -> criterio no aplica (N/A), su peso se redistribuye.
export function entregasCriterio(stops) {
  const intentadas = stops.filter((s) => s.estado != null);
  if (!intentadas.length) return { score: null, aplica: false, detail: "Sin estado de entrega registrado" };
  const completadas = intentadas.filter((s) => ESTADOS_COMPLETADOS.has(s.estado));
  const score = (completadas.length / intentadas.length) * 100;
  return { score, aplica: true, detail: `${completadas.length}/${intentadas.length} paradas completadas` };
}

// Por parada con espera real registrada y espera habitual aprendida
// (leave-one-out): 100 si la espera real está en o por debajo de la
// habitual, penaliza el exceso proporcionalmente. Paradas sin espera
// habitual aprendida no cuentan (no hay con qué comparar).
export function esperasCriterio(stops, W) {
  const vals = [];
  for (const st of stops) {
    if (st.waitMin == null || !isFinite(st.waitMin)) continue;
    const habitual = W[st.point];
    if (habitual == null) continue;
    const base = Math.max(habitual, 1); // evita división por ~0 en puntos con espera habitual casi nula
    const ratio = st.waitMin / base;
    vals.push(ratio <= 1 ? 100 : clamp(100 - (ratio - 1) * 100, 0, 100));
  }
  if (!vals.length) return { score: null, aplica: false, detail: "Sin esperas habituales aprendidas" };
  return { score: mean(vals), aplica: true, detail: `${vals.length} parada(s) comparadas contra su habitual` };
}

// Duración real de los tramos (legMin medidos) vs. la esperada por el
// modelo PARA EL ORDEN QUE REALMENTE HIZO (no el óptimo) — aísla el
// ritmo del efecto del orden.
export function ritmoCriterio(realMeasured, esperadoParaOrdenReal) {
  if (esperadoParaOrdenReal == null || !isFinite(esperadoParaOrdenReal) || esperadoParaOrdenReal <= 0) {
    return { score: null, aplica: false, detail: "Sin tiempo esperado para este orden" };
  }
  const ratio = realMeasured / esperadoParaOrdenReal;
  const score = ratio <= 1 ? 100 : clamp(100 - (ratio - 1) * 100, 0, 100);
  return { score, aplica: true, detail: `${Math.round(realMeasured)} min reales vs. ${Math.round(esperadoParaOrdenReal)} esperados` };
}

export function combinarCriterios(criterios, weights) {
  let sumW = 0, sumWS = 0;
  for (const key of Object.keys(weights)) {
    const c = criterios[key];
    if (!c || !c.aplica || c.score == null) continue;
    sumW += weights[key];
    sumWS += weights[key] * c.score;
  }
  const puntuacionFinal = sumW > 0 ? sumWS / sumW : null;
  return { puntuacionFinal, etiqueta: etiquetaFor(puntuacionFinal) };
}

/* ============================================================
   Evaluación de un recorrido (reporte por ruta)
   ============================================================ */

/**
 * Evalúa un recorrido: desglose por punto + 4 criterios + puntuación final.
 * Misma lógica de comparación real-vs-óptimo que `analizarAhorro` (mismos
 * criterios de descarte: <3 paradas, puntos duplicados o inexistentes).
 * @returns el objeto de evaluación, o null si el recorrido no es evaluable.
 */
export function evaluarRecorrido(R, points, allRecorridos, { weights = DEFAULT_WEIGHTS, leaveOneOut = true } = {}) {
  let ids = R.stops.map((s) => s.point);
  let closed = false;
  if (ids.length > 2 && ids[ids.length - 1] === ids[0]) { closed = true; ids = ids.slice(0, -1); }
  if (new Set(ids).size !== ids.length) return null;
  if (ids.length < 3) return null;
  const subPts = ids.map((id) => points.find((p) => p.id === id));
  if (subPts.some((p) => !p)) return null;

  const source = leaveOneOut ? allRecorridos.filter((x) => x.id !== R.id) : allRecorridos;
  const { segments, waits } = deriveObservations(source);
  const { timeM, learned } = buildMatrices(subPts, segments, { stat: "median" });
  const W = buildWaits(subPts, waits);
  const n = subPts.length;

  const realOrder = subPts.map((_, i) => i);
  const realOnMatrix = tourCost(realOrder, timeM, closed); // tiempo esperado para el orden REAL
  const opt = solveTSP(timeM, n, closed);
  if (!opt) return null;
  const gap = realOnMatrix - opt.cost;
  const gapPct = realOnMatrix > 0 ? (gap / realOnMatrix) * 100 : 0;

  let estimado = false;
  for (let s = 1; s < opt.order.length; s++) if (!learned[opt.order[s - 1]][opt.order[s]]) estimado = true;
  if (closed && !learned[opt.order[opt.order.length - 1]][opt.order[0]]) estimado = true;

  // Desglose por punto, alineado a R.stops (incluye la parada de cierre
  // real si la ruta es cerrada).
  const stops = R.stops.map((st, i) => {
    const p = points.find((pp) => pp.id === st.point);
    let legMinEsperado = null, legLearned = null;
    if (i > 0) {
      if (closed && i === R.stops.length - 1) {
        legMinEsperado = timeM[n - 1][0];
        legLearned = learned[n - 1][0];
      } else if (i < n) {
        legMinEsperado = timeM[i - 1][i];
        legLearned = learned[i - 1][i];
      }
    }
    return {
      pointId: st.point,
      name: p?.name ?? "(punto eliminado)",
      direccion: p?.direccion ?? null,
      legMinReal: isFinite(st.legMin) ? +st.legMin : null,
      legMinEsperado,
      legLearned,
      waitMinReal: isFinite(st.waitMin) ? +st.waitMin : null,
      waitHabitual: W[st.point] ?? null,
      estado: st.estado ?? null,
      nota: st.nota ?? null,
    };
  });

  const realMeasured = R.stops.reduce((s, st) => s + (isFinite(st.legMin) ? +st.legMin : 0), 0);
  const totalWait = R.stops.reduce((s, st) => s + (isFinite(st.waitMin) ? +st.waitMin : 0), 0);
  const totalBreak = R.stops.reduce((s, st) => s + (st.legBreakMin || 0) + (st.waitBreakMin || 0), 0);

  const criterios = {
    ruteo: ruteoCriterio(gapPct),
    entregas: entregasCriterio(R.stops),
    esperas: esperasCriterio(R.stops, W),
    ritmo: ritmoCriterio(realMeasured, realOnMatrix),
  };
  const { puntuacionFinal, etiqueta } = combinarCriterios(criterios, weights);

  return {
    id: R.id, driverId: R.driverId ?? null, date: R.dateISO, ts: R.ts, n, closed,
    realMeasured, totalWait, totalBreak, realOnMatrix, optCost: opt.cost, gap, gapPct,
    realNames: subPts.map((p) => p.name),
    optNames: opt.order.map((k) => subPts[k].name),
    sameOrder: realOrder.every((v, i) => v === opt.order[i]),
    estimado,
    stops,
    criterios, puntuacionFinal, etiqueta,
  };
}

/** Evalúa todos los recorridos evaluables (ordenados por fecha ascendente). */
export function evaluarRecorridos(points, recorridos, opts = {}) {
  const out = [];
  for (const R of recorridos) {
    const ev = evaluarRecorrido(R, points, recorridos, opts);
    if (ev) out.push(ev);
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

/* ============================================================
   Agregados: por usuario, semanal, general, ranking, alertas
   ============================================================ */

const CRITERIO_KEYS = ["ruteo", "entregas", "esperas", "ritmo"];

function promedioPorCriterio(list) {
  const out = {};
  for (const k of CRITERIO_KEYS) {
    const vals = list.map((e) => e.criterios[k]?.score).filter((v) => v != null);
    out[k] = vals.length ? mean(vals) : null;
  }
  return out;
}

/** Agrupa evaluaciones por chofer (driverId). Sin asignar (recorridos
 * anteriores a este módulo, sin driver_id) se agrupan aparte. */
export function agruparPorUsuario(evals, profiles = []) {
  const byId = {};
  for (const e of evals) (byId[e.driverId ?? "__sin_asignar"] ||= []).push(e);
  return Object.entries(byId).map(([key, list]) => {
    const driverId = key === "__sin_asignar" ? null : key;
    const nombre = driverId == null
      ? "Sin asignar"
      : (profiles.find((p) => p.userId === driverId)?.nombre ?? "Chofer eliminado");
    const scores = list.map((e) => e.puntuacionFinal).filter((v) => v != null);
    return {
      driverId, nombre, recorridos: list, n: list.length,
      promedio: scores.length ? mean(scores) : null,
      porCriterio: promedioPorCriterio(list),
    };
  }).sort((a, b) => (b.promedio ?? -Infinity) - (a.promedio ?? -Infinity));
}

// Semana ISO (lunes-domingo), clave "AAAA-Www".
function isoWeekKey(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNo = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Agrupa evaluaciones por semana ISO (flota completa). */
export function agruparPorSemana(evals) {
  const byWeek = {};
  for (const e of evals) (byWeek[isoWeekKey(e.ts)] ||= []).push(e);
  return Object.entries(byWeek).map(([semana, list]) => {
    const scores = list.map((e) => e.puntuacionFinal).filter((v) => v != null);
    return {
      semana, n: list.length,
      promedio: scores.length ? mean(scores) : null,
      porCriterio: promedioPorCriterio(list),
    };
  }).sort((a, b) => a.semana.localeCompare(b.semana));
}

/** Resumen general de flota: promedio, distribución de etiquetas y tiempo
 * total desperdiciado (suma de gaps positivos vs. el óptimo). */
export function resumenFlota(evals) {
  const scores = evals.map((e) => e.puntuacionFinal).filter((v) => v != null);
  return {
    n: evals.length,
    promedio: scores.length ? mean(scores) : null,
    tiempoDesperdiciado: evals.reduce((s, e) => s + Math.max(0, e.gap || 0), 0),
    porCriterio: promedioPorCriterio(evals),
    distribucion: {
      excelente: evals.filter((e) => e.etiqueta === "Excelente").length,
      bien: evals.filter((e) => e.etiqueta === "Bien").length,
      regular: evals.filter((e) => e.etiqueta === "Regular").length,
      bajo: evals.filter((e) => e.etiqueta === "Bajo").length,
    },
  };
}

/** Ranking de choferes por puntuación promedio (desc). Los criterios de
 * ruteo/ritmo ya son relativos a cada ruta (su propio óptimo/esperado),
 * lo que normaliza en buena medida por dificultad entre rutas distintas. */
export function rankingChoferes(evals, profiles = []) {
  return agruparPorUsuario(evals, profiles).filter((u) => u.n > 0);
}

/** Recorridos con puntuación final por debajo del umbral (ordenados del
 * peor al mejor). */
export function alertasRecorridos(evals, umbral = 60) {
  return evals
    .filter((e) => e.puntuacionFinal != null && e.puntuacionFinal < umbral)
    .sort((a, b) => a.puntuacionFinal - b.puntuacionFinal);
}

/** Choferes cuyo promedio del periodo está por debajo del umbral. */
export function alertasChoferes(evals, profiles = [], umbral = 60) {
  return rankingChoferes(evals, profiles).filter((u) => u.promedio != null && u.promedio < umbral);
}
