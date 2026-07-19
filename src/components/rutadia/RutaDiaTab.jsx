// =====================================================================
// src/components/rutadia/RutaDiaTab.jsx
// Pestaña "Ruta del día" (todos los roles): ejecución de la ruta activa
// del chofer — fases, mapa, ETAs, comida, chat con despacho — y la
// pantalla de asignación/carga para admin/supervisor cuando no hay
// ruta en curso.
// =====================================================================
import { useState, useEffect, useMemo, Suspense } from "react";
import {
  BookMarked, Calendar, CheckCircle2, ChevronDown, ChevronRight, Flag,
  GitCompare, Info, MapPin, Map as MapIcon, MessageSquare, Navigation,
  Pencil, Plus, Save, Search, Send, Trash2, Users, X, Zap,
} from "lucide-react";
import { Card, Btn, Field, inputCls, Empty, Stat } from "../ui";
import { LeafletMap, RouteMap, MapFallback } from "../maps";
import { TYPE_META, ESTADO_ENTREGA } from "../../lib/constants";
import { fmtMin, fmtKm, fmtTime, genEditId } from "../../lib/utils";
import {
  buildMatrices, buildWaits, solveTSP, tourCost, computeETAs, parseHHMM, minToHHMM,
} from "../../lib/routing";
import { mergeRutaActiva, effectivePending } from "../../lib/rutaActivaMerge";
import { useConfirm, useToast } from "../feedback";

const googleMapsDirUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

/**
 * Banner en la pantalla del chofer: aviso puntual del despacho (p. ej. "se
 * agregó una parada" o "nuevo mensaje"). El chofer lo descarta SIN confirmar
 * — solo oculta el aviso para él (noticeAckAt, grupo driver); el despacho
 * sigue viéndolo en su historial. La conversación en sí vive en NotesChat.
 */
const DispatchBanner = ({ notice, ackedAt, onDismiss }) => {
  if (!notice || notice.at <= (ackedAt ?? 0)) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-rtb-gold-500/40 bg-rtb-gold-500/10 px-3 py-2 text-xs text-rtb-gold-200">
      <Info size={14} className="mt-0.5 shrink-0" />
      <span className="flex-1">{notice.text}</span>
      <button onClick={onDismiss} className="shrink-0 text-rtb-gold-400 hover:text-rtb-gold-200" title="Descartar">
        <X size={13} />
      </button>
    </div>
  );
};

/**
 * Pequeño chat entre despacho y chofer, guardado en `rutaDia.notes` (unión
 * append-only en el merge — ver rutaActivaMerge.js: ambos lados pueden
 * escribir ahí sin pisarse, cada mensaje se identifica por `id`). Cada
 * entrada trae `from: "dispatch" | "driver"` para alinear la burbuja.
 */
