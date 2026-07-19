// =====================================================================
// src/components/seguimiento/LiveStats.jsx
// Estadísticas en vivo de una ruta activa: la versión "en marcha" de la
// evaluación (src/lib/routing.js) — mismo motor (buildMatrices/buildWaits/
// computeETAs) que usa RutaDiaTab para su propia ETA.
// =====================================================================
import { useEffect, useState, useMemo } from "react";
import { buildMatrices, buildWaits, computeETAs, minToHHMM, parseHHMM } from "../../lib/routing";
import { effectivePending } from "../../lib/rutaActivaMerge";
import { fmtMin } from "./format";

const Stat = ({ label, value }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-2">
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className="font-mono text-sm text-slate-200">{value}</div>
  </div>
);

export default function LiveStats({ state, allPoints, segments, waits }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state || state.done) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state?.done]);

  const route = state?.route || [];
  const pending = effectivePending(state);
  const total = route.length + pending.length;
  const pct = total > 0 ? Math.min(100, (route.length / total) * 100) : (route.length > 0 ? 100 : 0);

  const elapsedMin = route.length > 0 && route[0].arrivedAt
    ? Math.max(0, Math.round((now - route[0].arrivedAt) / 60000)) : 0;
  const avgMin = route.length > 1 ? Math.round(elapsedMin / route.length) : null;
  const waitMin = route.reduce((acc, s) => {
    if (s.arrivedAt && s.departedAt) return acc + Math.max(0, Math.round((s.departedAt - s.arrivedAt) / 60000) - (s.waitBreakMin || 0));
    return acc;
  }, 0);

  // Cronómetro del segmento actual: en parada, desde que llegó; en camino
  // (o eligiendo destino, ya "salió" de la parada aunque no eligió aún),
  // desde que salió del último punto.
  const curStop = route.length ? route[route.length - 1] : null;
  let segmentStartAt = null, segmentLabel = "En este tramo";
  if (state?.phase === "at-stop" && curStop?.arrivedAt) {
    segmentStartAt = curStop.arrivedAt;
    segmentLabel = "En esta parada";
  } else if ((state?.phase === "traveling" || state?.phase === "choose-next") && curStop?.departedAt) {
    segmentStartAt = curStop.departedAt;
    segmentLabel = "En camino";
  }
  const segmentMin = segmentStartAt ? Math.max(0, Math.round((now - segmentStartAt) / 60000)) : null;

  // ETA de término siguiendo el orden ACTUAL del plan (no se re-optimiza
  // aquí — es la estimación de a dónde va a llegar con lo que ya tiene).
  const etaInfo = useMemo(() => {
    if (!state || state.done) return null;
    const curStop = route.length ? route[route.length - 1] : null;
    const originId = curStop ? curStop.id : state.startId;
    if (!originId) return null;
    const ids = [originId, ...pending.map((s) => s.id)];
    const sub = ids.map((id) => (allPoints || []).find((p) => p.id === id));
    if (sub.some((p) => !p)) return null;
    const nowD = new Date();
    const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
    const startMin = state.phase === "initial" && state.horaInicio ? (parseHHMM(state.horaInicio) ?? nowMin) : nowMin;
    if (sub.length < 2) return { horaTerminoMin: startMin, approx: false };
    const { timeM, learned } = buildMatrices(sub, segments || []);
    const W = buildWaits(sub, waits || []);
    const order = sub.map((_, i) => i); // orden tal cual el plan, no el óptimo
    const res = computeETAs(order, { sub, timeM, learned, W, closed: false }, startMin, 0);
    const last = res.etas.length ? res.etas[res.etas.length - 1] : null;
    return { horaTerminoMin: last ? last.etaMin : startMin, approx: last ? last.approx : false };
  }, [state?.done, state?.phase, state?.horaInicio, state?.startId, route.length, pending, allPoints, segments, waits]);

  return (
    <div>
      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
          <span>Progreso</span>
          <span className="font-mono normal-case text-slate-400">{route.length}/{total || route.length}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-rtb-gold-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={segmentLabel} value={segmentMin != null ? fmtMin(segmentMin) : "—"} />
        <Stat label="Tiempo en ruta" value={route.length > 0 ? fmtMin(elapsedMin) : "—"} />
        <Stat label="Prom. por parada" value={avgMin != null ? fmtMin(avgMin) : "—"} />
        <Stat label="Espera acumulada" value={fmtMin(waitMin)} />
        <Stat label="ETA término" value={etaInfo?.horaTerminoMin != null ? `${etaInfo.approx ? "≈ " : ""}${minToHHMM(etaInfo.horaTerminoMin)}` : "—"} />
      </div>
    </div>
  );
}
