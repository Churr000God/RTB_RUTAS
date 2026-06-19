import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Truck, MapPin, Clock, Route, Plus, Trash2, Download, Upload, Zap,
  ChevronRight, AlertTriangle, Database, Map, GitCompare, X, Save,
  TrendingDown, CheckCircle2, Info, LogOut
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import {
  getSession, signIn, signOut, onAuth,
  getPuntos, addPunto, removePunto,
  getRecorridos, addRecorrido, replaceAll
} from "./lib/supabase";

/* ============================================================
   Utilidades
   ============================================================ */
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const dowOf = (ts) => new Date(ts).getDay();
const toRad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function fmtMin(m) {
  if (m == null || !isFinite(m)) return "—";
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
const fmtKm = (k) => (k == null || !isFinite(k) ? "—" : `${k.toFixed(1)} km`);

/* ============================================================
   El RECORRIDO es la fuente de verdad. De él se derivan tramos y esperas.
   ============================================================ */
function deriveObservations(recorridos) {
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

function buildMatrices(points, segments, { weekday = null, stat = "median", speedKmh = 25, defaultMin = 20 } = {}) {
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

function buildWaits(points, waits) {
  const w = {};
  for (const p of points) w[p.id] = 0;
  const b = {};
  for (const x of waits) (b[x.point] ||= []).push(x.min);
  for (const p of points) if (b[p.id]?.length) w[p.id] = mean(b[p.id]);
  return w;
}

/* ============================================================
   Solucionadores TSP (depósito fijo en índice 0)
   ============================================================ */
function tourCost(order, C, closed) {
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
function heldKarp(C, n, closed) {
  const FULL = (1 << n) - 1;
  const dp = Array.from({ length: 1 << n }, () => new Float64Array(n).fill(Infinity));
  const par = Array.from({ length: 1 << n }, () => new Int16Array(n).fill(-1));
  dp[1][0] = 0;
  for (let mask = 1; mask <= FULL; mask++) {
    if (!(mask & 1)) continue;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i)) || dp[mask][i] === Infinity) continue;
      for (let j = 0; j < n; j++) {
        if (mask & (1 << j)) continue;
        const w = C[i][j]; if (w == null) continue;
        const nm = mask | (1 << j), nc = dp[mask][i] + w;
        if (nc < dp[nm][j]) { dp[nm][j] = nc; par[nm][j] = i; }
      }
    }
  }
  let best = Infinity, last = -1;
  for (let i = 0; i < n; i++) {
    const back = closed ? C[i][0] : 0; if (back == null) continue;
    const c = dp[FULL][i] + back; if (c < best) { best = c; last = i; }
  }
  if (last === -1) return null;
  const order = []; let mask = FULL, cur = last;
  while (cur !== -1) { order.push(cur); const p = par[mask][cur]; mask ^= 1 << cur; cur = p; }
  order.reverse();
  return { order, cost: best };
}
function heuristicTSP(C, n, closed) {
  const visited = new Array(n).fill(false); visited[0] = true;
  let order = [0], cur = 0;
  for (let k = 1; k < n; k++) {
    let best = -1, bc = Infinity;
    for (let j = 0; j < n; j++) { if (visited[j]) continue; const v = C[cur][j]; if (v != null && v < bc) { bc = v; best = j; } }
    if (best === -1) for (let j = 0; j < n; j++) if (!visited[j]) { best = j; break; }
    order.push(best); visited[best] = true; cur = best;
  }
  let best = order.slice(), bestCost = tourCost(best, C, closed), improved = true, guard = 0;
  while (improved && guard++ < 3000) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++)
      for (let k = i + 1; k < best.length; k++) {
        const cand = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const cc = tourCost(cand, C, closed);
        if (cc + 1e-9 < bestCost) { best = cand; bestCost = cc; improved = true; }
      }
    for (let i = 1; i < best.length; i++)
      for (let j = 1; j < best.length; j++) {
        if (i === j) continue;
        const cand = best.slice(); const [node] = cand.splice(i, 1); cand.splice(j, 0, node);
        if (cand[0] !== 0) continue;
        const cc = tourCost(cand, C, closed);
        if (cc + 1e-9 < bestCost) { best = cand; bestCost = cc; improved = true; }
      }
  }
  return { order: best, cost: bestCost };
}
function solveTSP(C, n, closed) {
  if (n <= 1) return { order: [0], cost: 0, exact: true };
  if (n <= 12) { const r = heldKarp(C, n, closed); return r ? { ...r, exact: true } : null; }
  return { ...heuristicTSP(C, n, closed), exact: false };
}

