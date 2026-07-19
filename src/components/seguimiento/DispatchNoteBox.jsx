// =====================================================================
// src/components/seguimiento/DispatchNoteBox.jsx
// Chat breve entre despacho y chofer, guardado en rutaDia.notes (unión
// append-only en el merge — ver src/lib/rutaActivaMerge.js: ambos lados
// escriben ahí sin pisarse). onSendNote además deja un aviso puntual
// (notice) que el chofer puede descartar sin confirmar.
// =====================================================================
import { useState } from "react";
import { Send } from "lucide-react";
import { fmtTime } from "./format";

export default function DispatchNoteBox({ driverId, driverNombre, state, onSendNote }) {
  const [text, setText] = useState("");
  const notes = state?.notes || [];

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendNote(driverId, driverNombre, trimmed);
    setText("");
  };

  return (
    <div className="space-y-2">
      {notes.length > 0 ? (
        <ul className="max-h-40 space-y-1.5 overflow-y-auto">
          {notes.map((n) => (
            <li key={n.id} className={`flex ${n.from === "driver" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${n.from === "driver" ? "bg-sky-500/15 text-sky-100" : "bg-rtb-gold-500/15 text-rtb-gold-100"}`}>
                <p>{n.text}</p>
                <p className="mt-0.5 text-[9px] text-slate-500">
                  {n.from === "driver" ? (driverNombre || "Chofer") : (n.byName || "Tú")} · {fmtTime(n.at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-600">Sin mensajes todavía.</p>
      )}
      <div className="flex gap-1.5">
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Nota para el chofer…"
          className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600"
        />
        <button
          onClick={send} disabled={!text.trim()}
          className="shrink-0 rounded bg-rtb-gold-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-rtb-gold-400 disabled:opacity-40"
          title="Enviar nota"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}
