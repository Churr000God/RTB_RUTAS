// =====================================================================
// src/lib/routing.js
// Núcleo puro de ruteo: matrices de tiempo/distancia, TSP (exacto y
// heurístico, con soporte de paradas ancladas a una posición), métricas
// de un orden dado y cálculo de ETA / hora de regreso.
//
// Sin dependencias de React — se puede importar en tests (Vitest) sin
// arrastrar el DOM ni componentes.
// =====================================================================

/* ============================================================
   Utilidades numéricas / fecha
   ============================================================ */
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const dowOf = (ts) => new Date(ts).getDay();
const toRad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/* ============================================================
   El RECORRIDO es la fuente de verdad. De él se derivan tramos y esperas.
   ============================================================ */
export function deriveObservations(recorridos) {
  const segments = [], waits = [];
  for (const R of recorridos) {
    const ts = R.ts;
    for (let i = 0; i < R.stops.length; i++) {
      const st = R.stops[i];
      if (st.waitMin != null && isFinite(st.waitMin)) waits.push({ point: st.point, min: +st.waitMin, ts });
      if (i > 0 && st.legMin != null && isFinite(st.legMin)) {
        segments.push({ from: R.stops[i - 1].point, to: st.point, min: +st.legMin, km: st.legKm != null && isFinite(st.legKm) ? +st.legKm : null, ts });
      }
    }
  }
  return { segments, waits };
}

export function buildMatrices(points, segments, { weekday = null, stat = "median", speedKmh = 25, defaultMin = 20 } = {}) {
  const n = points.length;
  const timeM = Array.from({ length: n }, () => new Array(n).fill(null));
  const distM = Array.from({ length: n }, () => new Array(n).fill(null));
  const learned = Array.from({ length: n }, () => new Array(n).fill(false));
  const counts = Array.from({ length: n }, () => new Array(n).fill(0));
  const agg = (arr) => (stat === "mean" ? mean(arr) : median(arr));
  const idIndex = Object.fromEntries(points.map((p, i) => [p.id, i]));

  const bucket = {};
  for (const s of segments) {
    if (!(s.from in idIndex) || !(s.to in idIndex)) continue;
    if (weekday != null && dowOf(s.ts) !== weekday) continue;
    const key = s.from + "|" + s.to;
    (bucket[key] ||= { t: [], d: [] }).t.push(s.min);
    if (s.km != null) bucket[key].d.push(s.km);
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) { timeM[i][j] = 0; distM[i][j] = 0; continue; }
      const b = bucket[points[i].id + "|" + points[j].id];
      if (b && b.t.length) {
        timeM[i][j] = agg(b.t);
        learned[i][j] = true;
        counts[i][j] = b.t.length;
        distM[i][j] = b.d.length ? agg(b.d) : haversine(points[i], points[j]);
      } else {
        const hv = haversine(points[i], points[j]);
        if (hv != null) { distM[i][j] = hv; timeM[i][j] = (hv / speedKmh) * 60; }
        else { distM[i][j] = null; timeM[i][j] = defaultMin; }
        learned[i][j] = false;
      }
    }
  }
  return { timeM, distM, learned, counts };
}

export function buildWaits(points, waits) {
  const w = {};
  for (const p of points) w[p.id] = 0;
  const b = {};
  for (const x of waits) (b[x.point] ||= []).push(x.min);
  for (const p of points) if (b[p.id]?.length) w[p.id] = mean(b[p.id]);
  return w;
}

/* ============================================================
   Solucionadores TSP (depósito fijo en índice 0)

   Anclajes: Map<nodeIndex, position> (o {} plano nodeIndex -> position),
   posiciones 1..n-1 (0 = depósito, no anclable). "Primera tras el
   inicio" = posición 1; "última antes del regreso" = posición n-1.
   Un mismo nodo o posición repetidos son conflicto -> null (rechazado).
   ============================================================ */
export function tourCost(order, C, closed) {
  let c = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const v = C[order[i]][order[i + 1]];
    if (v == null) return Infinity;
    c += v;
  }
  if (closed) {
    const v = C[order[order.length - 1]][order[0]];
    if (v == null) return Infinity;
    c += v;
  }
  return c;
}

