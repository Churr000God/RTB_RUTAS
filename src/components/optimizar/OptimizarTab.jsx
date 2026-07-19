// =====================================================================
// src/components/optimizar/OptimizarTab.jsx
// Pestaña "Generación y carga de rutas": calcula la ruta óptima (tiempo
// o distancia), permite reordenarla a mano y anclar paradas, la muestra
// en un mapa con ETA por parada, y la asigna a un chofer.
// =====================================================================
import { useState, useEffect, useMemo, Suspense } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, BookMarked, Calendar, ChevronRight,
  GitCompare, GripVertical, Lock, Navigation, Pencil, Save, Search, Trash2,
  Unlock, Users, X, Zap,
} from "lucide-react";
import { Card, Btn, Field, inputCls, Empty, Stat } from "../ui";
import { useConfirm } from "../feedback";
import { RouteMap, MapFallback } from "../maps";
import { TYPE_META } from "../../lib/constants";
import { fmtMin, fmtKm } from "../../lib/utils";
import {
  DOW, buildMatrices, buildWaits, solveTSP, metricsForOrder, computeETAs,
  minToHHMM, parseHHMM,
} from "../../lib/routing";

/* ============================================================
   Tab: Generación y carga de rutas (antes "Optimizar")

   Calcula la ruta óptima (tiempo o distancia), permite reordenarla a
   mano y anclar paradas, la muestra en un mapa con ETA por parada, y
   la asigna a un chofer (obligatorio) — el chofer la inicia desde su
   Ruta del día.
   ============================================================ */
