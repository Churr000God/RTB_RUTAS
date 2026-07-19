// =====================================================================
// src/components/registrar/RegistrarTab.jsx
// Pestaña "Registrar recorrido": captura manual de un recorrido real
// (orden, tiempos, esperas, comida) — alimenta el aprendizaje. Guarda
// borradores en localStorage mientras se captura.
// =====================================================================
import { useState } from "react";
import { FileText, Trash2, Save, Plus, X } from "lucide-react";
import { Card, Btn, Field, inputCls, Empty } from "../ui";
import { TYPE_META } from "../../lib/constants";
import { DOW } from "../../lib/routing";

/* ============================================================
   Tab: Registrar recorrido
   ============================================================ */
const DRAFT_KEY = "rtb_drafts";

export default function RegistrarTab({ points, onAddRecorrido }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [seq, setSeq] = useState([]);
  const [pick, setPick] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "[]"); }
    catch { return []; }
  });
  const [activeDraftId, setActiveDraftId] = useState(null);

  const pointName = (id) => points.find((p) => p.id === id)?.name ?? "—";

  const persistDrafts = (list) => {
    setDrafts(list);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(list));
  };

  const saveDraft = () => {
    if (seq.length === 0) return;
    const now = new Date().toISOString();
    if (activeDraftId) {
      persistDrafts(drafts.map((d) => d.id === activeDraftId ? { ...d, dateISO: date, seq, savedAt: now } : d));
    } else {
      const nd = { id: Date.now().toString(), dateISO: date, seq, savedAt: now };
      persistDrafts([...drafts, nd]);
      setActiveDraftId(nd.id);
    }
  };

  const loadDraft = (draft) => {
    setDate(draft.dateISO);
    setSeq(draft.seq);
    setActiveDraftId(draft.id);
    setPick("");
  };

  const deleteDraft = (id) => {
    persistDrafts(drafts.filter((d) => d.id !== id));
    if (activeDraftId === id) { setActiveDraftId(null); setSeq([]); setDate(today); setPick(""); }
  };

  const newForm = () => { setSeq([]); setDate(today); setPick(""); setActiveDraftId(null); };

  const [breakMin, setBreakMin] = useState("");
  const [breakNote, setBreakNote] = useState("");
  const [breakAfter, setBreakAfter] = useState(""); // índice del stop tras el que ocurrió la comida

  const addStop = () => { if (!pick) return; setSeq([...seq, { point: pick, legMin: "", legKm: "", waitMin: "" }]); setPick(""); };
  const update = (i, k, v) => setSeq(seq.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)));
  const removeStop = (i) => setSeq(seq.filter((_, idx) => idx !== i));

  const save = async () => {
    if (seq.length < 2 || busy) return;
    const ts = new Date(date + "T12:00:00").getTime();
    const bkMin = breakMin !== "" && !isNaN(+breakMin) && +breakMin > 0 ? +breakMin : null;
    const bkIdx = breakAfter !== "" ? +breakAfter : null;
    const stops = seq.map((s, i) => ({
      point: s.point,
      legMin: i > 0 && s.legMin !== "" && !isNaN(+s.legMin) ? +s.legMin : null,
      legKm: i > 0 && s.legKm !== "" && !isNaN(+s.legKm) ? +s.legKm : null,
      waitMin: s.waitMin !== "" && !isNaN(+s.waitMin) ? +s.waitMin : null,
      // La comida se asigna como waitBreakMin en la parada elegida (ocurrió estando ahí)
      waitBreakMin: bkMin != null && bkIdx === i ? bkMin : null,
      breakNote: bkMin != null && bkIdx === i ? (breakNote.trim() || null) : null,
    }));
    setBusy(true);
    try {
      await onAddRecorrido({ dateISO: date, ts, stops });
      if (activeDraftId) {
        persistDrafts(drafts.filter((d) => d.id !== activeDraftId));
        setActiveDraftId(null);
      }
      setSeq([]); setBreakMin(""); setBreakNote(""); setBreakAfter("");
      setDone(true); setTimeout(() => setDone(false), 2500);
    } finally { setBusy(false); }
  };

  if (points.length < 2) return <Card className="p-6"><Empty>Necesitas al menos 2 puntos. Créalos en <span className="text-rtb-gold-400">Puntos</span>.</Empty></Card>;

  return (
    <div className="space-y-4">
      {/* Lista de borradores */}
      {drafts.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <FileText size={15} className="text-slate-400" /> Borradores guardados
          </h2>
          <ul className="space-y-2">
            {drafts.map((d) => {
              const isActive = activeDraftId === d.id;
              return (
                <li key={d.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${isActive ? "border-rtb-gold-500/50 bg-rtb-gold-500/5" : "border-slate-800 bg-slate-950/50"}`}>
                  <FileText size={14} className={isActive ? "text-rtb-gold-400 shrink-0" : "text-slate-600 shrink-0"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-200">{d.dateISO}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{d.seq.length} paradas</span>
                      {isActive && <span className="rounded bg-rtb-gold-500/10 px-1.5 py-0.5 text-[10px] text-rtb-gold-400">editando</span>}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">
                      {d.seq.map((s) => pointName(s.point)).join(" → ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!isActive && (
                      <Btn variant="ghost" onClick={() => loadDraft(d)} className="py-1 px-2 text-xs">Continuar</Btn>
                    )}
                    <button onClick={() => deleteDraft(d.id)} className="p-1 text-slate-600 hover:text-rose-400"><Trash2 size={14} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Formulario */}
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Fecha del recorrido">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <span className="rounded-md bg-slate-800 px-2 py-1 font-mono text-xs text-slate-400">{DOW[new Date(date + "T12:00:00").getDay()]}</span>
          {activeDraftId && (
            <button onClick={newForm} className="ml-auto text-xs text-slate-500 hover:text-slate-300">
              + Nuevo recorrido
            </button>
          )}
        </div>
        <p className="mb-3 text-xs text-slate-500">Arma el recorrido en el orden real. Captura el <span className="text-teal-400">tiempo de manejo</span> de cada tramo y la <span className="text-sky-400">espera</span> en cada parada. Cada guardado alimenta el aprendizaje y queda disponible para el análisis de ahorro.</p>
        {seq.length > 0 && (
          <ol className="mb-4 space-y-2">
            {seq.map((s, i) => (
              <li key={i} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rtb-gold-500 text-xs font-bold text-slate-950">{i + 1}</span>
                  <span className="text-sm text-slate-200">{pointName(s.point)}</span>
                  <button onClick={() => removeStop(i)} className="ml-auto text-slate-600 hover:text-rose-400"><X size={15} /></button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label={i === 0 ? "Tramo (n/a)" : "Tramo (min)"}><input className={inputCls} disabled={i === 0} value={s.legMin} onChange={(e) => update(i, "legMin", e.target.value)} placeholder={i === 0 ? "—" : "14"} /></Field>
                  <Field label="Distancia (km)"><input className={inputCls} disabled={i === 0} value={s.legKm} onChange={(e) => update(i, "legKm", e.target.value)} placeholder="opcional" /></Field>
                  <Field label="Espera (min)"><input className={inputCls} value={s.waitMin} onChange={(e) => update(i, "waitMin", e.target.value)} placeholder="5" /></Field>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Agregar parada">
            <select className={inputCls + " min-w-[200px]"} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Selecciona un punto…</option>
              {points.map((p) => <option key={p.id} value={p.id}>{p.name} · {TYPE_META[p.type].label}</option>)}
            </select>
          </Field>
          <Btn variant="ghost" onClick={addStop} disabled={!pick}><Plus size={16} /> Agregar al recorrido</Btn>
          <div className="ml-auto flex items-center gap-3">
            {done && <span className="text-xs text-teal-400">✓ Guardado y aprendido</span>}
            <Btn variant="ghost" onClick={saveDraft} disabled={seq.length === 0}><Save size={16} /> Guardar borrador</Btn>
            <Btn onClick={save} disabled={seq.length < 2 || busy}><Save size={16} /> Guardar recorrido</Btn>
          </div>
        </div>

        {/* Bloque comida — opcional, no contamina tramos ni esperas */}
        {seq.length >= 2 && (
          <div className="mt-4 rounded-lg border border-orange-900/40 bg-orange-950/10 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-orange-300">
              <span>🍽</span> Comida del día <span className="font-normal text-slate-500">(opcional · no afecta el aprendizaje)</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label="Duración (min)">
                <input className={inputCls} type="number" min="0" value={breakMin}
                  onChange={(e) => setBreakMin(e.target.value)} placeholder="60" />
              </Field>
              <Field label="¿En cuál parada comiste?">
                <select className={inputCls} value={breakAfter} onChange={(e) => setBreakAfter(e.target.value)}>
                  <option value="">Elige una parada…</option>
                  {seq.map((s, i) => <option key={i} value={i}>{i + 1}. {pointName(s.point)}</option>)}
                </select>
              </Field>
              <Field label="Nota del lugar (opcional)">
                <input className={inputCls} value={breakNote}
                  onChange={(e) => setBreakNote(e.target.value)} placeholder="Ej. Tacos calle Reforma" />
              </Field>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
