// =====================================================================
// src/components/seguimiento/DriverCard.jsx
// Tarjeta de una ruta activa en el Seguimiento: identidad del chofer
// (color + iniciales), estadísticas en vivo, alerta de desviación y —
// detrás de un desplegable — la línea de tiempo completa, el editor
// del plan de pendientes y la caja de nota.
// =====================================================================
import { useState } from "react";
import { X, ChevronDown, Pencil, MessageSquare } from "lucide-react";
import { colorForDriver, initialsFor } from "../../lib/driverColor";
import StopTimeline from "./StopTimeline";
import LiveStats from "./LiveStats";
import DeviationAlert from "./DeviationAlert";
import PlanEditor from "./PlanEditor";
import DispatchNoteBox from "./DispatchNoteBox";

const PHASE_LABEL = { initial: "En espera", "at-stop": "En parada", "choose-next": "Eligiendo destino", traveling: "En camino" };

// Etiqueta de fase enriquecida con el destino/parada actual, cuando se
// conoce ("en camino a X" / "en parada Y") — antes solo mostraba la fase
// genérica.
function phaseText(state) {
  const phase = state.phase;
  const curStop = state.route?.length ? state.route[state.route.length - 1] : null;
  if (phase === "at-stop" && curStop) return `En parada · ${curStop.name}`;
  if (phase === "traveling" && state.nextStop) return `En camino a ${state.nextStop.name}`;
  return PHASE_LABEL[phase] ?? phase;
}

const Card = ({ children, className = "" }) => (
  <div className={"rounded-xl border border-slate-800 bg-slate-900/70 " + className}>{children}</div>
);

export default function DriverCard({ driverId, driverNombre, state, allPoints, segments, waits, onLiberar, onAddStop, onRemoveStop, onReorder, onSendNote }) {
  const [expanded, setExpanded] = useState(false);
  if (!state) return null;
  const { title, done } = state;
  const color = colorForDriver(driverId);
  const initials = initialsFor(driverNombre);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: color.bg, color: color.text, border: `1.5px solid ${color.stroke}` }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-200">{driverNombre ?? "Chofer"}</span>
              {done && <span className="rounded bg-teal-900/60 px-1.5 py-0.5 text-[10px] text-teal-300">Terminada</span>}
              <span className="text-[10px] text-slate-500">{phaseText(state)}</span>
            </div>
            <p className="truncate text-xs text-slate-400">{title}</p>
          </div>
        </div>
        {!done && (
          <button onClick={() => onLiberar(driverId)} className="shrink-0 text-slate-500 hover:text-rose-300" title="Liberar / cancelar">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="mt-3">
        <LiveStats state={state} allPoints={allPoints} segments={segments} waits={waits} />
      </div>

      {!done && (
        <div className="mt-2">
          <DeviationAlert state={state} allPoints={allPoints} segments={segments} waits={waits} />
        </div>
      )}

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-400 transition hover:text-slate-200"
      >
        <span className="flex items-center gap-1.5">
          Línea de tiempo{!done ? " · editar plan · mensajes" : ""}
          {state.notes?.length > 0 && (
            <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] font-bold text-white">
              {state.notes.length}
            </span>
          )}
        </span>
        <ChevronDown size={14} className={`transition ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          <StopTimeline state={state} />
          {!done && (
            <>
              <div>
                <h4 className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Pencil size={11} /> Editar pendientes
                </h4>
                <PlanEditor
                  driverId={driverId} driverNombre={driverNombre} state={state} allPoints={allPoints}
                  onAddStop={onAddStop} onRemoveStop={onRemoveStop} onReorder={onReorder}
                />
              </div>
              <div>
                <h4 className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <MessageSquare size={11} /> Mensajes con el chofer
                </h4>
                <DispatchNoteBox driverId={driverId} driverNombre={driverNombre} state={state} onSendNote={onSendNote} />
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
