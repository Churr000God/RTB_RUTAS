// =====================================================================
// src/components/seguimiento/StopTimeline.jsx
// Línea de tiempo de una ruta activa: paradas visitadas (con hora de
// llegada/salida y tiempo de espera), la parada/tramo actual resaltados,
// y las pendientes en el orden del plan (effectivePending — ver
// src/lib/rutaActivaMerge.js: excluye lo ya consumido del plan crudo).
// =====================================================================
import { CheckCircle2, MapPin } from "lucide-react";
import { effectivePending } from "../../lib/rutaActivaMerge";
import { fmtTime, fmtMin } from "./format";

export default function StopTimeline({ state }) {
  const route = state?.route || [];
  const pending = effectivePending(state);
  const phase = state?.phase;

  return (
    <ul className="space-y-1.5">
      {route.map((s, i) => {
        const waitMin = s.arrivedAt && s.departedAt
          ? Math.max(0, Math.round((s.departedAt - s.arrivedAt) / 60000) - (s.waitBreakMin || 0))
          : null;
        const isCurrent = i === route.length - 1 && phase === "at-stop";
        return (
          <li key={`v-${i}`} className={`flex flex-wrap items-center gap-2 rounded border px-2.5 py-1.5 text-xs ${isCurrent ? "border-rtb-gold-300 bg-rtb-gold-50" : "border-rtb-teal-200 bg-rtb-teal-50"}`}>
            <CheckCircle2 size={13} className={`shrink-0 ${isCurrent ? "text-rtb-gold-700" : "text-rtb-teal-700"}`} />
            <span className={`flex-1 ${isCurrent ? "text-rtb-gold-700" : "text-rtb-teal-700"}`}>{s.name}</span>
            <span className="font-mono text-[10px] text-rtb-navy-mid">
              {fmtTime(s.arrivedAt)}{s.departedAt ? ` – ${fmtTime(s.departedAt)}` : isCurrent ? " · en parada" : ""}
            </span>
            {waitMin != null && <span className="font-mono text-[10px] text-slate-400">({fmtMin(waitMin)})</span>}
          </li>
        );
      })}

      {phase === "traveling" && state?.nextStop && (
        <li className="flex items-center gap-2 rounded border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs">
          <MapPin size={13} className="shrink-0 text-sky-700" />
          <span className="flex-1 text-sky-700">{state.nextStop.name}</span>
          <span className="text-[10px] text-sky-700">En camino</span>
        </li>
      )}

      {pending.map((s, i) => (
        <li key={`p-${s.id}`} className="flex items-center gap-2 rounded border border-rtb-teal-100 bg-white px-2.5 py-1.5 text-xs">
          <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-rtb-navy-mid">{i + 1}</span>
          <span className="flex-1 text-rtb-navy-mid">{s.name}</span>
        </li>
      ))}

      {route.length === 0 && pending.length === 0 && (
        <li className="rounded border border-dashed border-rtb-teal-100 px-2.5 py-3 text-center text-xs text-slate-400">Sin paradas</li>
      )}
    </ul>
  );
}