const NotesChat = ({ notes, onSend }) => {
  const [text, setText] = useState("");
  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };
  return (
    <Card className="p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <MessageSquare size={12} /> Mensajes con despacho
      </h3>
      {notes.length > 0 ? (
        <ul className="mb-2 max-h-48 space-y-1.5 overflow-y-auto">
          {notes.map((n) => (
            <li key={n.id} className={`flex ${n.from === "driver" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${n.from === "driver" ? "bg-rtb-gold-500/15 text-rtb-gold-100" : "bg-slate-800 text-slate-300"}`}>
                <p>{n.text}</p>
                <p className="mt-0.5 text-[9px] text-slate-500">{n.from === "driver" ? "Tú" : (n.byName || "Despacho")} · {fmtTime(n.at)}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-[11px] text-slate-600">Sin mensajes todavía.</p>
      )}
      <div className="flex gap-1.5">
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Responder al despacho…"
          className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600"
        />
        <button onClick={send} disabled={!text.trim()}
          className="shrink-0 rounded bg-rtb-gold-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-rtb-gold-400 disabled:opacity-40"
          title="Enviar">
          <Send size={12} />
        </button>
      </div>
    </Card>
  );
};

/* ============================================================
   Tab: Ruta del día
   ============================================================ */
/* Panel de una parada: mapa solo lectura + botón "Ir" (Google Maps) + nota + estado de entrega. */
function StopInfoPanel({ point, nota, onNotaChange, estado, onEstadoChange, showNotaEstado = true }) {
  const [open, setOpen] = useState(true);
  const hasCoords = point?.lat != null && point?.lng != null;
  return (
    <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/40">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <span className="flex items-center gap-1.5"><MapIcon size={13} /> Detalle de la parada</span>
        <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-800 px-3 py-3">
          {hasCoords ? (
            <Suspense fallback={<MapFallback className="h-36 w-full rounded-lg" />}>
              <LeafletMap className="h-36 w-full overflow-hidden rounded-lg" lat={point.lat} lng={point.lng} />
            </Suspense>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-800 bg-slate-950/30 px-3 py-4 text-center text-xs text-slate-500">
              Este punto no tiene coordenadas registradas.
            </p>
          )}
          <a
            href={hasCoords ? googleMapsDirUrl(point.lat, point.lng) : undefined}
            target="_blank" rel="noreferrer"
            onClick={(e) => { if (!hasCoords) e.preventDefault(); }}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${hasCoords ? "bg-sky-600 text-white hover:bg-sky-500" : "cursor-not-allowed bg-slate-800 text-slate-600"}`}
          >
            <Navigation size={15} /> Ir (Google Maps)
          </a>
          {showNotaEstado && (
            <>
              <Field label="Nota de la parada (opcional)">
                <input className={inputCls} value={nota} onChange={(e) => onNotaChange(e.target.value)} placeholder="Ej. Dejar en recepción" />
              </Field>
              <Field label="Estado de entrega">
                <select className={inputCls} value={estado} onChange={(e) => onEstadoChange(e.target.value)}>
                  {ESTADO_ENTREGA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function RutaDiaTab({ rutaDia, setRutaDia, onSaveRuta, allPoints, segments, waits, rutasGuardadas = [], onLoadRutaGuardada, onUpdateRutaGuardada, onDeleteRutaGuardada, isAdmin = false, profile = null, profiles = [], online = true, syncOk = true }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [extraSearch, setExtraSearch] = useState("");
  // Pausa/comida — estado local transitorio
  const [onBreak, setOnBreak] = useState(false);
  const [breakStart, setBreakStart] = useState(null);
  const [breakNoteInput, setBreakNoteInput] = useState("");
  const [pendingLegBreakMin, setPendingLegBreakMin] = useState(0); // acumulado en viaje
  // Editor de rutas guardadas (solo admin)
  const [editId, setEditId] = useState(null);
  const [editStops, setEditStops] = useState([]);
  const [editSearch, setEditSearch] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  // Deshacer última acción, resumen colapsable y cronómetro en vivo
  const [prevSnapshot, setPrevSnapshot] = useState(null);
  const [showResumen, setShowResumen] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Datos derivados de rutaDia con defaults seguros (rutaDia puede ser null aquí:
  // todos los Hooks de abajo deben poder correr igual antes del early return).
  const route = rutaDia?.route ?? [];
  // `remaining` es el plan de pendientes derivado (effectivePending): el plan
  // en sí (rutaDia.remaining) es propiedad del despacho — el chofer NUNCA lo
  // escribe directamente. Elegir/llegar/cambiar destino solo mueve el estado
  // driver (route/phase/nextStop); lo "consumido" se resta aquí, no se borra
  // del plan (así una edición del despacho nunca choca con el progreso del
  // chofer). Ver src/lib/rutaActivaMerge.js.
  const remaining = useMemo(
    () => effectivePending(rutaDia),
    [rutaDia?.remaining, rutaDia?.route, rutaDia?.phase, rutaDia?.nextStop]
  );
  const phase = rutaDia?.phase ?? null;
  const startId = rutaDia?.startId ?? null;
  const startName = rutaDia?.startName ?? "";
  const closed = rutaDia?.closed ?? false;
  const curStop = route.length > 0 ? route[route.length - 1] : null;

  // Cronómetro: re-renderiza cada segundo mientras la ruta esté en curso.
  useEffect(() => {
    if (!rutaDia || rutaDia.done || route.length === 0) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [rutaDia?.done, route.length]);

  // Orden sugerido de las paradas restantes, resuelto en vivo desde el origen
  // actual (última parada visitada, o el inicio si aún no arranca). Reutiliza
  // el mismo motor de ruteo que "Generación y carga de rutas".
  const suggested = useMemo(() => {
    if (!rutaDia || rutaDia.done) return null;
    const originId = curStop ? curStop.id : startId;
    if (!originId) return null;
    const ids = [originId, ...remaining.map((s) => s.id)];
    const sub = ids.map((id) => (allPoints || []).find((p) => p.id === id));
    if (sub.some((p) => !p)) return null;
    const n = sub.length;
    if (n < 2) return { orderIds: [], sub, order: [0], timeM: null, distM: null, learned: null, W: null };
    const { timeM, distM, learned } = buildMatrices(sub, segments || []);
    const W = buildWaits(sub, waits || []);
    const gap = (M) => { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && M[i][j] == null) return true; return false; };
    if (gap(timeM)) return { orderIds: [], sub, order: sub.map((_, i) => i), timeM: null, distM: null, learned: null, W: null };
    const solved = solveTSP(timeM, n, false);
    const order = solved ? solved.order : sub.map((_, i) => i);
    return { orderIds: order.slice(1).map((i) => sub[i].id), sub, order, timeM, distM, learned, W };
  }, [rutaDia?.done, curStop?.id, startId, remaining, allPoints, segments, waits]);

  // ETA por parada restante + hora estimada de término (siempre visible).
  const etaInfo = useMemo(() => {
    if (!rutaDia || rutaDia.done) return null;
    const originId = curStop ? curStop.id : startId;
    if (!originId) return null;
    const originPoint = (allPoints || []).find((p) => p.id === originId);
    if (!originPoint) return null;
    const nowD = new Date();
    const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
    const startMin = phase === "initial" && rutaDia.horaInicio
      ? (parseHHMM(rutaDia.horaInicio) ?? nowMin)
      : nowMin;

    let horaMin = startMin;
    let approx = false;
    let etas = [];
    if (suggested?.timeM && suggested.orderIds.length) {
      const { sub, timeM, learned, W, order } = suggested;
      const res = computeETAs(order, { sub, timeM, learned, W, closed: false }, startMin, 0);
      etas = res.etas;
      horaMin = etas.length ? etas[etas.length - 1].etaMin : startMin;
      approx = etas.length ? etas[etas.length - 1].approx : false;
    }
    if (closed) {
      const lastId = etas.length ? etas[etas.length - 1].id : originId;
      const depotPoint = (allPoints || []).find((p) => p.id === startId);
      const lastPoint = lastId === originId ? originPoint : (allPoints || []).find((p) => p.id === lastId);
      if (depotPoint && lastPoint && lastPoint.id !== depotPoint.id) {
        const { timeM: retM, learned: retL } = buildMatrices([lastPoint, depotPoint], segments || []);
        if (retM[0][1] != null) { horaMin += retM[0][1]; if (!retL[0][1]) approx = true; }
      }
    }
    return { etas, horaTerminoMin: horaMin, approxTermino: approx };
  }, [rutaDia?.done, rutaDia?.horaInicio, curStop?.id, startId, phase, closed, suggested, allPoints, segments]);

  // Paradas (visitadas + pendientes en orden sugerido) para el mapa del resumen.
  const resumenMapStops = useMemo(() => {
    if (!rutaDia) return [];
    const byId = (id) => (allPoints || []).find((p) => p.id === id);
    const visited = route.map((s) => { const p = byId(s.id); return { id: s.id, name: s.name, lat: p?.lat, lng: p?.lng }; });
    const pendingIds = suggested?.orderIds?.length ? suggested.orderIds : remaining.map((s) => s.id);
    const pending = pendingIds.map((id) => {
      const s = remaining.find((r) => r.id === id);
      const p = byId(id);
      return { id, name: s?.name || p?.name || "", lat: p?.lat, lng: p?.lng };
    });
    return [...visited, ...pending];
  }, [rutaDia, route, remaining, suggested, allPoints]);

  // Resumen detallado para la pantalla de cierre.
  const doneSummary = useMemo(() => {
    if (!rutaDia?.done) return null;
    const r = rutaDia.route || [];
    if (r.length < 2) return null;
    let totMin = 0, totKm = 0, totWaitMin = 0, totComidaMin = 0;
    for (let i = 0; i < r.length; i++) {
      const s = r[i];
      totComidaMin += (s.legBreakMin || 0) + (s.waitBreakMin || 0);
      if (i > 0) {
        const prev = r[i - 1];
        if (prev.departedAt && s.arrivedAt) {
          totMin += Math.max(0, Math.round((s.arrivedAt - prev.departedAt) / 60000) - (s.legBreakMin || 0));
        }
        if (s.legKm && !isNaN(+s.legKm)) totKm += +s.legKm;
      }
      if (s.arrivedAt && s.departedAt) {
        totWaitMin += Math.max(0, Math.round((s.departedAt - s.arrivedAt) / 60000) - (s.waitBreakMin || 0));
      }
    }
    const lastTs = r[r.length - 1].departedAt || r[r.length - 1].arrivedAt;
    const totalMinRuta = r[0].arrivedAt && lastTs ? Math.round((lastTs - r[0].arrivedAt) / 60000) : null;

    let delta = null;
    const sub = r.map((s) => (allPoints || []).find((p) => p.id === s.id));
    if (sub.every(Boolean) && sub.length >= 2) {
      const { timeM } = buildMatrices(sub, segments || []);
      const n = sub.length;
      const gap = (M) => { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && M[i][j] == null) return true; return false; };
      if (!gap(timeM)) {
        const realOrder = sub.map((_, i) => i);
        const realCost = tourCost(realOrder, timeM, rutaDia.closed);
        const opt = solveTSP(timeM, n, rutaDia.closed);
        if (opt) delta = Math.max(0, realCost - opt.cost);
      }
    }
    return { totMin, totKm, totWaitMin, totComidaMin, totalMinRuta, visitedCount: r.length, delta };
  }, [rutaDia?.done, rutaDia?.route, rutaDia?.closed, allPoints, segments]);

  const startEdit = (r) => { setEditId(r.id); setEditStops(r.stops); setEditSearch(""); setEditAssignedTo(r.assignedTo ?? ""); };
  const cancelEdit = () => { setEditId(null); setEditStops([]); setEditSearch(""); setEditAssignedTo(null); };
  const saveEdit = async (r) => {
    if (editStops.length < 2) return;
    setEditSaving(true);
    try {
      await onUpdateRutaGuardada(r.id, { nombre: r.nombre, fecha: r.fecha, closed: r.closed, stops: editStops, assignedTo: editAssignedTo || null, horaInicio: r.horaInicio ?? null });
      cancelEdit();
    } catch (e) { console.error(e); toast("No se pudo guardar la ruta.", { type: "error" }); }
    finally { setEditSaving(false); }
  };

  if (!rutaDia) {
    return (
      <div className="space-y-4">
        <Card className="p-6">
          <Empty>
            {isAdmin
              ? <>No tienes una ruta en curso. Si ya asignaste una, aparece abajo — presiona <span className="text-rtb-gold-400">"Cargar"</span>. Para crear y asignar una nueva ve a <span className="text-rtb-gold-400">Generación y carga de rutas</span>.</>
              : <>No tienes una ruta asignada en curso. Cuando el despachador te asigne una aparecerá abajo — presiona <span className="text-rtb-gold-400">"Cargar"</span> para iniciarla.</>}
          </Empty>
        </Card>
        {rutasGuardadas.length > 0 && (
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <BookMarked size={15} className="text-rtb-gold-400" /> Rutas guardadas
            </h3>
            <ul className="space-y-2">
              {rutasGuardadas.map((r) => (
                <li key={r.id} className="rounded-lg border border-slate-700 bg-slate-800/50">
                  {editId === r.id ? (
                    /* ---- Editor inline ---- */
                    <div className="p-3 space-y-3">
                      <p className="text-xs font-semibold text-rtb-gold-300">Editando: {r.nombre}</p>

                      {/* Lista de paradas actuales con botón quitar */}
                      <ul className="space-y-1">
                        {editStops.map((s, idx) => (
                          <li key={idx} className="flex items-center gap-2 rounded border border-slate-700 bg-slate-900/60 px-2.5 py-1.5">
                            <span className="flex-1 text-xs text-slate-200">{s.name}</span>
                            {idx === 0
                              ? <span className="text-[10px] text-slate-500">inicio</span>
                              : (
                                <button
                                  onClick={() => setEditStops((prev) => prev.filter((_, i) => i !== idx))}
                                  className="text-rose-400 hover:text-rose-300"
                                  title="Quitar parada"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )
                            }
                          </li>
                        ))}
                      </ul>

                      {/* Buscador para agregar punto */}
                      <div>
                        <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Agregar parada</p>
                        <div className="relative mb-1">
                          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                          <input
                            className={inputCls + " pl-8 text-xs"}
                            placeholder="Buscar punto…"
                            value={editSearch}
                            onChange={(e) => setEditSearch(e.target.value)}
                          />
                        </div>
                        {editSearch.trim() && (() => {
                          const editStopIds = new Set(editStops.map((s) => s.id));
                          const filtered = (allPoints || []).filter(
                            (p) => !editStopIds.has(p.id) && p.name.toLowerCase().includes(editSearch.trim().toLowerCase())
                          );
                          return filtered.length > 0 ? (
                            <ul className="max-h-36 space-y-1 overflow-y-auto">
                              {filtered.map((p) => (
                                <li key={p.id}>
                                  <button
                                    onClick={() => { setEditStops((prev) => [...prev, { id: p.id, name: p.name }]); setEditSearch(""); }}
                                    className="flex w-full items-center gap-2 rounded border border-slate-700 bg-slate-900/60 px-2.5 py-1.5 text-left hover:border-slate-500"
                                  >
                                    <span className={`h-2 w-2 shrink-0 rounded-full ${TYPE_META[p.type]?.dot ?? "bg-slate-400"}`} />
                                    <span className="flex-1 text-xs text-slate-200">{p.name}</span>
                                    <Plus size={12} className="text-slate-500" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-slate-500">Sin resultados.</p>
                          );
                        })()}
                      </div>

                      {/* Selector de asignación */}
                      {profiles.length > 0 && (
                        <div>
                          <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Asignar a chofer</p>
                          <select
                            className={inputCls + " text-xs"}
                            value={editAssignedTo ?? ""}
                            onChange={(e) => setEditAssignedTo(e.target.value || null)}
                          >
                            <option value="">— Sin asignar (cualquiera) —</option>
                            {profiles.map((p) => (
                              <option key={p.userId} value={p.userId}>{p.nombre} ({p.role})</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Acciones */}
                      <div className="flex gap-2">
                        <Btn onClick={() => saveEdit(r)} disabled={editSaving || editStops.length < 2} className="py-1 px-3 text-xs">
                          <Save size={12} /> {editSaving ? "Guardando…" : "Guardar"}
                        </Btn>
                        <Btn variant="ghost" onClick={cancelEdit} className="py-1 px-3 text-xs">Cancelar</Btn>
                      </div>
                    </div>
                  ) : (
                    /* ---- Vista normal ---- */
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-200">{r.nombre}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                          {r.fecha && (
                            <span className="flex items-center gap-1">
                              <Calendar size={11} /> {r.fecha}
                            </span>
                          )}
                          <span>{r.stops.length} paradas</span>
                          {r.stops.length > 0 && (
                            <span className="text-slate-600">
                              {r.stops[0]?.name} → {r.stops[r.stops.length - 1]?.name}
                            </span>
                          )}
                          <span className="text-slate-600">{r.closed ? "Cerrada" : "Abierta"}</span>
                          {isAdmin && r.assignedTo && (
                            <span className="flex items-center gap-1 text-rtb-gold-600">
                              <Users size={10} />
                              {profiles.find((p) => p.userId === r.assignedTo)?.nombre ?? "Chofer asignado"}
                            </span>
                          )}
                          {isAdmin && !r.assignedTo && (
                            <span className="text-slate-700">Sin asignar</span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Btn onClick={() => onLoadRutaGuardada(r)} className="py-1 px-2.5 text-xs">
                          <Navigation size={13} /> Cargar
                        </Btn>
                        {isAdmin && (
                          <>
                            <Btn
                              variant="ghost"
                              onClick={() => startEdit(r)}
                              className="py-1 px-2 text-slate-400 hover:text-slate-200"
                              title="Editar paradas"
                            >
                              <Pencil size={13} />
                            </Btn>
                            <Btn
                              variant="ghost"
                              onClick={async () => { if (await confirm({ message: `¿Eliminar "${r.nombre}"?`, confirmLabel: "Eliminar", danger: true })) onDeleteRutaGuardada(r.id); }}
                              className="py-1 px-2 text-rose-400 hover:text-rose-300"
                            >
                              <Trash2 size={13} />
                            </Btn>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    );
  }

  const { title, endId, nextStop, nextLegKm, done } = rutaDia;
  const patch = (updates) => setRutaDia({ ...rutaDia, ...updates });
  const patchCurStop = (fields) => {
    patch({ route: route.map((s, i) => i === route.length - 1 ? { ...s, ...fields } : s) });
  };
  const withSnapshot = (fn) => (...args) => { setPrevSnapshot(rutaDia); fn(...args); };

  // Respuesta del chofer en el chat con el despacho. `notes` se fusiona por
  // unión (no por dueño de grupo — ver rutaActivaMerge.js), así que ambos
  // lados pueden escribir ahí sin pisarse aunque esta escritura viaje por
  // el mismo camino que el resto del progreso del chofer (updateRutaDia).
  const sendDriverNote = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const entry = { id: genEditId(), at: Date.now(), by: profile?.userId ?? null, byName: profile?.nombre ?? null, from: "driver", text: trimmed };
    patch({ notes: [...(rutaDia.notes || []), entry].slice(-50) });
  };

  /* Puntos disponibles como "extra" (no planificados, no visitados, no el inicio) */
  const visitedIds = new Set(route.map((s) => s.id));
  const remainingIds = new Set(remaining.map((s) => s.id));
  const extraPoints = (allPoints || []).filter(
    (p) => !visitedIds.has(p.id) && !remainingIds.has(p.id) && p.id !== startId
  );

  const totalPlanned = route.length + remaining.length;
  const elapsedMin = route.length > 0 && route[0].arrivedAt ? Math.max(0, Math.round((nowTick - route[0].arrivedAt) / 60000)) : 0;

  const saveRoute = async (finalRoute) => {
    if (finalRoute.length < 2) { setErr("Se necesitan al menos 2 paradas para guardar."); return; }
    const _d = new Date();
    const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,"0")}-${String(_d.getDate()).padStart(2,"0")}`;
    const recStops = finalRoute.map((stop, i) => {
      const prev = i > 0 ? finalRoute[i - 1] : null;
      const rawLeg = i > 0 && prev?.departedAt && stop.arrivedAt
        ? Math.round((stop.arrivedAt - prev.departedAt) / 60000) : null;
      const legBreakMin = stop.legBreakMin > 0 ? stop.legBreakMin : null;
      const legMin = rawLeg != null ? Math.max(0, rawLeg - (legBreakMin || 0)) : null;
      const legKm = i > 0 && stop.legKm !== "" && !isNaN(+stop.legKm) ? +stop.legKm : null;
      const rawWait = stop.arrivedAt && stop.departedAt
        ? Math.round((stop.departedAt - stop.arrivedAt) / 60000) : null;
      const waitBreakMin = stop.waitBreakMin > 0 ? stop.waitBreakMin : null;
      const waitMin = rawWait != null ? Math.max(0, rawWait - (waitBreakMin || 0)) : null;
      return {
        point: stop.id, legMin, legKm, waitMin,
        legBreakMin, waitBreakMin,
        breakNote: stop.breakNote || null,
        nota: stop.nota || null,
        estado: stop.estado || null,
      };
    });
    setSaving(true); setErr("");
    try {
      // El registro de ediciones del despacho (agregó/quitó/reordenó/nota) se
      // persiste con el recorrido — queda como historial aunque ruta_activa
      // se borre al terminar. Requiere recorridos.edit_log (ver supabase/
      // migrations/2026-07-seguimiento-ruta.sql); si no se aplicó, addRecorrido
      // reintenta sin la columna y el log simplemente no se conserva.
      await onSaveRuta({ dateISO: today, ts: Date.now(), stops: recStops, editLog: rutaDia.editLog || [], driverId: profile?.userId ?? null });
      patch({ route: finalRoute, done: true });
      setPrevSnapshot(null);
    } catch { setErr("Error al guardar. Intenta de nuevo."); }
    finally { setSaving(false); }
  };

  /* -------- Handlers por fase -------- */
  const handleInitialArrival = withSnapshot(() => {
    patch({
      route: [{ id: startId, name: startName, arrivedAt: Date.now(), departedAt: null, legKm: "" }],
      phase: "at-stop",
    });
  });

  const handleDeparture = withSnapshot(() => {
    const now = Date.now();
    patch({
      route: route.map((s, i) => i === route.length - 1 ? { ...s, departedAt: now } : s),
      phase: "choose-next",
    });
  });

  const handleSelectNext = withSnapshot((stop) => {
    // No se toca `rutaDia.remaining` (el plan, propiedad del despacho): el
    // punto elegido queda "consumido" automáticamente por effectivePending()
    // en cuanto phase pasa a "traveling" con este nextStop.
    patch({
      nextStop: stop,
      nextLegKm: "",
      phase: "traveling",
    });
    setExtraSearch("");
  });

  // Nota y estado de entrega se registran ya en la parada (fase "at-stop"),
  // no antes de llegar: la parada arranca sin ellos y se llenan con patchCurStop.
  const handleArrival = withSnapshot(async () => {
    const newStop = {
      ...nextStop, arrivedAt: Date.now(), departedAt: null, legKm: nextLegKm,
      legBreakMin: pendingLegBreakMin > 0 ? pendingLegBreakMin : 0,
    };
    setPendingLegBreakMin(0);
    const newRoute = [...route, newStop];
    const isEndDepot = closed && nextStop.id === endId;
    if (isEndDepot) {
      await saveRoute(newRoute);
    } else {
      patch({ route: newRoute, nextStop: null, nextLegKm: "", phase: "at-stop" });
    }
  });

  const handleChangeDestino = withSnapshot(() => {
    if (!nextStop) return;
    // Idem: `nextStop` sigue en el plan del despacho (nunca se sacó de ahí),
    // así que basta con soltarlo para que effectivePending() lo muestre de
    // nuevo como pendiente.
    patch({
      nextStop: null, nextLegKm: "",
      phase: "choose-next",
    });
    setPendingLegBreakMin(0);
  });

  // Único caso en que el chofer SÍ reescribe el plan (`remaining`): aplicar
  // su propio orden sugerido. Bumpea `_wPlan` explícitamente para que la
  // fusión por grupo (mergeRutaActiva) lo reconozca como la versión más
  // nueva del plan, no solo del progreso driver.
  const handleResuggest = () => {
    if (!suggested?.orderIds?.length) return;
    setPrevSnapshot(rutaDia);
    const reordered = suggested.orderIds.map((id) => remaining.find((s) => s.id === id)).filter(Boolean);
    patch({ remaining: reordered, _wPlan: Date.now() });
  };

  const handleUndo = () => {
    if (!prevSnapshot) return;
    setRutaDia(prevSnapshot);
    setPrevSnapshot(null);
  };

  const handleTerminate = () => saveRoute(route);

  const handleStartBreak = () => {
    setOnBreak(true);
    setBreakStart(Date.now());
    setBreakNoteInput("");
  };

  const handleEndBreak = () => {
    const dur = Math.max(1, Math.round((Date.now() - breakStart) / 60000));
    const note = breakNoteInput.trim() || null;
    if (phase === "traveling") {
      setPendingLegBreakMin(pendingLegBreakMin + dur);
    } else if (phase === "at-stop" && curStop) {
      patch({
        route: route.map((s, i) =>
          i === route.length - 1
            ? { ...s, waitBreakMin: (s.waitBreakMin || 0) + dur, breakNote: note || s.breakNote }
            : s
        ),
      });
    }
    setOnBreak(false);
    setBreakStart(null);
    setBreakNoteInput("");
  };

  const cancel = async () => {
    if (await confirm({ message: "¿Cancelar la ruta del día? Se perderán los tiempos registrados.", confirmLabel: "Cancelar ruta", danger: true })) setRutaDia(null);
  };

  /* -------- Done -------- */
  if (done) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle2 size={44} className="mx-auto mb-3 text-teal-400" />
        <h2 className="mb-1 text-base font-semibold text-slate-200">¡Ruta completada!</h2>
        <p className="mb-5 text-sm text-slate-400">El recorrido fue guardado y ya alimenta el aprendizaje del sistema.</p>
        {doneSummary && (
          <div className="mx-auto mb-5 grid max-w-md grid-cols-2 gap-2 text-left sm:grid-cols-3">
            <Stat label="Paradas visitadas" value={doneSummary.visitedCount} />
            <Stat label="Tiempo total" value={doneSummary.totalMinRuta != null ? fmtMin(doneSummary.totalMinRuta) : "—"} />
            <Stat label="Manejo" value={fmtMin(doneSummary.totMin)} />
            <Stat label="Distancia" value={fmtKm(doneSummary.totKm)} />
            <Stat label="Espera" value={fmtMin(doneSummary.totWaitMin)} />
            {doneSummary.totComidaMin > 0 && <Stat label="Comida/Pausa" value={fmtMin(doneSummary.totComidaMin)} />}
            {doneSummary.delta != null && (
              <Stat label="Vs. óptimo" value={doneSummary.delta > 0 ? `+${fmtMin(doneSummary.delta)}` : "Óptimo"} highlight={doneSummary.delta > 0} />
            )}
          </div>
        )}
        <Btn variant="ghost" onClick={() => setRutaDia(null)}>Nueva ruta del día</Btn>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <DispatchBanner
        notice={rutaDia.notice}
        ackedAt={rutaDia.noticeAckAt}
        onDismiss={() => patch({ noticeAckAt: Date.now() })}
      />
      <NotesChat notes={rutaDia.notes || []} onSend={sendDriverNote} />

      {/* Encabezado / resumen de ruta — siempre visible, incluso antes de iniciar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Ruta del día · {title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{closed ? "Ruta cerrada" : "Ruta abierta"}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${online && syncOk ? "bg-teal-900/40 text-teal-300" : "bg-orange-900/40 text-orange-300"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${online && syncOk ? "bg-teal-400" : "bg-orange-400"}`} />
              {online && syncOk ? "En línea" : "Sin conexión · guardado en el teléfono"}
            </span>
            {isAdmin && <Btn variant="danger" onClick={cancel}>Cancelar ruta</Btn>}
          </div>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-teal-500 transition-all"
            style={{ width: `${totalPlanned ? Math.min(100, (route.length / totalPlanned) * 100) : 0}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Progreso" value={`${route.length}/${totalPlanned}`} />
          <Stat label="Tiempo en ruta" value={route.length > 0 ? fmtMin(elapsedMin) : "—"} />
          <Stat label="Hora estim. término" highlight
            value={etaInfo?.horaTerminoMin != null ? `${etaInfo.approxTermino ? "≈ " : ""}${minToHHMM(etaInfo.horaTerminoMin)}` : "—"} />
          <Stat label="Pendientes" value={remaining.length} />
        </div>

        <button onClick={() => setShowResumen((v) => !v)}
          className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-400 transition hover:text-slate-200">
          <span className="flex items-center gap-1.5"><MapIcon size={13} /> Ver paradas y mapa de la ruta</span>
          <ChevronDown size={14} className={`transition ${showResumen ? "rotate-180" : ""}`} />
        </button>
        {showResumen && (
          <div className="mt-3 space-y-3">
            <Suspense fallback={<MapFallback className="h-56 w-full rounded-lg" />}>
              <RouteMap className="h-56 w-full overflow-hidden rounded-lg" stops={resumenMapStops} closed={closed} />
            </Suspense>
            <ul className="space-y-1">
              {route.map((s, i) => (
                <li key={`v-${i}`} className="flex items-center gap-2 rounded border border-teal-900/40 bg-teal-950/20 px-2.5 py-1.5 text-xs">
                  <CheckCircle2 size={13} className="shrink-0 text-teal-400" />
                  <span className="flex-1 text-teal-200">{s.name}</span>
                  {s.estado && <span className="text-[10px] text-slate-500">{ESTADO_ENTREGA.find((o) => o.value === s.estado)?.label}</span>}
                </li>
              ))}
              {(suggested?.orderIds?.length ? suggested.orderIds.map((id) => remaining.find((s) => s.id === id)).filter(Boolean) : remaining).map((s, i) => (
                <li key={`p-${s.id}`} className={`flex items-center gap-2 rounded border px-2.5 py-1.5 text-xs ${i === 0 ? "border-rtb-gold-500/50 bg-rtb-gold-500/5" : "border-slate-800 bg-slate-950/40"}`}>
                  <span className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${i === 0 ? "bg-rtb-gold-500 text-slate-950" : "bg-slate-800 text-slate-400"}`}>{i + 1}</span>
                  <span className={`flex-1 ${i === 0 ? "text-rtb-gold-200" : "text-slate-300"}`}>{s.name}</span>
                  {i === 0 && <span className="text-[10px] text-rtb-gold-500">Sugerido</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Historial de paradas visitadas */}
      {route.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Paradas visitadas</h3>
          <ul className="space-y-1.5">
            {route.map((stop, i) => {
              const isLast = i === route.length - 1;
              const prev = i > 0 ? route[i - 1] : null;
              const legMin = i > 0 && prev?.departedAt && stop.arrivedAt
                ? Math.round((stop.arrivedAt - prev.departedAt) / 60000) : null;
              const waitMin = stop.arrivedAt && stop.departedAt
                ? Math.round((stop.departedAt - stop.arrivedAt) / 60000) : null;
              return (
                <li key={i} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${isLast ? "border-rtb-gold-500/50 bg-rtb-gold-500/5" : "border-teal-900/40 bg-teal-950/20"}`}>
                  <div className="mt-0.5 shrink-0">
                    {isLast
                      ? <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-rtb-gold-500 text-[10px] font-bold text-slate-950">{i + 1}</span>
                      : <CheckCircle2 size={18} className="text-teal-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isLast ? "text-rtb-gold-200" : "text-teal-200"}`}>{stop.name}</span>
                      {closed && stop.id === endId && i > 0 && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">regreso</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                      {stop.arrivedAt  && <span className="text-slate-500">Llegada <span className="text-slate-300">{fmtTime(stop.arrivedAt)}</span></span>}
                      {stop.departedAt && <span className="text-slate-500">Salida <span className="text-slate-300">{fmtTime(stop.departedAt)}</span></span>}
                      {legMin  != null && <span className="text-slate-500">Tramo <span className="text-teal-300">{fmtMin(legMin)}</span></span>}
                      {waitMin != null && <span className="text-slate-500">Espera <span className="text-sky-300">{fmtMin(waitMin)}</span></span>}
                      {stop.legKm && i > 0 && <span className="text-slate-500">{stop.legKm} km</span>}
                      {(stop.legBreakMin > 0 || stop.waitBreakMin > 0) && (
                        <span className="text-slate-500">🍽 <span className="text-orange-300">{fmtMin((stop.legBreakMin || 0) + (stop.waitBreakMin || 0))}</span>{stop.breakNote && <span className="ml-0.5 text-slate-500">({stop.breakNote})</span>}</span>
                      )}
                      {stop.estado && <span className="text-slate-500">· <span className="text-sky-300">{ESTADO_ENTREGA.find((o) => o.value === stop.estado)?.label}</span></span>}
                      {stop.nota && <span className="text-slate-500">· "{stop.nota}"</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Tarjeta de acción */}
      <Card className="p-4">
        {prevSnapshot && (
          <div className="mb-3 flex justify-end">
            <Btn variant="ghost" onClick={handleUndo} className="py-1 px-2.5 text-xs">Deshacer última acción</Btn>
          </div>
        )}

        {/* Fase: inicio */}
        {phase === "initial" && (
          <>
            <h3 className="mb-3 text-sm font-semibold text-slate-200">Punto de inicio: {startName}</h3>
            <Btn onClick={handleInitialArrival} className="w-full justify-center">
              <MapPin size={16} /> Llegada a {startName}
            </Btn>
          </>
        )}

        {/* Fase: en parada */}
        {phase === "at-stop" && curStop && (
          <>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">En {curStop.name}</h3>
            <p className="mb-3 text-xs text-slate-500">
              Llegada: <span className="text-slate-200">{fmtTime(curStop.arrivedAt)}</span>
              {route.length > 1 && route[route.length - 2]?.departedAt && (
                <> · Tramo: <span className="text-teal-300">{fmtMin(Math.round((curStop.arrivedAt - route[route.length - 2].departedAt) / 60000))}</span></>
              )}
            </p>
            {err && <p className="mb-2 text-xs text-rose-400">{err}</p>}
            {/* El almacén (inicio) no tiene nota/estado de entrega — no aplica */}
            {curStop.id !== startId && (
              <StopInfoPanel
                point={(allPoints || []).find((p) => p.id === curStop.id)}
                nota={curStop.nota || ""}
                onNotaChange={(v) => patchCurStop({ nota: v })}
                estado={curStop.estado || ""}
                onEstadoChange={(v) => patchCurStop({ estado: v })}
              />
            )}
            {/* Pausa activa */}
            {onBreak ? (
              <div className="mb-3 rounded-lg border border-orange-800/50 bg-orange-950/20 p-3">
                <p className="mb-2 text-sm font-semibold text-orange-300">🍽 Comida en curso — desde {fmtTime(breakStart)}</p>
                <Field label="Lugar / nota (opcional)">
                  <input className={inputCls} value={breakNoteInput} onChange={(e) => setBreakNoteInput(e.target.value)} placeholder="Ej. Tacos Reforma" />
                </Field>
                <Btn onClick={handleEndBreak} className="mt-2 w-full justify-center border border-orange-700/50 bg-orange-900/30 text-orange-200 hover:bg-orange-800/40">
                  ✓ Terminar comida
                </Btn>
              </div>
            ) : (
              <button onClick={handleStartBreak}
                className="mb-3 flex w-full items-center gap-2 rounded-lg border border-orange-900/30 bg-orange-950/10 px-3 py-2 text-sm text-orange-300 transition hover:bg-orange-950/25">
                <span>🍽</span> Comida / Pausa
              </button>
            )}
            <Btn variant="ghost" onClick={handleDeparture} disabled={onBreak} className="w-full justify-center">
              <ChevronRight size={16} /> Salida de {curStop.name}
            </Btn>
          </>
        )}

        {/* Fase: elegir próximo destino */}
        {phase === "choose-next" && (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-200">¿A dónde vas ahora?</h3>
              {remaining.length > 1 && suggested?.orderIds?.length > 0 && (
                <Btn variant="ghost" onClick={handleResuggest} className="py-1 px-2.5 text-xs">
                  <Zap size={12} /> Re-sugerir orden
                </Btn>
              )}
            </div>

            {remaining.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Paradas planificadas pendientes</p>
                <ul className="space-y-1.5">
                  {remaining.map((stop) => {
                    const badge = suggested?.orderIds?.indexOf(stop.id);
                    const isSuggested = badge === 0;
                    return (
                      <li key={stop.id}>
                        <button onClick={() => handleSelectNext(stop)}
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${isSuggested ? "border-rtb-gold-500/50 bg-rtb-gold-500/5 hover:border-rtb-gold-400" : "border-slate-800 bg-slate-950/50 hover:border-slate-600"}`}>
                          {badge != null && badge >= 0 ? (
                            <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isSuggested ? "bg-rtb-gold-500 text-slate-950" : "bg-slate-800 text-slate-400"}`}>{badge + 1}</span>
                          ) : (
                            <MapPin size={14} className="shrink-0 text-rtb-gold-400" />
                          )}
                          <span className={`text-sm ${isSuggested ? "text-rtb-gold-200" : "text-slate-200"}`}>{stop.name}</span>
                          {isSuggested && <span className="text-[10px] text-rtb-gold-500">Sugerido</span>}
                          <ChevronRight size={14} className="ml-auto text-slate-600" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {extraPoints.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Agregar parada no planificada</p>
                <div className="relative mb-2">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    className={inputCls + " pl-8"}
                    placeholder="Buscar punto…"
                    value={extraSearch}
                    onChange={(e) => setExtraSearch(e.target.value)}
                  />
                </div>
                {extraSearch.trim() && (() => {
                  const filtered = extraPoints.filter((p) =>
                    p.name.toLowerCase().includes(extraSearch.trim().toLowerCase())
                  );
                  return filtered.length > 0 ? (
                    <ul className="max-h-44 space-y-1 overflow-y-auto">
                      {filtered.map((p) => (
                        <li key={p.id}>
                          <button
                            onClick={() => { handleSelectNext({ id: p.id, name: p.name }); setExtraSearch(""); }}
                            className="flex w-full items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-left transition hover:border-slate-600">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${TYPE_META[p.type].dot}`} />
                            <span className="text-sm text-slate-200">{p.name}</span>
                            <span className="ml-auto text-[11px] text-slate-500">{TYPE_META[p.type].label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-1 text-xs text-slate-500">Sin resultados para "{extraSearch}".</p>
                  );
                })()}
              </div>
            )}

            <div className="space-y-2 border-t border-slate-800 pt-3">
              {/* Ruta cerrada: regreso al almacén (bloqueado como destino final) */}
              {closed && (
                <button onClick={() => handleSelectNext({ id: startId, name: startName })}
                  className="flex w-full items-center gap-3 rounded-lg border border-rtb-gold-800/40 bg-rtb-gold-950/20 px-3 py-2.5 text-left transition hover:border-rtb-gold-700/50">
                  <Navigation size={14} className="shrink-0 text-rtb-gold-400" />
                  <span className="text-sm text-rtb-gold-300">Regresar al almacén (cerrar ruta)</span>
                  <ChevronRight size={14} className="ml-auto text-rtb-gold-700" />
                </button>
              )}
              {/* Ruta abierta: terminar aquí */}
              {!closed && route.length >= 2 && (
                <Btn variant="success" onClick={handleTerminate} disabled={saving} className="w-full justify-center">
                  <Flag size={16} /> Terminar ruta aquí
                </Btn>
              )}
            </div>
            {err && <p className="mt-2 text-xs text-rose-400">{err}</p>}
          </>
        )}

        {/* Fase: viajando */}
        {phase === "traveling" && nextStop && (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-200">En camino a {nextStop.name}</h3>
              <Btn variant="ghost" onClick={handleChangeDestino} className="py-1 px-2.5 text-xs">
                <GitCompare size={12} /> Cambiar destino
              </Btn>
            </div>
            {/* Nota y estado de entrega se registran al llegar (fase "at-stop"), no antes */}
            <StopInfoPanel
              point={(allPoints || []).find((p) => p.id === nextStop.id)}
              showNotaEstado={false}
            />
            <div className="mb-3">
              <Field label="Km recorridos en este tramo">
                <input className={inputCls} type="number" min="0" step="0.1"
                  value={nextLegKm} onChange={(e) => patch({ nextLegKm: e.target.value })}
                  placeholder="Ej. 12.5" />
              </Field>
            </div>
            {pendingLegBreakMin > 0 && !onBreak && (
              <p className="mb-2 text-xs text-orange-300">🍽 Comida registrada: {fmtMin(pendingLegBreakMin)} (se descontará del tramo)</p>
            )}
            {/* Pausa activa */}
            {onBreak ? (
              <div className="mb-3 rounded-lg border border-orange-800/50 bg-orange-950/20 p-3">
                <p className="mb-2 text-sm font-semibold text-orange-300">🍽 Comida en curso — desde {fmtTime(breakStart)}</p>
                <Field label="Lugar / nota (opcional)">
                  <input className={inputCls} value={breakNoteInput} onChange={(e) => setBreakNoteInput(e.target.value)} placeholder="Ej. Tacos Reforma" />
                </Field>
                <Btn onClick={handleEndBreak} className="mt-2 w-full justify-center border border-orange-700/50 bg-orange-900/30 text-orange-200 hover:bg-orange-800/40">
                  ✓ Terminar comida
                </Btn>
              </div>
            ) : (
              <button onClick={handleStartBreak}
                className="mb-3 flex w-full items-center gap-2 rounded-lg border border-orange-900/30 bg-orange-950/10 px-3 py-2 text-sm text-orange-300 transition hover:bg-orange-950/25">
                <span>🍽</span> Comida / Pausa
              </button>
            )}
            {err && <p className="mb-2 text-xs text-rose-400">{err}</p>}
            <Btn onClick={handleArrival} disabled={saving || onBreak} className="w-full justify-center">
              <MapPin size={16} /> Llegada a {nextStop.name}
            </Btn>
          </>
        )}
      </Card>
    </div>
  );
}