/* ============================================================
   Análisis de ahorro: orden real vs orden óptimo, misma matriz.
   ============================================================ */
function analizarAhorro(points, recorridos, { leaveOneOut = true } = {}) {
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
    const opt = solveTSP(timeM, n, closed);
    if (!opt) continue;
    const gap = realOnMatrix - opt.cost;

    let estimado = false;
    for (let s = 1; s < opt.order.length; s++) if (!learned[opt.order[s - 1]][opt.order[s]]) estimado = true;
    if (closed && !learned[opt.order[opt.order.length - 1]][opt.order[0]]) estimado = true;

    out.push({
      id: R.id, date: R.dateISO, ts: R.ts, n, closed,
      realMeasured, realOnMatrix, optCost: opt.cost, gap,
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
   UI base
   ============================================================ */
const Card = ({ children, className = "" }) => (
  <div className={"rounded-xl border border-slate-800 bg-slate-900/70 " + className}>{children}</div>
);
const Btn = ({ children, onClick, variant = "primary", disabled, className = "" }) => {
  const styles = {
    primary: "bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold",
    ghost: "bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700",
    danger: "bg-slate-800 text-rose-300 hover:bg-rose-950 border border-slate-700",
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
};
const Field = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
    {children}
  </label>
);
const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none";
const TYPE_META = {
  deposito: { label: "Depósito", dot: "bg-amber-400" },
  entrega: { label: "Entrega", dot: "bg-teal-400" },
  recoleccion: { label: "Recolección", dot: "bg-sky-400" },
};
const Empty = ({ children }) => (
  <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/30 px-4 py-8 text-center text-sm text-slate-500">{children}</div>
);
const Stat = ({ label, value, highlight, color }) => (
  <div className={`rounded-lg border px-2 py-2 ${highlight ? "border-amber-500/40 bg-amber-500/5" : "border-slate-800 bg-slate-950/50"}`}>
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`font-mono text-sm ${color || (highlight ? "text-amber-300" : "text-slate-200")}`}>{value}</div>
  </div>
);

/* ============================================================
   Login
   ============================================================ */
function LoginGate() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setErr(""); setBusy(true);
    try { await signIn(email.trim(), pw); }
    catch { setErr("Credenciales incorrectas."); setBusy(false); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 font-sans">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-950"><Truck size={20} /></div>
          <div>
            <h1 className="text-base font-bold text-slate-100">Despacho RTB</h1>
            <p className="text-xs text-slate-500">Inicia sesión para continuar</p>
          </div>
        </div>
        <div className="space-y-3">
          <input className={inputCls} placeholder="correo" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" className={inputCls} placeholder="contraseña" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
          {err && <p className="text-xs text-rose-400">{err}</p>}
          <Btn onClick={go} disabled={busy} className="w-full justify-center">{busy ? "Entrando…" : "Entrar"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   App
   ============================================================ */
export default function OptimizadorRutas() {
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState("optimizar");
  const [points, setPoints] = useState([]);
  const [recorridos, setRecorridos] = useState([]);

  const refresh = useCallback(async () => {
    const [p, r] = await Promise.all([getPuntos(), getRecorridos()]);
    setPoints(p); setRecorridos(r);
  }, []);

  useEffect(() => {
    let sub;
    (async () => {
      const s = await getSession();
      setSession(s);
      if (s) { try { await refresh(); } catch (e) { console.error(e); } }
      setLoaded(true);
      sub = onAuth(async (ns) => {
        setSession(ns);
        if (ns) { try { await refresh(); } catch (e) { console.error(e); } }
        else { setPoints([]); setRecorridos([]); }
      });
    })();
    return () => sub?.data?.subscription?.unsubscribe?.();
  }, [refresh]);

  const onAddPunto = async (p) => { await addPunto(p); await refresh(); };
  const onRemovePunto = async (id) => { await removePunto(id); await refresh(); };
  const onAddRecorrido = async (r) => { await addRecorrido(r); await refresh(); };
  const onReplaceAll = async (p, r) => { await replaceAll(p, r); await refresh(); };

  const obs = useMemo(() => deriveObservations(recorridos), [recorridos]);

  const tabs = [
    { id: "optimizar", label: "Optimizar", icon: Zap },
    { id: "registrar", label: "Registrar recorrido", icon: Clock },
    { id: "ahorro", label: "Análisis de ahorro", icon: TrendingDown },
    { id: "puntos", label: "Puntos", icon: MapPin },
    { id: "matriz", label: "Matriz aprendida", icon: Map },
    { id: "datos", label: "Datos", icon: Database },
  ];

  if (!loaded) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-500">Cargando…</div>;
  if (!session) return <LoginGate />;

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 text-slate-950"><Truck size={24} /></div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Despacho RTB · Optimizador de Rutas</h1>
            <p className="text-xs text-slate-500">Aprende tiempos reales, optimiza y mide cuánto estás ahorrando</p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right text-xs text-slate-500 sm:block">
              <div><span className="font-mono text-slate-300">{points.length}</span> puntos</div>
              <div><span className="font-mono text-slate-300">{recorridos.length}</span> recorridos</div>
            </div>
            <button onClick={signOut} title="Cerrar sesión" className="text-slate-500 hover:text-slate-300"><LogOut size={18} /></button>
          </div>
        </header>

        <nav className="mb-6 flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-900/50 p-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition ${tab === t.id ? "bg-slate-800 text-amber-400" : "text-slate-400 hover:text-slate-200"}`}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </nav>

        {tab === "puntos" && <PuntosTab points={points} onAddPunto={onAddPunto} onRemovePunto={onRemovePunto} />}
        {tab === "registrar" && <RegistrarTab points={points} onAddRecorrido={onAddRecorrido} />}
        {tab === "ahorro" && <AhorroTab points={points} recorridos={recorridos} />}
        {tab === "matriz" && <MatrizTab points={points} segments={obs.segments} />}
        {tab === "optimizar" && <OptimizarTab points={points} segments={obs.segments} waits={obs.waits} />}
        {tab === "datos" && <DatosTab points={points} recorridos={recorridos} onReplaceAll={onReplaceAll} />}
      </div>
    </div>
  );
}

/* ============================================================
   Tab: Puntos
   ============================================================ */
function PuntosTab({ points, onAddPunto, onRemovePunto }) {
  const [name, setName] = useState(""), [type, setType] = useState("entrega"), [lat, setLat] = useState(""), [lng, setLng] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onAddPunto({ name: name.trim(), type, lat: lat ? parseFloat(lat) : null, lng: lng ? parseFloat(lng) : null });
      setName(""); setLat(""); setLng("");
    } finally { setBusy(false); }
  };
  const remove = async (id) => { await onRemovePunto(id); };
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Nuevo punto</h2>
        <div className="space-y-3">
          <Field label="Nombre"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Almacén / Cliente / Sucursal" /></Field>
          <Field label="Tipo">
            <div className="flex gap-1">
              {Object.entries(TYPE_META).map(([k, v]) => (
                <button key={k} onClick={() => setType(k)} className={`flex-1 rounded-lg border px-2 py-2 text-xs ${type === k ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-slate-700 text-slate-400"}`}>{v.label}</button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitud (opcional)"><input className={inputCls} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="19.4326" /></Field>
            <Field label="Longitud (opcional)"><input className={inputCls} value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-99.1332" /></Field>
          </div>
          <p className="text-xs text-slate-500">Coordenadas opcionales: solo estiman tramos que aún no has manejado.</p>
          <Btn onClick={add} disabled={busy} className="w-full justify-center"><Plus size={16} /> Agregar punto</Btn>
        </div>
      </Card>
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Puntos registrados</h2>
        {points.length === 0 ? <Empty>Aún no hay puntos. Agrega tu almacén como <span className="text-amber-400">Depósito</span> y tus clientes.</Empty> : (
          <ul className="space-y-1.5">
            {points.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                <span className={`h-2.5 w-2.5 rounded-full ${TYPE_META[p.type].dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200">{p.name}</div>
                  <div className="text-[11px] text-slate-500">{TYPE_META[p.type].label}{p.lat != null && p.lng != null && <span className="font-mono"> · {p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>}</div>
                </div>
                <button onClick={() => remove(p.id)} className="text-slate-600 hover:text-rose-400"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ============================================================
   Tab: Registrar recorrido
   ============================================================ */
function RegistrarTab({ points, onAddRecorrido }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [seq, setSeq] = useState([]);
  const [pick, setPick] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const pointName = (id) => points.find((p) => p.id === id)?.name ?? "—";

  const addStop = () => { if (!pick) return; setSeq([...seq, { point: pick, legMin: "", legKm: "", waitMin: "" }]); setPick(""); };
  const update = (i, k, v) => setSeq(seq.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)));
  const removeStop = (i) => setSeq(seq.filter((_, idx) => idx !== i));

  const save = async () => {
    if (seq.length < 2 || busy) return;
    const ts = new Date(date + "T12:00:00").getTime();
    const stops = seq.map((s, i) => ({
      point: s.point,
      legMin: i > 0 && s.legMin !== "" && !isNaN(+s.legMin) ? +s.legMin : null,
      legKm: i > 0 && s.legKm !== "" && !isNaN(+s.legKm) ? +s.legKm : null,
      waitMin: s.waitMin !== "" && !isNaN(+s.waitMin) ? +s.waitMin : null,
    }));
    setBusy(true);
    try {
      await onAddRecorrido({ dateISO: date, ts, stops });
      setSeq([]); setDone(true); setTimeout(() => setDone(false), 2500);
    } finally { setBusy(false); }
  };

  if (points.length < 2) return <Card className="p-6"><Empty>Necesitas al menos 2 puntos. Créalos en <span className="text-amber-400">Puntos</span>.</Empty></Card>;

  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Fecha del recorrido"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <span className="rounded-md bg-slate-800 px-2 py-1 font-mono text-xs text-slate-400">{DOW[new Date(date + "T12:00:00").getDay()]}</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">Arma el recorrido en el orden real. Captura el <span className="text-teal-400">tiempo de manejo</span> de cada tramo y la <span className="text-sky-400">espera</span> en cada parada. Cada guardado alimenta el aprendizaje y queda disponible para el análisis de ahorro.</p>
      {seq.length > 0 && (
        <ol className="mb-4 space-y-2">
          {seq.map((s, i) => (
            <li key={i} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-slate-950">{i + 1}</span>
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
          <Btn onClick={save} disabled={seq.length < 2 || busy}><Save size={16} /> Guardar recorrido</Btn>
        </div>
      </div>
    </Card>
  );
}

/* ============================================================
   Tab: Análisis de ahorro
   ============================================================ */
function AhorroTab({ points, recorridos }) {
  const [loo, setLoo] = useState(true);
  const results = useMemo(() => analizarAhorro(points, recorridos, { leaveOneOut: loo }), [points, recorridos, loo]);
  const [open, setOpen] = useState(null);

  if (recorridos.length === 0) return <Card className="p-6"><Empty>Registra recorridos para poder analizar el ahorro.</Empty></Card>;
  if (results.length === 0) return <Card className="p-6"><Empty>Aún no hay recorridos analizables. Se necesitan recorridos de <span className="text-amber-400">3 paradas o más</span> (con menos, el orden no cambia nada).</Empty></Card>;

  const totalGap = results.reduce((s, r) => s + r.gap, 0);
  const avgPct = mean(results.map((r) => r.gapPct)) ?? 0;
  const yaOptimos = results.filter((r) => r.sameOrder).length;
  const chartData = results.map((r, i) => ({ label: `#${i + 1}`, fecha: r.date, tuOrden: Math.round(r.realOnMatrix), optima: Math.round(r.optCost) }));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Info size={15} className="mt-0.5 text-slate-500" />
            <p className="max-w-2xl text-xs leading-relaxed text-slate-400">
              Comparo <span className="text-slate-200">tu orden real</span> contra el <span className="text-amber-300">orden óptimo</span>, midiendo ambos con los <span className="text-teal-400">mismos tiempos promedio</span>. Así la única diferencia es el orden de visita: lo que ves es <span className="text-slate-200">desperdicio puro de ruteo</span>, no efecto del tráfico de un día. Si la brecha se encoge con el tiempo, el equipo está rutando mejor.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={loo} onChange={(e) => setLoo(e.target.checked)} className="accent-amber-500" />
            Excluir cada recorrido de su propio dato (más honesto)
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Recorridos analizados" value={results.length} />
          <Stat label="Tiempo desperdiciado (total)" value={fmtMin(totalGap)} color="text-rose-300" />
          <Stat label="Ahorro potencial promedio" value={`${avgPct.toFixed(1)}%`} color="text-amber-300" highlight />
          <Stat label="Ya iban óptimos" value={`${yaOptimos}/${results.length}`} color="text-teal-300" />
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Tu orden vs. la ruta óptima, recorrido por recorrido</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} unit="m" />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#cbd5e1" }} formatter={(v, n) => [`${v} min`, n === "tuOrden" ? "Tu orden" : "Óptima"]}
                labelFormatter={(l, p) => p?.[0]?.payload ? `Recorrido ${l} · ${p[0].payload.fecha}` : l} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "tuOrden" ? "Tu orden real" : "Ruta óptima")} />
              <Line type="monotone" dataKey="tuOrden" stroke="#fb7185" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="optima" stroke="#fbbf24" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-center text-xs text-slate-500">El área entre las dos líneas es el tiempo que estás dejando en la mesa. Idealmente se cierra con el tiempo.</p>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Detalle por recorrido</h3>
        <ul className="space-y-2">
          {results.map((r, i) => (
            <li key={r.id} className="rounded-lg border border-slate-800 bg-slate-950/50">
              <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                <span className="font-mono text-xs text-slate-500">#{i + 1}</span>
                <span className="text-sm text-slate-300">{r.date}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{r.n} paradas</span>
                {r.sameOrder ? (
                  <span className="flex items-center gap-1 text-xs text-teal-400"><CheckCircle2 size={13} /> óptimo</span>
                ) : (
                  <span className="text-xs text-rose-300">−{fmtMin(r.gap)} desperdicio <span className="text-slate-500">({r.gapPct.toFixed(0)}%)</span></span>
                )}
                {r.estimado && <AlertTriangle size={13} className="text-rose-400" />}
                <ChevronRight size={15} className={`ml-auto text-slate-600 transition ${open === r.id ? "rotate-90" : ""}`} />
              </button>
              {open === r.id && (
                <div className="border-t border-slate-800 px-3 py-3">
                  <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                    <Stat label="Tu orden (en matriz)" value={fmtMin(r.realOnMatrix)} color="text-rose-300" />
                    <Stat label="Orden óptimo" value={fmtMin(r.optCost)} color="text-amber-300" />
                    <Stat label="Real medido ese día" value={fmtMin(r.realMeasured)} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-wider text-rose-400">Orden que hiciste</div>
                      <SeqList names={r.realNames} closed={r.closed} />
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-wider text-amber-400">Orden óptimo sugerido</div>
                      <SeqList names={r.optNames} closed={r.closed} />
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
const SeqList = ({ names, closed }) => (
  <ol className="space-y-1">
    {names.map((n, i) => (
      <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-400">{i + 1}</span>{n}
      </li>
    ))}
    {closed && <li className="flex items-center gap-2 text-xs text-slate-500"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px]">↩</span>regreso al inicio</li>}
  </ol>
);

/* ============================================================
   Tab: Matriz aprendida
   ============================================================ */
function MatrizTab({ points, segments }) {
  const [weekday, setWeekday] = useState(""), [stat, setStat] = useState("median");
  const { timeM, learned, counts } = useMemo(() => buildMatrices(points, segments, { weekday: weekday === "" ? null : +weekday, stat }), [points, segments, weekday, stat]);
  if (points.length < 2) return <Card className="p-6"><Empty>Agrega al menos 2 puntos para ver la matriz.</Empty></Card>;
  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Día de la semana">
          <select className={inputCls} value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            <option value="">Todos los días</option>{DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </Field>
        <Field label="Estadística">
          <select className={inputCls} value={stat} onChange={(e) => setStat(e.target.value)}>
            <option value="median">Mediana (robusta)</option><option value="mean">Promedio</option>
          </select>
        </Field>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-400" /> Aprendido</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Estimado</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead><tr>
            <th className="sticky left-0 bg-slate-900 p-2 text-left text-slate-500">De ↓ / A →</th>
            {points.map((p) => <th key={p.id} className="p-2 text-left font-medium text-slate-400">{p.name}</th>)}
          </tr></thead>
          <tbody>
            {points.map((from, i) => (
              <tr key={from.id} className="border-t border-slate-800">
                <td className="sticky left-0 bg-slate-900 p-2 font-medium text-slate-300">{from.name}</td>
                {points.map((to, j) => (
                  <td key={to.id} className="p-2">
                    {i === j ? <span className="text-slate-700">·</span> : (
                      <div className={`rounded px-1.5 py-1 font-mono ${learned[i][j] ? "bg-teal-500/10 text-teal-300" : "bg-rose-500/10 text-rose-300"}`}>
                        {fmtMin(timeM[i][j])}{learned[i][j] && <span className="ml-1 text-[9px] text-teal-500/70">×{counts[i][j]}</span>}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500"><span className="font-mono text-teal-500">×N</span> = cuántos recorridos reales respaldan ese tiempo. Entre más alto, más confiable.</p>
    </Card>
  );
}

/* ============================================================
   Tab: Optimizar
   ============================================================ */
function OptimizarTab({ points, segments, waits }) {
  const [selected, setSelected] = useState(() => new Set());
  const [startId, setStartId] = useState("");
  const [closed, setClosed] = useState(true);
  const [weekday, setWeekday] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => { if (!startId && points.length) { const dep = points.find((p) => p.type === "deposito"); setStartId(dep ? dep.id : points[0].id); } }, [points, startId]);
  const toggle = (id) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };

  const compute = () => {
    const ids = [startId, ...[...selected].filter((id) => id !== startId)];
    const sub = ids.map((id) => points.find((p) => p.id === id)).filter(Boolean);
    if (sub.length < 2) { setResult({ error: "Selecciona al menos un destino además del inicio." }); return; }
    const wd = weekday === "" ? null : +weekday;
    const { timeM, distM, learned } = buildMatrices(sub, segments, { weekday: wd });
    const W = buildWaits(sub, waits);
    const n = sub.length;
    const routeForMetric = (M) => {
      let missing = false;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && M[i][j] == null) missing = true;
      if (missing) return { unavailable: true };
      const r = solveTSP(M, n, closed); if (!r) return { unavailable: true };
      let totT = 0, totD = 0, totW = 0, anyEst = false; const legs = []; const o = r.order;
      for (let s = 0; s < o.length; s++) {
        const k = o[s];
        if (s > 0) { const a = o[s - 1]; totT += timeM[a][k] ?? 0; totD += distM[a][k] ?? 0; if (!learned[a][k]) anyEst = true; legs.push({ min: timeM[a][k], km: distM[a][k], learned: learned[a][k] }); }
        if (s > 0) totW += W[sub[k].id] ?? 0;
      }
      if (closed) { const a = o[o.length - 1], k = o[0]; totT += timeM[a][k] ?? 0; totD += distM[a][k] ?? 0; if (!learned[a][k]) anyEst = true; legs.push({ min: timeM[a][k], km: distM[a][k], learned: learned[a][k], ret: true }); }
      return { seqNames: o.map((k) => sub[k].name), legs, totT, totD, totW, exact: r.exact, anyEst };
    };
    setResult({ byTime: routeForMetric(timeM), byDist: routeForMetric(distM), n });
  };

  if (points.length < 2) return <Card className="p-6"><Empty>Agrega puntos y registra recorridos primero.</Empty></Card>;
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-200">Puntos a visitar hoy</h2>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {points.map((p) => {
                const isStart = p.id === startId, on = selected.has(p.id) || isStart;
                return (
                  <button key={p.id} onClick={() => !isStart && toggle(p.id)} disabled={isStart}
                    className={`rounded-lg border px-2.5 py-2 text-left text-xs transition ${isStart ? "border-amber-500 bg-amber-500/15 text-amber-200" : on ? "border-teal-500 bg-teal-500/10 text-teal-200" : "border-slate-700 text-slate-400 hover:border-slate-600"}`}>
                    <div className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${TYPE_META[p.type].dot}`} /><span className="truncate">{p.name}</span></div>
                    {isStart && <span className="text-[10px] text-amber-400/80">Inicio</span>}
                  </button>
                );
              })}
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
                <button onClick={() => setClosed(true)} className={`flex-1 rounded-lg border px-2 py-2 text-xs ${closed ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-slate-700 text-slate-400"}`}>Cerrada (regresa)</button>
                <button onClick={() => setClosed(false)} className={`flex-1 rounded-lg border px-2 py-2 text-xs ${!closed ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-slate-700 text-slate-400"}`}>Abierta</button>
              </div>
            </Field>
            <Field label="Usar tiempos de…">
              <select className={inputCls} value={weekday} onChange={(e) => setWeekday(e.target.value)}>
                <option value="">Todos los días (promedio global)</option>{DOW.map((d, i) => <option key={i} value={i}>Solo {d}</option>)}
              </select>
            </Field>
            <Btn onClick={compute} className="w-full justify-center"><Zap size={16} /> Calcular mejor ruta</Btn>
          </div>
        </div>
      </Card>
      {result?.error && <Card className="border-rose-900/50 bg-rose-950/20 p-4 text-sm text-rose-300"><AlertTriangle size={16} className="mb-1 inline" /> {result.error}</Card>}
      {result && !result.error && (
        <div className="grid gap-4 md:grid-cols-2">
          <RouteCard title="Óptima por tiempo" accent="amber" data={result.byTime} primary="time" />
          <RouteCard title="Óptima por distancia" accent="sky" data={result.byDist} primary="dist" />
          {result.byTime?.seqNames && result.byDist?.seqNames && (
            <div className="md:col-span-2">
              <Card className="flex items-center gap-3 p-3 text-xs text-slate-400">
                <GitCompare size={16} className="text-slate-500" />
                {JSON.stringify(result.byTime.seqNames) === JSON.stringify(result.byDist.seqNames)
                  ? <span>Ambos criterios coinciden: la ruta más rápida también es la más corta.</span>
                  : <span>Las rutas difieren. La más rápida ahorra tiempo; la más corta ahorra kilómetros. Elige según tu prioridad.</span>}
                {result.byTime.exact ? <span className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-teal-400">Óptima exacta</span> : <span className="ml-auto rounded bg-slate-800 px-2 py-0.5">Heurística ({result.n} puntos)</span>}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function RouteCard({ title, accent, data, primary }) {
  const accentCls = accent === "amber" ? "text-amber-400" : "text-sky-400";
  if (!data) return null;
  if (data.unavailable) return (
    <Card className="p-4">
      <h3 className={`mb-2 text-sm font-semibold ${accentCls}`}>{title}</h3>
      <p className="text-xs text-slate-500">{primary === "dist" ? "Faltan datos de distancia (km) en algunos tramos. Captura kilómetros o agrega coordenadas a los puntos." : "Faltan datos de tiempo en algunos tramos."}</p>
    </Card>
  );
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className={`text-sm font-semibold ${accentCls}`}>{title}</h3>
        {data.anyEst && <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300">incluye tramos estimados</span>}
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Manejo" value={fmtMin(data.totT)} highlight={primary === "time"} />
        <Stat label="Esperas" value={fmtMin(data.totW)} />
        <Stat label="Total" value={fmtMin(data.totT + data.totW)} highlight={primary === "time"} />
      </div>
      <div className="mb-3 text-center"><span className="text-xs text-slate-500">Distancia: </span><span className={`font-mono text-sm ${primary === "dist" ? "text-sky-300" : "text-slate-300"}`}>{fmtKm(data.totD)}</span></div>
      <ol className="space-y-1">
        {data.seqNames.map((name, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300">{i + 1}</span>
            <span className="text-slate-200">{name}</span>
            {data.legs[i] && <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-500"><ChevronRight size={12} /><span className={`font-mono ${data.legs[i].learned ? "text-teal-400" : "text-rose-400"}`}>{fmtMin(data.legs[i].min)}</span></span>}
          </li>
        ))}
        {data.legs.some((l) => l.ret) && (
          <li className="flex items-center gap-2 text-xs text-slate-500">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px]">↩</span><span>Regreso al inicio</span>
            <span className="ml-auto font-mono">{fmtMin(data.legs[data.legs.length - 1].min)}</span>
          </li>
        )}
      </ol>
    </Card>
  );
}

/* ============================================================
   Tab: Datos
   ============================================================ */
function DatosTab({ points, recorridos, onReplaceAll }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ points, recorridos, exported: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `rtb_rutas_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const importJSON = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try { const d = JSON.parse(r.result); setBusy(true); await onReplaceAll(d.points || [], d.recorridos || []); setMsg("✓ Datos importados."); }
      catch { setMsg("Archivo inválido."); } finally { setBusy(false); }
    };
    r.readAsText(f);
  };
  const reset = async () => {
    if (!confirm("¿Borrar TODOS los puntos y recorridos? No se puede deshacer.")) return;
    setBusy(true);
    try { await onReplaceAll([], []); setMsg("Datos borrados."); } finally { setBusy(false); }
  };
  return (
    <Card className="p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-200">Respaldo y migración</h2>
      <p className="mb-4 text-xs text-slate-500">Exporta el JSON para respaldarlo en Nextcloud o migrar entre entornos. Importar reemplaza todos los datos actuales.</p>
      <div className="mb-4 grid grid-cols-2 gap-2 text-center">
        <Stat label="Puntos" value={points.length} /><Stat label="Recorridos" value={recorridos.length} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn variant="ghost" onClick={exportJSON}><Download size={16} /> Exportar JSON</Btn>
        <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 ${busy ? "opacity-40" : ""}`}>
          <Upload size={16} /> Importar JSON<input type="file" accept="application/json" className="hidden" disabled={busy} onChange={importJSON} />
        </label>
        <Btn variant="danger" onClick={reset} disabled={busy}><Trash2 size={16} /> Borrar todo</Btn>
        {msg && <span className="ml-2 self-center text-xs text-teal-400">{msg}</span>}
      </div>
    </Card>
  );
}
