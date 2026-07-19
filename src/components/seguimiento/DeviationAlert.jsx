// =====================================================================
// src/components/seguimiento/DeviationAlert.jsx
// Alerta de desviación al vuelo: nada persistido, se recalcula cada
// segundo comparando el tiempo real en parada/tramo contra lo esperado
// (aprendido de recorridos pasados). Ver computeDeviation en
// src/lib/rutaActivaMerge.js.
// =====================================================================
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { computeDeviation, DEVIATION_DEFAULTS } from "../../lib/rutaActivaMerge";
import { fmtMin } from "./format";

export default function DeviationAlert({ state, allPoints, segments, waits, threshold = DEVIATION_DEFAULTS }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state || state.done) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state?.done]);

  const dev = computeDeviation(state, { allPoints, segments, waits }, now, threshold);
  if (!dev) return null;

  const label = dev.kind === "wait"
    ? `Lleva ${fmtMin(dev.realMin)} en ${dev.pointName} (esperado ~${fmtMin(dev.expectedMin)})`
    : `Lleva ${fmtMin(dev.realMin)} camino a ${dev.pointName} (esperado ~${fmtMin(dev.expectedMin)}${dev.approx ? ", estimado" : ""})`;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
      <AlertTriangle size={14} className="shrink-0" />
      <span>{label}</span>
    </div>
  );
}