// Normaliza el mapa de anclajes de entrada a { fixedAt, posOf } por índice.
// Devuelve null si hay conflicto (nodo o posición duplicados).
function normalizeAnchors(anchors, n) {
  const fixedAt = new Array(n).fill(-1);
  const posOf = new Array(n).fill(-1);
  if (!anchors) return { fixedAt, posOf };
  const entries = anchors instanceof Map
    ? [...anchors.entries()]
    : Object.entries(anchors).map(([k, v]) => [+k, +v]);
  for (const [node, pos] of entries) {
    if (!Number.isInteger(node) || !Number.isInteger(pos)) return null;
    if (node <= 0 || node >= n || pos <= 0 || pos >= n) return null;
    if (fixedAt[pos] !== -1 || posOf[node] !== -1) return null; // conflicto
    fixedAt[pos] = node;
    posOf[node] = pos;
  }
  return { fixedAt, posOf };
}

function heldKarpAnchored(C, n, closed, fixedAt) {
  const FULL = (1 << n) - 1;
  const dp = Array.from({ length: 1 << n }, () => new Float64Array(n).fill(Infinity));
  const par = Array.from({ length: 1 << n }, () => new Int16Array(n).fill(-1));
  dp[1][0] = 0;
  const pop = new Int8Array(1 << n);
  for (let m = 1; m <= FULL; m++) pop[m] = pop[m >> 1] + (m & 1);

  for (let mask = 1; mask <= FULL; mask++) {
    if (!(mask & 1)) continue;
    const pos = pop[mask] - 1; // posición del nodo terminal para este estado
    const nextPos = pos + 1;
    if (nextPos > n - 1) continue; // ya es el estado completo, no hay más transiciones
    const forced = fixedAt[nextPos];
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i)) || dp[mask][i] === Infinity) continue;
      for (let j = 0; j < n; j++) {
        if (mask & (1 << j)) continue;
        if (forced !== -1 && forced !== j) continue; // posición siguiente anclada a otro nodo
        const w = C[i][j]; if (w == null) continue;
        const nm = mask | (1 << j), nc = dp[mask][i] + w;
        if (nc < dp[nm][j]) { dp[nm][j] = nc; par[nm][j] = i; }
      }
    }
  }
  let best = Infinity, last = -1;
  for (let i = 0; i < n; i++) {
    if (dp[FULL][i] === Infinity) continue;
    const back = closed ? C[i][0] : 0; if (back == null) continue;
    const c = dp[FULL][i] + back; if (c < best) { best = c; last = i; }
  }
  if (last === -1) return null;
  const order = []; let mask = FULL, cur = last;
  while (cur !== -1) { order.push(cur); const p = par[mask][cur]; mask ^= 1 << cur; cur = p; }
  order.reverse();
  return { order, cost: best };
}

function hasLockedInRange(fixedAt, lo, hi) {
  for (let x = lo; x <= hi; x++) if (fixedAt[x] !== -1) return true;
  return false;
}

function heuristicAnchored(C, n, closed, fixedAt, posOf) {
  const visited = new Array(n).fill(false); visited[0] = true;
  const order = new Array(n).fill(-1);
  order[0] = 0;
  let cur = 0;
  for (let pos = 1; pos < n; pos++) {
    let node = fixedAt[pos];
    if (node === -1) {
      let best = -1, bc = Infinity;
      for (let j = 0; j < n; j++) {
        if (visited[j] || posOf[j] !== -1) continue;
        const v = C[cur][j];
        if (v != null && v < bc) { bc = v; best = j; }
      }
      if (best === -1) for (let j = 0; j < n; j++) if (!visited[j] && posOf[j] === -1) { best = j; break; }
      node = best;
    }
    order[pos] = node; visited[node] = true; cur = node;
  }
  let best = order.slice(), bestCost = tourCost(best, C, closed), improved = true, guard = 0;
  while (improved && guard++ < 3000) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++)
      for (let k = i + 1; k < best.length; k++) {
        if (hasLockedInRange(fixedAt, i, k)) continue;
        const cand = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const cc = tourCost(cand, C, closed);
        if (cc + 1e-9 < bestCost) { best = cand; bestCost = cc; improved = true; }
      }
    for (let i = 1; i < best.length; i++)
      for (let j = 1; j < best.length; j++) {
        if (i === j) continue;
        if (hasLockedInRange(fixedAt, Math.min(i, j), Math.max(i, j))) continue;
        const cand = best.slice(); const [node] = cand.splice(i, 1); cand.splice(j, 0, node);
        if (cand[0] !== 0) continue;
        const cc = tourCost(cand, C, closed);
        if (cc + 1e-9 < bestCost) { best = cand; bestCost = cc; improved = true; }
      }
  }
  return { order: best, cost: bestCost };
}

