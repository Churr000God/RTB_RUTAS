// =====================================================================
// src/components/seguimiento/PlanEditor.jsx
// Edición en vivo del plan de pendientes de una ruta en ejecución:
// agregar, quitar (no visitada) y reordenar. Opera sobre la lista
// VISIBLE (effectivePending) — las llamadas van a applyDispatchEdit
// (src/App.jsx), que relee el estado fresco del servidor antes de
// escribir, así que los índices/ids se resuelven ahí, no aquí.
// =====================================================================
import { useState } from "react";
import { Plus, X, ArrowUp, ArrowDown, Search } from "lucide-react";
import { effectivePending } from "../../lib/rutaActivaMerge";

export default function PlanEditor({ driverId, driverNombre, state, allPoints, onAddStop, onRemoveStop, onReorder }) {
  const [search, setSearch] = useState("");
  const pending = effectivePending(state);
  const pendingIds = new Set(pending.map((s) => s.id));
  const visitedIds = new Set((state?.route || []).map((s) => s.id));
  const q = search.trim().toLowerCase();
  const candidates = (allPoints || [])
    .filter((p) => !pendingIds.has(p.id) && !visitedIds.has(p.id) && (!q || p.name.toLowerCase().includes(q)))
    .slice(0, 8);

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {pending.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1.5 rounded border border-rtb-teal-100 bg-white px-2 py-1.5 text-xs">
            <span className="flex-1 truncate text-rtb-navy-mid">{s.name}</span>
            <button disabled={i === 0} onClick={() => onReorder(driverId, driverNombre, s.id, -1)}
              className="text-rtb-navy-mid hover:text-rtb-navy disabled:opacity-30" title="Subir"><ArrowUp size={12} /></button>
            <button disabled={i === pending.length - 1} onClick={() => onReorder(driverId, driverNombre, s.id, 1)}
              className="text-rtb-navy-mid hover:text-rtb-navy disabled:opacity-30" title="Bajar"><ArrowDown size={12} /></button>
            <button onClick={() => onRemoveStop(driverId, driverNombre, s)}
              className="text-rose-600 hover:text-rose-700" title="Quitar"><X size={12} /></button>
          </li>
        ))}
        {pending.length === 0 && <li className="py-1 text-center text-[11px] text-slate-400">Sin pendientes</li>}
      </ul>

      <div className="relative">
        <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Agregar parada…"
          className="w-full rounded border border-rtb-navy/15 bg-white py-1.5 pl-7 pr-2 text-xs text-rtb-navy placeholder:text-rtb-navy/35"
        />
      </div>
      {search.trim() && (
        <ul className="max-h-32 space-y-1 overflow-y-auto">
          {candidates.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => { onAddStop(driverId, driverNombre, p); setSearch(""); }}
                className="flex w-full items-center gap-1.5 rounded border border-rtb-teal-100 bg-white px-2 py-1 text-left text-xs text-rtb-navy-mid hover:border-rtb-gold-500/40 hover:text-rtb-gold-700"
              >
                <Plus size={11} className="shrink-0 text-rtb-gold-700" /> {p.name}
              </button>
            </li>
          ))}
          {candidates.length === 0 && <li className="py-1 text-center text-[11px] text-slate-400">Sin resultados</li>}
        </ul>
      )}
    </div>
  );
}