export default function OptimizarTab({ points, segments, waits, rutasGuardadas = [], onSaveRutaGuardada, onUpdateRutaGuardada, onDeleteRutaGuardada, profiles = [] }) {
  const [selected, setSelected] = useState(() => new Set());
  const [startId, setStartId] = useState("");
  const [closed, setClosed] = useState(true);
  const [weekday, setWeekday] = useState("");
  const [pointSearch, setPointSearch] = useState("");
  const [comidaMin, setComidaMin] = useState("");
  const [error, setError] = useState("");
  // Ruta guardada que se está reeditando (§ "Rutas guardadas" abajo), si la hay.
  const [editingId, setEditingId] = useState(null);

  // Contexto de la última resolución: matrices + ambos órdenes óptimos
  // (tiempo y distancia), para poder cambiar de criterio o comparar sin
  // volver a resolver el TSP.
  const [session, setSession] = useState(null);
  const [criterio, setCriterio] = useState("time"); // "time" | "dist"
  // Orden editable a mano (índices dentro de session.sub); [0] = inicio.
  const [manualOrder, setManualOrder] = useState(null);
  // Anclajes: índice de nodo (en session.sub) -> posición fija (1..n-1).
  const [anchors, setAnchors] = useState(() => new Map());
  const [horaInicio, setHoraInicio] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });

  useEffect(() => { if (!startId && points.length) { const dep = points.find((p) => p.type === "deposito"); setStartId(dep ? dep.id : points[0].id); } }, [points, startId]);
  const toggle = (id) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };

  const resolveOptimal = () => {
    setError("");
    // Nota: recalcular NO limpia editingId — si estabas editando una ruta
    // guardada (p. ej. le agregaste una parada), sigues editando la misma;
    // "Actualizar esta ruta guardada" debe seguir apuntando a ella.
    const ids = [startId, ...[...selected].filter((id) => id !== startId)];
    const sub = ids.map((id) => points.find((p) => p.id === id)).filter(Boolean);
    if (sub.length < 2) { setError("Selecciona al menos un destino además del inicio."); setSession(null); setManualOrder(null); return; }
    const wd = weekday === "" ? null : +weekday;
    const { timeM, distM, learned } = buildMatrices(sub, segments, { weekday: wd });
    const W = buildWaits(sub, waits);
    const n = sub.length;

    const missing = (M) => { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && M[i][j] == null) return true; return false; };
    if (missing(timeM)) { setError("Faltan datos de tiempo en algunos tramos."); setSession(null); setManualOrder(null); return; }
    const distUnavailable = missing(distM);

    const optTime = solveTSP(timeM, n, closed, anchors);
    if (!optTime) { setError("No se pudo resolver la ruta: revisa los anclajes (pueden estar en conflicto entre sí)."); setSession(null); setManualOrder(null); return; }
    const optDist = distUnavailable ? null : solveTSP(distM, n, closed, anchors);

    const ctx = { sub, timeM, distM, learned, W, closed, n };
    setSession({ ...ctx, optOrderTime: optTime.order, optExactTime: optTime.exact, optOrderDist: optDist?.order ?? null, distUnavailable });
    setManualOrder(criterio === "dist" && optDist ? optDist.order : optTime.order);
  };

  // Vuelve a cargar una ruta guardada (plantilla o asignada) en el
  // planificador, preservando su orden EXACTO (no el óptimo) para poder
  // seguir editándola, reasignarla o actualizarla.
  const loadTemplate = (r) => {
    if (!r.stops || r.stops.length < 2) return;
    setError("");
    const sub = r.stops.map((s) => points.find((p) => p.id === s.id)).filter(Boolean);
    if (sub.length !== r.stops.length) { setError("Algunas paradas de esta ruta ya no existen en el catálogo de puntos."); return; }
    const wd = weekday === "" ? null : +weekday;
    const { timeM, distM, learned } = buildMatrices(sub, segments, { weekday: wd });
    const W = buildWaits(sub, waits);
    const n = sub.length;
    const missing = (M) => { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && M[i][j] == null) return true; return false; };
    if (missing(timeM)) { setError("Faltan datos de tiempo en algunos tramos de esta ruta guardada."); return; }
    const distUnavailable = missing(distM);
    const optTime = solveTSP(timeM, n, r.closed);
    const optDist = distUnavailable ? null : solveTSP(distM, n, r.closed);

    setStartId(sub[0].id);
    setSelected(new Set(sub.slice(1).map((p) => p.id)));
    setClosed(r.closed);
    setAnchors(new Map());
    if (r.horaInicio) setHoraInicio(r.horaInicio.slice(0, 5));
    setEditingId(r.id);

    const ctx = { sub, timeM, distM, learned, W, closed: r.closed, n };
    setSession({ ...ctx, optOrderTime: optTime?.order ?? null, optExactTime: optTime?.exact ?? false, optOrderDist: optDist?.order ?? null, distUnavailable });
    setManualOrder(sub.map((_, i) => i)); // el orden tal cual se guardó, no el óptimo
  };

  const changeCriterio = (next) => {
    setCriterio(next);
    if (!session) return;
    const order = next === "dist" ? session.optOrderDist : session.optOrderTime;
    if (order) setManualOrder(order);
  };

  const reorder = (fromPos, toPos) => {
    if (!manualOrder || fromPos === 0 || toPos === 0 || fromPos === toPos) return;
    const next = manualOrder.slice();
    const [node] = next.splice(fromPos, 1);
    next.splice(toPos, 0, node);
    setManualOrder(next);
    if (anchors.has(node)) { const a = new Map(anchors); a.delete(node); setAnchors(a); } // el arrastre manda sobre el anclaje
  };
  const move = (pos, dir) => { const to = pos + dir; if (to >= 1 && to <= manualOrder.length - 1) reorder(pos, to); };

  const setAnchor = (nodeIdx, pos) => {
    const a = new Map(anchors);
    if (pos != null) for (const [k, v] of a) if (v === pos && k !== nodeIdx) a.delete(k); // libera a quien tuviera esa posición
    if (pos == null) a.delete(nodeIdx); else a.set(nodeIdx, pos);
    setAnchors(a);
  };

  const curStats = useMemo(() => (session && manualOrder ? metricsForOrder(manualOrder, session) : null), [session, manualOrder]);
  const optOrderForCriterio = session ? (criterio === "dist" ? session.optOrderDist : session.optOrderTime) : null;
  const optStats = useMemo(() => (session && optOrderForCriterio ? metricsForOrder(optOrderForCriterio, session) : null), [session, optOrderForCriterio]);
  const isManualOptimal = !!(optOrderForCriterio && manualOrder && JSON.stringify(optOrderForCriterio) === JSON.stringify(manualOrder));
  const primaryVal = (s) => (criterio === "dist" ? s.totD : s.totT);
  const deltaAbs = curStats && optStats ? primaryVal(curStats) - primaryVal(optStats) : 0;
  const deltaPct = curStats && optStats && primaryVal(optStats) > 0 ? (deltaAbs / primaryVal(optStats)) * 100 : 0;
  const criteriaDiffer = !!(session?.optOrderTime && session?.optOrderDist && JSON.stringify(session.optOrderTime) !== JSON.stringify(session.optOrderDist));

  const etaInfo = useMemo(() => {
    if (!session || !manualOrder) return null;
    const startMin = parseHHMM(horaInicio);
    if (startMin == null) return null;
    return computeETAs(manualOrder, session, startMin, +comidaMin || 0);
  }, [session, manualOrder, horaInicio, comidaMin]);

  const mapStops = useMemo(() => {
    if (!session || !manualOrder) return [];
    return manualOrder.map((k) => session.sub[k]).map((p) => ({ id: p.id, name: p.name, lat: p.lat ?? null, lng: p.lng ?? null }));
  }, [session, manualOrder]);
  const missingCoordsCount = mapStops.filter((s) => s.lat == null || s.lng == null).length;

  if (points.length < 2) return <Card className="p-6"><Empty>Agrega puntos y registra recorridos primero.</Empty></Card>;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-rtb-navy">Generación y carga de rutas</h2>
      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-rtb-navy">Puntos a visitar hoy</h2>
            <div className="relative mb-2">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rtb-navy-mid" />
              <input
                className={inputCls + " py-1.5 pl-8 text-xs"}
                placeholder="Buscar punto…"
                value={pointSearch}
                onChange={(e) => setPointSearch(e.target.value)}
              />
            </div>
            <div className="max-h-52 overflow-y-auto pr-0.5">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {points
                  .filter((p) => p.name.toLowerCase().includes(pointSearch.trim().toLowerCase()))
                  .map((p) => {
                    const isStart = p.id === startId, on = selected.has(p.id) || isStart;
                    return (
                      <button key={p.id} onClick={() => !isStart && toggle(p.id)} disabled={isStart}
                        className={`rounded-lg border px-2.5 py-2 text-left text-xs transition ${isStart ? "border-rtb-gold-500 bg-rtb-gold-500/15 text-rtb-gold-700" : on ? "border-rtb-teal-200 bg-rtb-teal-50 text-rtb-teal-700" : "border-rtb-navy/15 text-rtb-navy-mid hover:border-slate-300"}`}>
                        <div className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${TYPE_META[p.type].dot}`} /><span className="truncate">{p.name}</span></div>
                        {isStart && <span className="text-[10px] text-rtb-gold-700/80">Inicio</span>}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <Field label="Punto de inicio (depósito)">
              <select className={inputCls} value={startId} onChange={(e) => { setStartId(e.target.value); const n = new Set(selected); n.delete(e.target.value); setSelected(n); }}>
                {points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Tipo de ruta">
              <div className="flex gap-1">
                <button onClick={() => setClosed(true)} className={`flex-1 rounded-lg border px-2 py-2 text-xs ${closed ? "border-rtb-gold-500 bg-rtb-gold-500/10 text-rtb-gold-700" : "border-rtb-navy/15 text-rtb-navy-mid"}`}>Cerrada (regresa)</button>
                <button onClick={() => setClosed(false)} className={`flex-1 rounded-lg border px-2 py-2 text-xs ${!closed ? "border-rtb-gold-500 bg-rtb-gold-500/10 text-rtb-gold-700" : "border-rtb-navy/15 text-rtb-navy-mid"}`}>Abierta</button>
              </div>
            </Field>
            <Field label="Usar tiempos de…">
              <select className={inputCls} value={weekday} onChange={(e) => setWeekday(e.target.value)}>
                <option value="">Todos los días (promedio global)</option>{DOW.map((d, i) => <option key={i} value={i}>Solo {d}</option>)}
              </select>
            </Field>
            <Field label="Comida (min) — buffer al total">
              <input className={inputCls} type="number" min="0" value={comidaMin}
                onChange={(e) => setComidaMin(e.target.value)} placeholder="60" />
            </Field>
            <Btn onClick={resolveOptimal} className="w-full justify-center">
              <Zap size={16} /> {session ? "Recalcular ruta óptima" : "Calcular mejor ruta"}
            </Btn>
          </div>
        </div>
      </Card>
      {error && <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertTriangle size={16} className="mb-1 inline" /> {error}</Card>}
      {session && curStats && (
        <RoutePlanner
          session={session} manualOrder={manualOrder} criterio={criterio} onCriterio={changeCriterio}
          curStats={curStats} optStats={optStats} isManualOptimal={isManualOptimal}
          deltaAbs={deltaAbs} deltaPct={deltaPct} criteriaDiffer={criteriaDiffer}
          closed={closed} comidaMin={+comidaMin || 0}
          anchors={anchors} setAnchor={setAnchor}
          reorder={reorder} move={move}
          horaInicio={horaInicio} setHoraInicio={setHoraInicio} etaInfo={etaInfo}
          mapStops={mapStops} missingCoordsCount={missingCoordsCount}
          onRestoreOptimal={() => optOrderForCriterio && setManualOrder(optOrderForCriterio)}
          onSaveRuta={onSaveRutaGuardada}
          rutasGuardadas={rutasGuardadas}
          profiles={profiles}
          editingId={editingId}
          onUpdateRuta={onUpdateRutaGuardada}
          onDoneEditing={() => setEditingId(null)}
        />
      )}
      <SavedRoutesCard
        rutasGuardadas={rutasGuardadas}
        profiles={profiles}
        editingId={editingId}
        onEdit={loadTemplate}
        onDelete={onDeleteRutaGuardada}
      />
    </div>
  );
}

/** Lista de rutas guardadas (plantillas y asignadas) creadas desde este
 *  módulo: permite volver a cargarlas en el planificador para seguir
 *  editándolas, reasignarlas, o eliminarlas. */
function SavedRoutesCard({ rutasGuardadas, profiles, editingId, onEdit, onDelete }) {
  const confirm = useConfirm();
  if (!rutasGuardadas.length) return null;
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-rtb-navy">Rutas guardadas</h3>
      <ul className="divide-y divide-slate-200">
        {rutasGuardadas.map((r) => {
          const chofer = r.assignedTo ? profiles.find((p) => p.userId === r.assignedTo)?.nombre ?? "Chofer asignado" : null;
          return (
            <li key={r.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${editingId === r.id ? "bg-rtb-gold-500/5" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-rtb-navy">{r.nombre}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-rtb-navy-mid">
                  {r.fecha && <span className="flex items-center gap-1"><Calendar size={11} /> {r.fecha}</span>}
                  <span>{r.stops.length} paradas</span>
                  <span>{r.closed ? "Cerrada" : "Abierta"}</span>
                  {chofer ? <span className="flex items-center gap-1 text-rtb-gold-600"><Users size={10} /> {chofer}</span> : <span className="text-slate-300">Sin asignar</span>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Btn variant="ghost" onClick={() => onEdit(r)} className="py-1 px-2.5 text-xs">
                  <Pencil size={13} /> Editar
                </Btn>
                <Btn
                  variant="ghost"
                  onClick={async () => { if (await confirm({ message: `¿Eliminar "${r.nombre}"?`, confirmLabel: "Eliminar", danger: true })) onDelete(r.id); }}
                  className="py-1 px-2 text-rose-700 hover:text-rose-800"
                >
                  <Trash2 size={13} />
                </Btn>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Menú de anclaje por parada (libre / primera / última / esta posición). */
function AnchorMenu({ anchored, onFree, onFirst, onLast, onHere }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button type="button" onClick={() => setOpen((o) => !o)} title="Anclar parada"
        className={`shrink-0 ${anchored ? "text-rtb-gold-700" : "text-rtb-navy-mid hover:text-rtb-navy"}`}>
        {anchored ? <Lock size={13} /> : <Unlock size={13} />}
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-10 w-44 rounded-lg border border-rtb-navy/15 bg-white p-1 text-xs shadow-lg">
          <button onClick={() => { onFree(); setOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-rtb-navy-mid hover:bg-rtb-surface">Libre</button>
          <button onClick={() => { onFirst(); setOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-rtb-navy-mid hover:bg-rtb-surface">Primera tras el inicio</button>
          <button onClick={() => { onLast(); setOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-rtb-navy-mid hover:bg-rtb-surface">Última antes de regresar</button>
          <button onClick={() => { onHere(); setOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-rtb-navy-mid hover:bg-rtb-surface">Fijar en esta posición</button>
        </div>
      )}
    </div>
  );
}

/** Ruta editable: selector de criterio, lista reordenable con anclajes y
 *  ETA, mapa, y acción de asignar a chofer. */
function RoutePlanner({
  session, manualOrder, criterio, onCriterio,
  curStats, optStats, isManualOptimal, deltaAbs, deltaPct, criteriaDiffer,
  closed, comidaMin,
  anchors, setAnchor,
  reorder, move,
  horaInicio, setHoraInicio, etaInfo,
  mapStops, missingCoordsCount,
  onRestoreOptimal,
  onSaveRuta, rutasGuardadas, profiles,
  editingId, onUpdateRuta, onDoneEditing,
}) {
  const [dragIdx, setDragIdx] = useState(null);
  const etaByNode = useMemo(() => {
    const m = {};
    etaInfo?.etas.forEach((e) => { m[e.id] = e; });
    return m;
  }, [etaInfo]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-1">
          <button onClick={() => onCriterio("time")} className={`rounded-lg border px-3 py-1.5 text-xs ${criterio === "time" ? "border-rtb-gold-500 bg-rtb-gold-500/10 text-rtb-gold-700" : "border-rtb-navy/15 text-rtb-navy-mid"}`}>Por tiempo</button>
          <button onClick={() => onCriterio("dist")} disabled={session.distUnavailable} className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-30 ${criterio === "dist" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-rtb-navy/15 text-rtb-navy-mid"}`}>Por distancia</button>
          {session.distUnavailable && <span className="text-[10px] text-slate-400">faltan coordenadas/km para distancia</span>}
          <span className="ml-auto rounded bg-slate-100 px-2 py-0.5 text-[10px] text-rtb-navy-mid">
            {session.optExactTime ? "Óptima exacta" : `Heurística (${session.n} puntos)`}
          </span>
        </div>

        {criteriaDiffer && (
          <p className="mb-3 flex items-center gap-2 rounded-lg border border-rtb-navy/15 bg-white px-3 py-2 text-xs text-rtb-navy-mid">
            <GitCompare size={14} className="shrink-0 text-rtb-navy-mid" />
            {criterio === "time" ? "Si priorizaras distancia, el orden óptimo sería otro." : "Si priorizaras tiempo, el orden óptimo sería otro."}
          </p>
        )}

        <div className={`mb-3 grid gap-2 text-center ${comidaMin > 0 ? "grid-cols-4" : "grid-cols-3"}`}>
          <Stat label="Manejo" value={fmtMin(curStats.totT)} highlight={criterio === "time"} />
          <Stat label="Esperas" value={fmtMin(curStats.totW)} />
          {comidaMin > 0 && <Stat label="Comida" value={fmtMin(comidaMin)} color="text-orange-700" />}
          <Stat label="Total día" value={fmtMin(curStats.totT + curStats.totW + comidaMin)} highlight />
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-rtb-navy-mid">
          <span>Distancia: <span className={`font-mono ${criterio === "dist" ? "text-sky-700" : "text-rtb-navy-mid"}`}>{fmtKm(curStats.totD)}</span></span>
          {etaInfo && <span>Regreso: <span className="font-mono text-rtb-navy-mid">{minToHHMM(etaInfo.horaRegresoMin)}{etaInfo.approxReturn ? " ≈" : ""}</span></span>}
        </div>

        {!isManualOptimal && optStats && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rtb-gold-700/40 bg-rtb-gold-500/5 px-3 py-2 text-xs text-rtb-gold-700">
            <span>{deltaAbs >= 0 ? "+" : ""}{fmtMin(deltaAbs)} · {deltaAbs >= 0 ? "+" : ""}{deltaPct.toFixed(0)}% que el óptimo</span>
            <button onClick={onRestoreOptimal} className="shrink-0 underline hover:text-rtb-gold-800">Restaurar orden óptimo</button>
          </div>
        )}
        {isManualOptimal && <p className="mb-3 text-center text-xs text-rtb-teal-700">Orden óptimo</p>}
        {curStats.anyEst && <p className="mb-3 text-center text-[10px] text-rose-700">incluye tramos estimados</p>}

        <Field label="Hora de inicio">
          <input type="time" className={inputCls + " w-auto"} value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
        </Field>

        <ol className="mt-3 space-y-1">
          {manualOrder.map((node, i) => {
            const p = session.sub[node];
            const leg = curStats.legs[i - 1];
            const eta = etaByNode[p.id];
            const isStart = i === 0;
            return (
              <li key={p.id}
                draggable={!isStart}
                onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); setDragIdx(i); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (dragIdx != null) reorder(dragIdx, i); setDragIdx(null); }}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${isStart ? "border-rtb-gold-500/40 bg-rtb-gold-500/5" : "border-rtb-teal-100 bg-white"}`}
              >
                {!isStart && <GripVertical size={13} className="shrink-0 cursor-grab text-slate-400" />}
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-rtb-navy-mid">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-rtb-navy">{p.name}{isStart && <span className="ml-1 text-[10px] text-rtb-gold-700/80">Inicio</span>}</span>
                {leg && <span className="flex shrink-0 items-center gap-1 text-[11px] text-rtb-navy-mid"><ChevronRight size={11} /><span className={`font-mono ${leg.learned ? "text-rtb-teal-700" : "text-rose-700"}`}>{fmtMin(leg.min)}</span></span>}
                {eta && <span className="shrink-0 font-mono text-[11px] text-rtb-navy-mid">{minToHHMM(eta.etaMin)}{eta.approx ? "≈" : ""}</span>}
                {!isStart && (
                  <>
                    <button onClick={() => move(i, -1)} disabled={i <= 1} className="shrink-0 text-rtb-navy-mid hover:text-rtb-navy disabled:opacity-20"><ArrowUp size={13} /></button>
                    <button onClick={() => move(i, 1)} disabled={i >= manualOrder.length - 1} className="shrink-0 text-rtb-navy-mid hover:text-rtb-navy disabled:opacity-20"><ArrowDown size={13} /></button>
                    <AnchorMenu
                      anchored={anchors.has(node)}
                      onFree={() => setAnchor(node, null)}
                      onFirst={() => setAnchor(node, 1)}
                      onLast={() => setAnchor(node, session.n - 1)}
                      onHere={() => setAnchor(node, i)}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ol>
        {closed && curStats.legs.some((l) => l.ret) && (
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-rtb-teal-100 bg-white px-2 py-1.5 text-xs text-rtb-navy-mid">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px]">↩</span>
            <span>Regreso al inicio</span>
            <span className="ml-auto font-mono">{fmtMin(curStats.legs[curStats.legs.length - 1].min)}</span>
          </div>
        )}

        {missingCoordsCount > 0 && (
          <p className="mt-2 text-[11px] text-rtb-navy-mid">{missingCoordsCount} parada(s) sin coordenadas no se muestran en el mapa.</p>
        )}
        <Suspense fallback={<MapFallback className="mt-3 h-64 w-full rounded-lg" />}>
          <RouteMap className="mt-3 h-64 w-full overflow-hidden rounded-lg" stops={mapStops} closed={closed} />
        </Suspense>
      </Card>

      <AssignCard
        manualOrder={manualOrder} session={session} closed={closed} horaInicio={horaInicio}
        onSaveRuta={onSaveRuta} rutasGuardadas={rutasGuardadas} profiles={profiles}
        editingId={editingId} onUpdateRuta={onUpdateRuta} onDoneEditing={onDoneEditing}
      />
    </div>
  );
}

/** Acción principal del módulo: asignar la ruta final a un chofer
 *  (obligatorio), con aviso si ya tiene una ruta esa fecha; o guardarla
 *  como plantilla sin asignar (acción secundaria). */
function AssignCard({ manualOrder, session, closed, horaInicio, onSaveRuta, rutasGuardadas, profiles, editingId, onUpdateRuta, onDoneEditing }) {
  const _hoy = new Date();
  const localToday = `${_hoy.getFullYear()}-${String(_hoy.getMonth() + 1).padStart(2, "0")}-${String(_hoy.getDate()).padStart(2, "0")}`;
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState(localToday);
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmConflict, setConfirmConflict] = useState(false);
  const [saveError, setSaveError] = useState("");

  const editingRoute = editingId ? rutasGuardadas.find((r) => r.id === editingId) : null;
  // Al cargar una ruta guardada para editar, precargar su nombre/fecha/chofer.
  useEffect(() => {
    if (editingRoute) {
      setNombre(editingRoute.nombre);
      setFecha(editingRoute.fecha || localToday);
      setAssignedTo(editingRoute.assignedTo || "");
      setConfirmConflict(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const stopsPayload = () => manualOrder.map((k) => ({ id: session.sub[k].id, name: session.sub[k].name }));

  const conflict = useMemo(() => {
    if (!assignedTo || !fecha) return null;
    return rutasGuardadas.find((r) => r.assignedTo === assignedTo && r.fecha === fecha && r.id !== editingId) || null;
  }, [assignedTo, fecha, rutasGuardadas, editingId]);

  const friendlyError = (e) => {
    const msg = e?.message || String(e);
    if (/hora_inicio/i.test(msg) || /column .* does not exist/i.test(msg)) {
      return "Falta la columna hora_inicio en la base de datos. Corre la migración supabase/migrations/2026-07-generacion-rutas.sql en el SQL Editor de Supabase y vuelve a intentar.";
    }
    return `No se pudo guardar: ${msg}`;
  };

  const doSave = async (assignedToVal) => {
    setSaving(true); setSaveError("");
    try {
      await onSaveRuta({
        nombre: nombre.trim(),
        fecha: fecha || null,
        closed,
        stops: stopsPayload(),
        assignedTo: assignedToVal,
        horaInicio: assignedToVal ? horaInicio : null,
      });
      setNombre(""); setAssignedTo(""); setConfirmConflict(false);
    } catch (e) { console.error(e); setSaveError(friendlyError(e)); }
    finally { setSaving(false); }
  };

  const doUpdate = async () => {
    setSaving(true); setSaveError("");
    try {
      await onUpdateRuta(editingId, {
        nombre: nombre.trim(),
        fecha: fecha || null,
        closed,
        stops: stopsPayload(),
        assignedTo: assignedTo || null,
        horaInicio: assignedTo ? horaInicio : null,
      });
      onDoneEditing();
      setNombre(""); setAssignedTo(""); setConfirmConflict(false);
    } catch (e) { console.error(e); setSaveError(friendlyError(e)); }
    finally { setSaving(false); }
  };

  const handleAssign = () => {
    if (!assignedTo || !nombre.trim()) return;
    if (conflict && !confirmConflict) { setConfirmConflict(true); return; }
    doSave(assignedTo);
  };

  const handleUpdate = () => {
    if (!nombre.trim()) return;
    if (assignedTo && conflict && !confirmConflict) { setConfirmConflict(true); return; }
    doUpdate();
  };

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-rtb-navy">
        {editingRoute ? `Editando "${editingRoute.nombre}"` : "Asignar a chofer"}
      </h3>
      <div className="space-y-2">
        <Field label="Nombre de la ruta">
          <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Ruta lunes centro" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fecha">
            <input className={inputCls} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Chofer (obligatorio para asignar)">
            <select className={inputCls} value={assignedTo} onChange={(e) => { setAssignedTo(e.target.value); setConfirmConflict(false); }}>
              <option value="">— Selecciona un chofer —</option>
              {profiles.map((p) => <option key={p.userId} value={p.userId}>{p.nombre} ({p.role})</option>)}
            </select>
          </Field>
        </div>
        {conflict && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertTriangle size={13} className="mr-1 inline" />
            Este chofer ya tiene la ruta "{conflict.nombre}" asignada el {fecha}.
            {!confirmConflict && " Presiona \"Asignar a chofer\" otra vez para confirmar."}
          </p>
        )}
        {saveError && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertTriangle size={13} className="mr-1 inline" /> {saveError}
          </p>
        )}
        {editingRoute && (
          <div className="flex gap-2">
            <Btn onClick={handleUpdate} disabled={saving || !nombre.trim()} className="flex-1 justify-center">
              <Save size={15} /> {saving ? "Actualizando…" : "Actualizar esta ruta guardada"}
            </Btn>
            <Btn variant="ghost" onClick={onDoneEditing} className="justify-center">
              <X size={15} />
            </Btn>
          </div>
        )}
        <Btn onClick={handleAssign} disabled={saving || !assignedTo || !nombre.trim()} className="w-full justify-center">
          <Navigation size={15} /> {saving ? "Asignando…" : editingRoute ? "Asignar como ruta nueva" : "Asignar a chofer"}
        </Btn>
        <Btn variant="ghost" onClick={() => doSave(null)} disabled={saving || !nombre.trim()} className="w-full justify-center text-rtb-navy-mid">
          <BookMarked size={15} /> {editingRoute ? "Guardar como plantilla nueva" : "Guardar plantilla sin asignar"}
        </Btn>
      </div>
    </Card>
  );
}