/**
 * Resuelve el TSP con depósito fijo en índice 0.
 * @param {number[][]} C matriz de costos NxN (null = tramo sin datos)
 * @param {number} n número de puntos
 * @param {boolean} closed ruta cerrada (regresa al inicio) o abierta
 * @param {Map<number,number>|Object} [anchors] nodo -> posición (1..n-1)
 * @returns {{order:number[], cost:number, exact:boolean}|null} null si no
 *   hay solución factible (tramos faltantes) o los anclajes son inválidos.
 */
export function solveTSP(C, n, closed, anchors) {
  if (n <= 1) return { order: [0], cost: 0, exact: true };
  const norm = normalizeAnchors(anchors, n);
  if (norm === null) return null; // anclajes en conflicto
  if (n <= 12) {
    const r = heldKarpAnchored(C, n, closed, norm.fixedAt);
    return r ? { ...r, exact: true } : null;
  }
  return { ...heuristicAnchored(C, n, closed, norm.fixedAt, norm.posOf), exact: false };
}

/* ============================================================
   Análisis de ahorro: orden real vs orden óptimo, misma matriz.
   ============================================================ */
export function analizarAhorro(points, recorridos, { leaveOneOut = true } = {}) {
  const out = [];
  for (const R of recorridos) {
    let ids = R.stops.map((s) => s.point);
    let closed = false;
    if (ids.length > 2 && ids[ids.length - 1] === ids[0]) { closed = true; ids = ids.slice(0, -1); }
    if (new Set(ids).size !== ids.length) continue;
    if (ids.length < 3) continue;
    const subPts = ids.map((id) => points.find((p) => p.id === id));
    if (subPts.some((p) => !p)) continue;

    const source = leaveOneOut ? recorridos.filter((x) => x.id !== R.id) : recorridos;
    const { segments } = deriveObservations(source);
    const { timeM, learned } = buildMatrices(subPts, segments, { stat: "median" });
    const n = subPts.length;

    const realOrder = subPts.map((_, i) => i);
    const realOnMatrix = tourCost(realOrder, timeM, closed);
    const realMeasured = R.stops.reduce((s, st) => s + (st.legMin != null && isFinite(st.legMin) ? +st.legMin : 0), 0);
    const totalWait = R.stops.reduce((s, st) => s + (st.waitMin != null && isFinite(st.waitMin) ? +st.waitMin : 0), 0);
    const totalBreak = R.stops.reduce((s, st) => s + (st.legBreakMin || 0) + (st.waitBreakMin || 0), 0);
    const opt = solveTSP(timeM, n, closed);
    if (!opt) continue;
    const gap = realOnMatrix - opt.cost;

    let estimado = false;
    for (let s = 1; s < opt.order.length; s++) if (!learned[opt.order[s - 1]][opt.order[s]]) estimado = true;
    if (closed && !learned[opt.order[opt.order.length - 1]][opt.order[0]]) estimado = true;

    out.push({
      id: R.id, date: R.dateISO, ts: R.ts, n, closed,
      realMeasured, totalWait, totalBreak, realOnMatrix, optCost: opt.cost, gap,
      gapPct: realOnMatrix > 0 ? (gap / realOnMatrix) * 100 : 0,
      realNames: subPts.map((p) => p.name),
      optNames: opt.order.map((k) => subPts[k].name),
      sameOrder: realOrder.every((v, i) => v === opt.order[i]),
      estimado,
    });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

/* ============================================================
   Métricas de un orden dado (recálculo en tiempo real, sin resolver
   TSP) y cálculo de ETA / hora de regreso a partir de una hora de
   inicio.
   ============================================================ */

/**
 * Suma manejo/distancia/esperas de un orden de visita ya decidido
 * (óptimo o editado a mano). No resuelve TSP — es la operación barata
 * que se repite en cada arrastre/anclaje.
 * @param {number[]} order índices (dentro de `sub`) en orden de visita, order[0]=depósito
 * @param {{sub:object[], timeM:number[][], distM:number[][], learned:boolean[][], W:Object, closed:boolean}} ctx
 */
export function metricsForOrder(order, { sub, timeM, distM, learned, W, closed }) {
  let totT = 0, totD = 0, totW = 0, anyEst = false;
  const legs = [];
  for (let s = 0; s < order.length; s++) {
    const k = order[s];
    if (s > 0) {
      const a = order[s - 1];
      totT += timeM[a][k] ?? 0;
      totD += distM[a][k] ?? 0;
      if (!learned[a][k]) anyEst = true;
      legs.push({ min: timeM[a][k], km: distM[a][k], learned: learned[a][k] });
      totW += W[sub[k].id] ?? 0;
    }
  }
  if (closed && order.length > 1) {
    const a = order[order.length - 1], k = order[0];
    totT += timeM[a][k] ?? 0;
    totD += distM[a][k] ?? 0;
    if (!learned[a][k]) anyEst = true;
    legs.push({ min: timeM[a][k], km: distM[a][k], learned: learned[a][k], ret: true });
  }
  return {
    seqNames: order.map((k) => sub[k].name),
    seqIds: order.map((k) => sub[k].id),
    legs, totT, totD, totW, anyEst,
  };
}

/** "HH:MM" -> minutos desde medianoche, o null si inválido. */
export function parseHHMM(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(":").map(Number);
  if (!isFinite(h) || !isFinite(m)) return null;
  return h * 60 + m;
}

/** minutos desde medianoche -> "HH:MM" (envuelve al pasar de medianoche). */
export function minToHHMM(min) {
  if (min == null || !isFinite(min)) return "—";
  let m = Math.round(min) % (24 * 60);
  if (m < 0) m += 24 * 60;
  const h = Math.floor(m / 60), r = m % 60;
  return `${String(h).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/**
 * ETA por parada y hora de regreso a partir de una hora de inicio.
 * Las ETAs siempre acumulan tiempo de manejo (timeM) + esperas — la
 * hora de reloj depende del tiempo, no de la distancia, aunque el
 * orden se haya optimizado por km. Marca `approx` cuando el tramo
 * previo (o alguno anterior en la cadena) no está aprendido.
 * @param {number[]} order índices en orden de visita, order[0]=depósito
 * @param {{sub:object[], timeM:number[][], learned:boolean[][], W:Object, closed:boolean}} ctx
 * @param {number} horaInicioMin minutos desde medianoche
 * @param {number} [comidaMin] buffer de comida sumado al total antes del regreso
 */
export function computeETAs(order, { sub, timeM, learned, W, closed }, horaInicioMin, comidaMin = 0) {
  let t = horaInicioMin;
  let approxSoFar = false;
  const etas = [];
  for (let s = 0; s < order.length; s++) {
    const k = order[s];
    if (s > 0) {
      const a = order[s - 1];
      t += timeM[a][k] ?? 0;
      if (!learned[a][k]) approxSoFar = true;
    }
    etas.push({ id: sub[k].id, name: sub[k].name, etaMin: t, approx: approxSoFar });
    if (s > 0) t += W[sub[k].id] ?? 0;
  }
  t += comidaMin;
  let approxReturn = approxSoFar;
  if (closed && order.length > 0) {
    const a = order[order.length - 1], k = order[0];
    t += timeM[a][k] ?? 0;
    if (!learned[a][k]) approxReturn = true;
  }
  return { etas, horaRegresoMin: t, approxReturn };
}
