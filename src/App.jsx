import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";

const SUPERADMIN_ID = "5ecb861d-7d41-4d01-a916-72eb1c2b1817";
import {
  Truck, MapPin, Clock, Route, Plus, Trash2, Download, Upload, Zap,
  ChevronRight, ChevronDown, AlertTriangle, Database, Map as MapIcon, GitCompare, X, Save,
  TrendingDown, CheckCircle2, Info, LogOut, Pencil, Search, FileText,
  Navigation, Flag, Calendar, BookMarked, Users, ShieldCheck, Radio, UserCog,
  UserCircle, KeyRound, UserPlus, Ban, Mail, ExternalLink, Copy,
  Lock, Unlock, ArrowUp, ArrowDown, GripVertical,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import {
  supabase,
  getSession, signIn, signOut, onAuth,
  getMyProfile, getProfiles, updateProfile, updateMyName,
  changeMyPassword, sendPasswordReset,
  adminCrearUsuario, adminResetPassword, adminToggleUsuario,
  getPuntos, addPunto, updatePunto, removePunto,
  getRecorridos, addRecorrido, replaceAll,
  getRutasGuardadas, addRutaGuardada, updateRutaGuardada, removeRutaGuardada,
  getAllRutasActivas, saveRutaActiva, clearRutaActiva, subscribeRutasActivas,
} from "./lib/supabase";
import {
  mean, DOW, buildMatrices, buildWaits, solveTSP,
  deriveObservations, analizarAhorro, metricsForOrder, computeETAs,
  minToHHMM, parseHHMM,
} from "./lib/routing";

// Leaflet pesa lo suyo: se carga solo cuando se muestra un mapa (chunk aparte).
const LeafletMap = lazy(() => import("./components/LeafletMap"));
const RouteMap = lazy(() => import("./components/RouteMap"));
const MapFallback = ({ className }) => (
  <div className={`flex items-center justify-center bg-slate-950/50 text-xs text-slate-500 ${className || ""}`}>
    Cargando mapa…
  </div>
);

/* ============================================================
   Utilidades
   ============================================================ */
function fmtMin(m) {
  if (m == null || !isFinite(m)) return "—";
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
const fmtKm = (k) => (k == null || !isFinite(k) ? "—" : `${k.toFixed(1)} km`);
const fmtTime = (ts) => {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
};

/* ============================================================
   UI base
   ============================================================ */
const Card = ({ children, className = "" }) => (
  <div className={"rounded-xl border border-slate-800 bg-slate-900/70 " + className}>{children}</div>
);
const Btn = ({ children, onClick, variant = "primary", disabled, className = "" }) => {
  const styles = {
    primary: "bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold",
    success: "bg-teal-600 text-white hover:bg-teal-500 font-semibold",
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
const CITY_FALLBACK = { lat: 19.4326, lng: -99.1332 }; // fallback si no hay depósito con coordenadas
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
  const [mode, setMode] = useState("login"); // "login" | "forgot" | "forgot-sent"
  const go = async () => {
    setErr(""); setBusy(true);
    try { await signIn(email.trim(), pw); }
    catch { setErr("Credenciales incorrectas."); setBusy(false); }
  };
  const sendReset = async () => {
    if (!email.trim()) { setErr("Escribe tu correo."); return; }
    setErr(""); setBusy(true);
    try {
      await sendPasswordReset(email.trim(), window.location.origin);
      setMode("forgot-sent");
    } catch { setErr("No se pudo enviar el correo."); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 font-sans">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-950"><Truck size={20} /></div>
          <div>
            <h1 className="text-base font-bold text-slate-100">Despacho RTB</h1>
            <p className="text-xs text-slate-500">{mode === "login" ? "Inicia sesión para continuar" : "Recuperar contraseña"}</p>
          </div>
        </div>
        {mode === "forgot-sent" ? (
          <div className="space-y-3 text-center">
            <CheckCircle2 size={28} className="mx-auto text-teal-400" />
            <p className="text-sm text-slate-300">Si el correo existe, te enviamos un enlace para restablecer tu contraseña.</p>
            <Btn variant="ghost" onClick={() => setMode("login")} className="w-full justify-center">Volver</Btn>
          </div>
        ) : (
          <div className="space-y-3">
            <input className={inputCls} placeholder="correo" value={email} onChange={(e) => setEmail(e.target.value)} />
            {mode === "login" && (
              <input type="password" className={inputCls} placeholder="contraseña" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
            )}
            {err && <p className="text-xs text-rose-400">{err}</p>}
            {mode === "login" ? (
              <>
                <Btn onClick={go} disabled={busy} className="w-full justify-center">{busy ? "Entrando…" : "Entrar"}</Btn>
                <button onClick={() => { setErr(""); setMode("forgot"); }} className="w-full text-center text-xs text-slate-500 hover:text-slate-300">¿Olvidaste tu contraseña?</button>
              </>
            ) : (
              <>
                <Btn onClick={sendReset} disabled={busy} className="w-full justify-center">{busy ? "Enviando…" : "Enviar enlace"}</Btn>
                <button onClick={() => { setErr(""); setMode("login"); }} className="w-full text-center text-xs text-slate-500 hover:text-slate-300">Volver a iniciar sesión</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Definir contraseña (invitación / reseteo) — se muestra cuando
   la sesión viene de un enlace de invitación o de recuperación,
   antes de dejar entrar a la app.
   ============================================================ */
function SetPasswordGate({ onDone }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setErr("");
    if (pw.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres."); return; }
    if (pw !== pw2) { setErr("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try { await changeMyPassword(pw); onDone(); }
    catch (e) { setErr(e.message || "No se pudo guardar la contraseña."); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 font-sans">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-950"><KeyRound size={20} /></div>
          <div>
            <h1 className="text-base font-bold text-slate-100">Define tu contraseña</h1>
            <p className="text-xs text-slate-500">Para entrar por primera vez, elige una contraseña</p>
          </div>
        </div>
        <div className="space-y-3">
          <input type="password" className={inputCls} placeholder="Nueva contraseña" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input type="password" className={inputCls} placeholder="Repite la contraseña" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
          {err && <p className="text-xs text-rose-400">{err}</p>}
          <Btn onClick={go} disabled={busy} className="w-full justify-center">{busy ? "Guardando…" : "Guardar y entrar"}</Btn>
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
  // true si la sesión viene de un enlace de invitación o de recuperación de
  // contraseña: hay que dejar definir la contraseña antes de entrar a la app.
  const [needsPassword, setNeedsPassword] = useState(() => /type=(recovery|invite)/.test(window.location.hash || ""));
  const [profile, setProfile] = useState(null);   // { userId, nombre, role }
  const [profiles, setProfiles] = useState([]);    // todos los perfiles (para asignación y monitor)
  const [tab, setTab] = useState("ruta-dia");
  const [points, setPoints] = useState([]);
  const [recorridos, setRecorridos] = useState([]);
  const [rutasGuardadas, setRutasGuardadas] = useState([]);

  // Ruta del día propia (React state; se persiste a Supabase vía updateRutaDia)
  const [rutaDia, setRutaDia] = useState(null);

  // Mapa driverId → { driverNombre, state } con todas las rutas activas
  // (admin ve todas, driver solo la suya por RLS; se actualiza en vivo vía realtime)
  const [activeRoutes, setActiveRoutes] = useState({});

  // Sello de la última escritura local: evita que el eco del realtime
  // sobreescriba el estado que acabamos de guardar desde este mismo dispositivo.
  const lastWriteRef = useRef(0);
  const profileRef = useRef(null);   // copia sin stale-closure para el callback de realtime

  // Wrapper que persiste el progreso a Supabase y actualiza el estado local.
  // Recibe profile como parámetro para evitar stale-closure (se llama desde callbacks).
  const updateRutaDia = useCallback((next, prof) => {
    setRutaDia(next);
    const p = prof ?? profileRef.current;
    if (!p) return;
    const stamp = Date.now();
    lastWriteRef.current = stamp;
    (async () => {
      try {
        if (next && !next.done) {
          await saveRutaActiva(p.userId, p.nombre, { ...next, _w: stamp });
        } else {
          await clearRutaActiva(p.userId);
        }
      } catch (e) { console.error("ruta_activa sync:", e); }
    })();
  }, []);

  const refresh = useCallback(async () => {
    const [p, r, prof, profs, rutas, activas] = await Promise.all([
      getPuntos(), getRecorridos(),
      getMyProfile(), getProfiles(),
      getRutasGuardadas().catch(() => []),
      getAllRutasActivas().catch(() => []),
    ]);
    // Ya no hay auto-alta de perfil: las cuentas nacen desde Usuarios → Nuevo
    // usuario (Edge Function admin-crear-usuario), que crea la fila en profiles.
    setPoints(p);
    setRecorridos(r);
    setProfile(prof);
    profileRef.current = prof;
    setProfiles(profs);
    setRutasGuardadas(rutas);
    const map = {};
    for (const ra of activas) map[ra.driverId] = ra;
    setActiveRoutes(map);
    if (prof) {
      const dbState = activas.find((ra) => ra.driverId === prof.userId)?.state ?? null;
      setRutaDia((prev) => {
        // No pisar la pantalla "done" con estado viejo del DB si acabamos de terminar la ruta
        if (prev?.done) return prev;
        // No pisar progreso local con una lectura del DB más vieja que nuestra última
        // escritura (lag de replicación / refresh disparado justo después de guardar).
        if (dbState?._w !== undefined && dbState._w <= lastWriteRef.current) return prev;
        // Si el DB no tiene fila pero ya escribimos progreso desde este dispositivo,
        // asumimos que es una lectura adelantada al upsert (no un borrado real):
        // el borrado real siempre llega también por el canal realtime (DELETE).
        if (dbState == null && prev && !prev.done && lastWriteRef.current > 0) return prev;
        return dbState;
      });
    }
  }, []);

  useEffect(() => {
    let sub;
    let realtimeChannel;
    (async () => {
      const s = await getSession();
      setSession(s);
      if (s) { try { await refresh(); } catch (e) { console.error(e); } }
      setLoaded(true);
      sub = onAuth(async (ns, event) => {
        setSession(ns);
        // El link de invitación no siempre dispara PASSWORD_RECOVERY, pero el de
        // reseteo sí; se combina con la detección del hash en el estado inicial.
        if (event === "PASSWORD_RECOVERY") setNeedsPassword(true);
        if (ns) { try { await refresh(); } catch (e) { console.error(e); } }
        else {
          setProfile(null); profileRef.current = null;
          setProfiles([]); setPoints([]); setRecorridos([]);
          setRutasGuardadas([]); setRutaDia(null); setActiveRoutes({});
        }
      });
    })();

    // Suscripción realtime: actualiza rutas activas en vivo (admin ve todas, driver solo la suya)
    try {
      realtimeChannel = subscribeRutasActivas(({ eventType, driverId, state }) => {
        setActiveRoutes((prev) => {
          if (eventType === "DELETE") {
            const next = { ...prev };
            delete next[driverId];
            return next;
          }
          return { ...prev, [driverId]: { driverId, driverNombre: state?.driverNombre, state } };
        });
        // Actualizar rutaDia propia (ignorando eco de escritura local)
        const myId = profileRef.current?.userId;
        if (driverId === myId) {
          // Ignorar cualquier eco igual o más viejo que nuestra última escritura local:
          // con escrituras rápidas seguidas, el eco de una escritura anterior puede
          // llegar después de que ya aplicamos una más nueva, y pisarla hacia atrás.
          if (state?._w !== undefined && state._w <= lastWriteRef.current) return;
          // Si la ruta local ya está marcada como done, no la pisar con el DELETE de limpieza
          setRutaDia((prev) => {
            if (eventType === "DELETE") return prev?.done ? prev : null;
            return state;
          });
        }
      });
    } catch (e) { console.error("subscribeRutasActivas:", e); }

    return () => {
      sub?.data?.subscription?.unsubscribe?.();
      if (realtimeChannel) { try { realtimeChannel.unsubscribe(); } catch {} }
    };
  }, [refresh]);

  // Bloqueo del driver: si tiene ruta activa no terminada, forzar a ruta-dia
  const isDriver     = profile?.role === "driver";
  const isSupervisor = profile?.role === "supervisor";
  const isAdmin       = profile?.role === "admin";
  const isStaff       = isAdmin || isSupervisor;   // admin y supervisor: mismo nivel operativo
  const driverBlocked = isDriver && rutaDia && !rutaDia.done;
  useEffect(() => {
    if (driverBlocked) setTab("ruta-dia");
  }, [driverBlocked]);

  const onLoadRutaDia = ({ title, stops, closed }) => {
    if (rutaDia && !rutaDia.done) {
      if (!confirm("Ya hay una ruta activa. ¿Reemplazarla?")) return;
    }
    const startStop = stops[0];
    const next = {
      title, closed,
      startId: startStop.id,
      startName: startStop.name,
      endId: closed ? startStop.id : null,
      route: [],
      remaining: stops.slice(1).map((s) => ({ id: s.id, name: s.name })),
      phase: "initial",
      nextStop: null,
      nextLegKm: "",
      done: false,
    };
    updateRutaDia(next, profile);
    setTab("ruta-dia");
  };

  const onSaveRutaGuardada = async (r) => {
    const rg = await addRutaGuardada(r);
    setRutasGuardadas((prev) => [...prev, rg]);
  };
  const onUpdateRutaGuardada = async (id, r) => {
    const rg = await updateRutaGuardada(id, r);
    setRutasGuardadas((prev) => prev.map((x) => (x.id === id ? rg : x)));
  };
  const onDeleteRutaGuardada = async (id) => {
    await removeRutaGuardada(id);
    setRutasGuardadas((prev) => prev.filter((r) => r.id !== id));
  };
  const onLoadRutaGuardada = (r) => onLoadRutaDia({ title: r.nombre, stops: r.stops, closed: r.closed });
  const onLiberarRuta = async (driverId) => {
    if (!confirm("¿Liberar / cancelar la ruta de este chofer?")) return;
    try { await clearRutaActiva(driverId); } catch (e) { console.error(e); }
  };

  const onAddPunto = async (p) => { await addPunto(p); await refresh(); };
  const onUpdatePunto = async (id, p) => { await updatePunto(id, p); await refresh(); };
  const onRemovePunto = async (id) => { await removePunto(id); await refresh(); };
  const onAddRecorrido = async (r) => {
    await addRecorrido(r);
    await refresh();
  };
  const onReplaceAll = async (p, r) => { await replaceAll(p, r); await refresh(); };
  const onUpdateProfileRole = async (userId, nombre, role) => {
    await updateProfile(userId, { nombre, role });
    setProfiles((prev) => prev.map((p) => p.userId === userId ? { ...p, nombre, role } : p));
    // Si el admin se cambia a sí mismo, actualizar su propio perfil en estado
    if (profile?.userId === userId) setProfile((prev) => ({ ...prev, nombre, role }));
  };

  const onUpdateMyName = async (nombre) => {
    const p = await updateMyName(nombre);
    setProfile((prev) => ({ ...prev, nombre: p.nombre }));
    setProfiles((prev) => prev.map((x) => x.userId === p.userId ? { ...x, nombre: p.nombre } : x));
  };
  const onAdminCrearUsuario = async (data) => {
    const p = await adminCrearUsuario(data);
    setProfiles((prev) => [...prev, p].sort((a, b) => a.nombre.localeCompare(b.nombre)));
  };
  const onAdminToggleUsuario = async (userId, disabled) => {
    const p = await adminToggleUsuario(userId, disabled);
    setProfiles((prev) => prev.map((x) => x.userId === userId ? { ...x, disabled: p.disabled } : x));
  };

  const obs = useMemo(() => deriveObservations(recorridos), [recorridos]);

  // Pestañas según rol:
  // - driver: solo "Ruta del día" (si está bloqueado, es la única) + Mi cuenta
  // - supervisor: igual que admin salvo Datos y Usuarios (datos maestros / cuentas)
  // - admin: todas
  const allTabs = [
    { id: "ruta-dia",   label: "Ruta del día",        icon: Navigation,  roles: ["admin","supervisor","driver"] },
    { id: "monitor",    label: "Monitor",              icon: Radio,       roles: ["admin","supervisor"] },
    { id: "optimizar",  label: "Generación y carga de rutas", icon: Zap,  roles: ["admin","supervisor"] },
    { id: "registrar",  label: "Registrar recorrido",  icon: Clock,       roles: ["admin","supervisor"] },
    { id: "ahorro",     label: "Análisis de ahorro",   icon: TrendingDown,roles: ["admin","supervisor"] },
    { id: "puntos",     label: "Puntos",               icon: MapPin,      roles: ["admin","supervisor"] },
    { id: "matriz",     label: "Matriz aprendida",     icon: MapIcon,     roles: ["admin","supervisor"] },
    { id: "datos",      label: "Datos",                icon: Database,    roles: ["admin"] },
    { id: "usuarios",   label: "Usuarios",             icon: UserCog,     roles: ["admin"] },
    { id: "micuenta",   label: "Mi cuenta",            icon: UserCircle,  roles: ["admin","supervisor","driver"] },
  ];
  const role = profile?.role ?? "driver";
  const tabs = driverBlocked
    ? allTabs.filter((t) => t.id === "ruta-dia")
    : allTabs.filter((t) => t.roles.includes(role));

  if (!loaded) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-500">Cargando…</div>;
  if (session && needsPassword) {
    return <SetPasswordGate onDone={() => {
      setNeedsPassword(false);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }} />;
  }
  if (!session) return <LoginGate />;

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 text-slate-950"><Truck size={24} /></div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Despacho RTB · Optimizador de Rutas</h1>
            <p className="text-xs text-slate-500">
              {profile
                ? <>{isAdmin ? <ShieldCheck size={11} className="inline mr-0.5 text-amber-400" /> : null}{profile.nombre} · {isAdmin ? "Admin" : isSupervisor ? "Supervisor" : "Chofer"}</>
                : "Aprende tiempos reales, optimiza y mide cuánto estás ahorrando"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {isStaff && (
              <div className="hidden text-right text-xs text-slate-500 sm:block">
                <div><span className="font-mono text-slate-300">{points.length}</span> puntos</div>
                <div><span className="font-mono text-slate-300">{recorridos.length}</span> recorridos</div>
              </div>
            )}
            <button onClick={signOut} title="Cerrar sesión" className="text-slate-500 hover:text-slate-300"><LogOut size={18} /></button>
          </div>
        </header>

        {tabs.length > 1 && (
          <nav className="mb-6 flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-900/50 p-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              const hasActive = t.id === "ruta-dia" && rutaDia && !rutaDia.done;
              const monitorCount = t.id === "monitor" ? Object.keys(activeRoutes).length : 0;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition ${tab === t.id ? "bg-slate-800 text-amber-400" : "text-slate-400 hover:text-slate-200"}`}>
                  <Icon size={15} /> {t.label}
                  {hasActive && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                  {monitorCount > 0 && (
                    <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-teal-600 px-1 text-[10px] font-bold text-white">{monitorCount}</span>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        {tab === "puntos"    && <PuntosTab points={points} recorridos={recorridos} onAddPunto={onAddPunto} onUpdatePunto={onUpdatePunto} onRemovePunto={onRemovePunto} />}
        {tab === "registrar" && <RegistrarTab points={points} onAddRecorrido={onAddRecorrido} />}
        {tab === "ahorro"    && <AhorroTab points={points} recorridos={recorridos} />}
        {tab === "matriz"    && <MatrizTab points={points} segments={obs.segments} />}
        {tab === "optimizar" && <OptimizarTab points={points} segments={obs.segments} waits={obs.waits} rutasGuardadas={rutasGuardadas} onSaveRutaGuardada={onSaveRutaGuardada} onUpdateRutaGuardada={onUpdateRutaGuardada} onDeleteRutaGuardada={onDeleteRutaGuardada} profiles={profiles} />}
        {tab === "ruta-dia"  && <RutaDiaTab rutaDia={rutaDia} setRutaDia={(next) => updateRutaDia(next, profile)} onSaveRuta={onAddRecorrido} allPoints={points} rutasGuardadas={rutasGuardadas} onLoadRutaGuardada={onLoadRutaGuardada} onUpdateRutaGuardada={onUpdateRutaGuardada} onDeleteRutaGuardada={onDeleteRutaGuardada} isAdmin={isStaff} profiles={profiles} />}
        {tab === "monitor"   && <MonitorTab activeRoutes={activeRoutes} profiles={profiles} onLiberar={onLiberarRuta} />}
        {tab === "datos"     && <DatosTab points={points} recorridos={recorridos} onReplaceAll={onReplaceAll} />}
        {tab === "usuarios"  && <UsuariosTab profiles={profiles} currentUserId={profile?.userId} onUpdate={onUpdateProfileRole} onCrear={onAdminCrearUsuario} onResetPassword={adminResetPassword} onToggle={onAdminToggleUsuario} />}
        {tab === "micuenta"  && <MiCuentaTab profile={profile} onUpdateName={onUpdateMyName} onChangePassword={changeMyPassword} />}
      </div>
    </div>
  );
}

/* ============================================================
   Tab: Monitor (admin) — rutas activas de todos los choferes en vivo
   ============================================================ */
/* ============================================================
   Tab: Usuarios (admin) — alta, roles, reset de contraseña y
   deshabilitar/habilitar cuentas
   ============================================================ */
const ROLE_META = {
  admin:      { label: "Administrador", badge: "bg-amber-900/40 text-amber-300" },
  supervisor: { label: "Supervisor",    badge: "bg-sky-900/40 text-sky-300" },
  driver:     { label: "Chofer",        badge: "bg-slate-800 text-slate-400" },
};

function NuevoUsuarioForm({ onCrear, onClose }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("driver");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!nombre.trim() || !email.trim()) return;
    setErr(""); setBusy(true);
    try {
      await onCrear({ nombre: nombre.trim(), email: email.trim(), role });
      onClose();
    } catch (e) { setErr(e.message || "No se pudo crear el usuario."); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserPlus size={14} className="text-amber-400" />
        <span className="text-sm font-semibold text-slate-200">Nuevo usuario</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Nombre">
          <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" />
        </Field>
        <Field label="Correo">
          <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
        </Field>
        <Field label="Rol">
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="driver">driver — Chofer</option>
            <option value="supervisor">supervisor — Supervisor</option>
            <option value="admin">admin — Administrador</option>
          </select>
        </Field>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Se envía un correo de invitación; la persona define su propia contraseña al abrirlo.</p>
      {err && <p className="mt-2 text-xs text-rose-400">{err}</p>}
      <div className="mt-3 flex gap-2">
        <Btn onClick={submit} disabled={busy || !nombre.trim() || !email.trim()} className="py-1 px-3 text-xs">
          <Mail size={12} /> {busy ? "Enviando invitación…" : "Invitar"}
        </Btn>
        <Btn variant="ghost" onClick={onClose} className="py-1 px-3 text-xs">Cancelar</Btn>
      </div>
    </Card>
  );
}

function UsuariosTab({ profiles, currentUserId, onUpdate, onCrear, onResetPassword, onToggle }) {
  const [editing, setEditing] = useState({});   // userId → { nombre, role }
  const [saving, setSaving] = useState({});     // userId → bool
  const [saved, setSaved] = useState({});       // userId → bool (tick temporal)
  const [busyAction, setBusyAction] = useState({}); // userId → "reset" | "toggle"
  const [msg, setMsg] = useState({});           // userId → texto de confirmación temporal
  const [showNew, setShowNew] = useState(false);

  const startEdit = (p) => setEditing((prev) => ({ ...prev, [p.userId]: { nombre: p.nombre, role: p.role } }));
  const cancelEdit = (userId) => setEditing((prev) => { const n = { ...prev }; delete n[userId]; return n; });

  const flash = (userId, text) => {
    setMsg((prev) => ({ ...prev, [userId]: text }));
    setTimeout(() => setMsg((prev) => { const n = { ...prev }; delete n[userId]; return n; }), 2500);
  };

  const save = async (userId) => {
    const { nombre, role } = editing[userId];
    if (!nombre.trim()) return;
    setSaving((prev) => ({ ...prev, [userId]: true }));
    try {
      await onUpdate(userId, nombre.trim(), role);
      setSaved((prev) => ({ ...prev, [userId]: true }));
      setTimeout(() => setSaved((prev) => { const n = { ...prev }; delete n[userId]; return n; }), 2000);
      cancelEdit(userId);
    } catch (e) { console.error(e); }
    finally { setSaving((prev) => { const n = { ...prev }; delete n[userId]; return n; }); }
  };

  const resetPassword = async (p) => {
    if (!p.email) return;
    if (!confirm(`¿Enviar correo de reseteo de contraseña a ${p.nombre} (${p.email})?`)) return;
    setBusyAction((prev) => ({ ...prev, [p.userId]: "reset" }));
    try { await onResetPassword(p.email); flash(p.userId, "Correo de reseteo enviado"); }
    catch (e) { flash(p.userId, e.message || "No se pudo enviar"); }
    finally { setBusyAction((prev) => { const n = { ...prev }; delete n[p.userId]; return n; }); }
  };

  const toggle = async (p) => {
    const next = !p.disabled;
    if (!confirm(next ? `¿Deshabilitar el acceso de ${p.nombre}?` : `¿Rehabilitar el acceso de ${p.nombre}?`)) return;
    setBusyAction((prev) => ({ ...prev, [p.userId]: "toggle" }));
    try { await onToggle(p.userId, next); }
    catch (e) { flash(p.userId, e.message || "No se pudo actualizar"); }
    finally { setBusyAction((prev) => { const n = { ...prev }; delete n[p.userId]; return n; }); }
  };

  return (
    <div className="space-y-3">
      {showNew ? (
        <NuevoUsuarioForm onCrear={onCrear} onClose={() => setShowNew(false)} />
      ) : (
        <Btn onClick={() => setShowNew(true)} className="text-xs">
          <UserPlus size={13} /> Nuevo usuario
        </Btn>
      )}

      {profiles.length === 0 && (
        <Card className="p-8 text-center">
          <UserCog size={36} className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">No hay perfiles registrados.</p>
        </Card>
      )}

      {profiles.map((p) => {
        const ed = editing[p.userId];
        const isSaving = saving[p.userId];
        const isSaved = saved[p.userId];
        const isMe = p.userId === currentUserId;
        const isSuperAdmin = p.userId === SUPERADMIN_ID;
        const busy = busyAction[p.userId];
        const roleMeta = ROLE_META[p.role] ?? ROLE_META.driver;
        return (
          <Card key={p.userId} className={`p-4 ${p.disabled ? "opacity-60" : ""}`}>
            {ed ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <UserCog size={14} className="text-amber-400" />
                  <span className="text-xs text-slate-400 font-mono">{p.userId.slice(0, 8)}…</span>
                  {isMe && <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">tú</span>}
                  {isSuperAdmin && <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] text-amber-300">acceso maestro</span>}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Nombre">
                    <input
                      className={inputCls}
                      value={ed.nombre}
                      onChange={(e) => setEditing((prev) => ({ ...prev, [p.userId]: { ...prev[p.userId], nombre: e.target.value } }))}
                    />
                  </Field>
                  <Field label="Rol">
                    {isSuperAdmin ? (
                      <div className={inputCls + " flex items-center gap-2 cursor-not-allowed opacity-60"}>
                        <span className="flex-1 text-amber-300">admin — Administrador</span>
                        <span className="text-[10px] text-slate-500">bloqueado</span>
                      </div>
                    ) : (
                      <select
                        className={inputCls}
                        value={ed.role}
                        onChange={(e) => setEditing((prev) => ({ ...prev, [p.userId]: { ...prev[p.userId], role: e.target.value } }))}
                      >
                        <option value="driver">driver — Chofer</option>
                        <option value="supervisor">supervisor — Supervisor</option>
                        <option value="admin">admin — Administrador</option>
                      </select>
                    )}
                  </Field>
                </div>
                <div className="flex gap-2">
                  <Btn onClick={() => save(p.userId)} disabled={isSaving || !ed.nombre.trim()} className="py-1 px-3 text-xs">
                    <Save size={12} /> {isSaving ? "Guardando…" : "Guardar"}
                  </Btn>
                  <Btn variant="ghost" onClick={() => cancelEdit(p.userId)} className="py-1 px-3 text-xs">Cancelar</Btn>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200">{p.nombre}</span>
                    {isMe && <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">tú</span>}
                    {isSuperAdmin && <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] text-amber-300">acceso maestro</span>}
                    {p.disabled && <span className="rounded bg-rose-950 px-1.5 py-0.5 text-[10px] text-rose-300">deshabilitado</span>}
                    {isSaved && <CheckCircle2 size={13} className="text-teal-400" />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${roleMeta.badge}`}>{p.role}</span>
                    {isSuperAdmin && <span className="text-slate-600">rol permanente</span>}
                    {p.email && <span className="text-slate-600">{p.email}</span>}
                    {msg[p.userId] && <span className="text-teal-400">{msg[p.userId]}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.email && (
                    <Btn variant="ghost" onClick={() => resetPassword(p)} disabled={!!busy} className="py-1 px-2 text-xs" title="Resetear contraseña">
                      <KeyRound size={13} /> {busy === "reset" ? "…" : ""}
                    </Btn>
                  )}
                  {!isSuperAdmin && !isMe && (
                    <Btn variant="ghost" onClick={() => toggle(p)} disabled={!!busy}
                      className={`py-1 px-2 text-xs ${p.disabled ? "text-teal-400" : "text-rose-300"}`}
                      title={p.disabled ? "Rehabilitar" : "Deshabilitar"}>
                      <Ban size={13} /> {busy === "toggle" ? "…" : ""}
                    </Btn>
                  )}
                  <Btn variant="ghost" onClick={() => startEdit(p)} className="py-1 px-2 text-slate-400 hover:text-slate-200">
                    <Pencil size={13} />
                  </Btn>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ============================================================
   Tab: Mi cuenta (todos los roles) — nombre propio y contraseña
   ============================================================ */
function MiCuentaTab({ profile, onUpdateName, onChangePassword }) {
  const [nombre, setNombre] = useState(profile?.nombre ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState("");

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  const saveName = async () => {
    if (!nombre.trim() || nombre.trim() === profile?.nombre) return;
    setSavingName(true); setNameMsg("");
    try { await onUpdateName(nombre.trim()); setNameMsg("Guardado"); }
    catch (e) { setNameMsg(e.message || "No se pudo guardar"); }
    finally { setSavingName(false); setTimeout(() => setNameMsg(""), 2500); }
  };

  const savePassword = async () => {
    setPwErr(""); setPwMsg("");
    if (pw.length < 6) { setPwErr("La contraseña debe tener al menos 6 caracteres."); return; }
    if (pw !== pw2) { setPwErr("Las contraseñas no coinciden."); return; }
    setSavingPw(true);
    try { await onChangePassword(pw); setPw(""); setPw2(""); setPwMsg("Contraseña actualizada"); }
    catch (e) { setPwErr(e.message || "No se pudo cambiar la contraseña."); }
    finally { setSavingPw(false); }
  };

  return (
    <div className="max-w-md space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <UserCircle size={14} className="text-amber-400" />
          <span className="text-sm font-semibold text-slate-200">Mi nombre</span>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Nombre">
              <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Field>
          </div>
          <Btn onClick={saveName} disabled={savingName || !nombre.trim() || nombre.trim() === profile?.nombre} className="py-2 px-3 text-xs">
            <Save size={12} /> {savingName ? "Guardando…" : "Guardar"}
          </Btn>
        </div>
        {nameMsg && <p className="mt-2 text-xs text-teal-400">{nameMsg}</p>}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound size={14} className="text-amber-400" />
          <span className="text-sm font-semibold text-slate-200">Cambiar contraseña</span>
        </div>
        <div className="space-y-2">
          <Field label="Nueva contraseña">
            <input type="password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label="Repite la contraseña">
            <input type="password" className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePassword()} />
          </Field>
          {pwErr && <p className="text-xs text-rose-400">{pwErr}</p>}
          {pwMsg && <p className="text-xs text-teal-400">{pwMsg}</p>}
          <Btn onClick={savePassword} disabled={savingPw || !pw || !pw2} className="text-xs">
            {savingPw ? "Guardando…" : "Actualizar contraseña"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

function MonitorTab({ activeRoutes, profiles, onLiberar }) {
  const entries = Object.values(activeRoutes);
  if (entries.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Radio size={36} className="mx-auto mb-3 text-slate-600" />
        <p className="text-sm text-slate-400">No hay rutas en curso en este momento.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{entries.length} {entries.length === 1 ? "ruta activa" : "rutas activas"} · actualización en vivo</p>
      {entries.map(({ driverId, driverNombre, state }) => {
        if (!state) return null;
        const { title, route = [], remaining = [], phase, done } = state;
        const phaseLabel = { initial: "En espera", "at-stop": "En parada", "choose-next": "Eligiendo destino", traveling: "En camino" }[phase] ?? phase;
        return (
          <Card key={driverId} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Users size={14} className="shrink-0 text-amber-400" />
                  <span className="text-sm font-semibold text-slate-200">{driverNombre ?? "Chofer"}</span>
                  {done && <span className="rounded bg-teal-900/60 px-1.5 py-0.5 text-[10px] text-teal-300">Terminada</span>}
                </div>
                <p className="text-xs text-slate-400 mb-2">{title}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span><span className="font-mono text-teal-300">{route.length}</span> visitadas</span>
                  <span><span className="font-mono text-slate-300">{remaining.length}</span> pendientes</span>
                  <span className="text-slate-600">Fase: <span className="text-slate-400">{phaseLabel}</span></span>
                  {route.length > 0 && (
                    <span className="text-slate-600">Última: <span className="text-slate-300">{route[route.length - 1]?.name}</span></span>
                  )}
                </div>
              </div>
              {!done && (
                <Btn
                  variant="ghost"
                  onClick={() => onLiberar(driverId)}
                  className="shrink-0 py-1 px-2.5 text-xs text-rose-400 hover:text-rose-300"
                >
                  <X size={13} /> Liberar
                </Btn>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ============================================================
   Tab: Puntos
   ============================================================ */
const isValidLat = (v) => v.trim() !== "" && !isNaN(Number(v)) && Number(v) >= -90 && Number(v) <= 90;
const isValidLng = (v) => v.trim() !== "" && !isNaN(Number(v)) && Number(v) >= -180 && Number(v) <= 180;
const googleMapsUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

function PuntosTab({ points, recorridos, onAddPunto, onUpdatePunto, onRemovePunto }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("entrega");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  // Centro por defecto del mapa al crear: el depósito con coordenadas, o la ciudad.
  const defaultCenter = useMemo(() => {
    const dep = points.find((p) => p.type === "deposito" && p.lat != null && p.lng != null);
    return dep ? { lat: dep.lat, lng: dep.lng } : CITY_FALLBACK;
  }, [points]);

  // Nombre duplicado (ignorando mayúsculas/espacios), excluyendo el propio punto en edición.
  const nameTaken = useMemo(() => {
    const n = name.trim().toLowerCase();
    if (!n) return false;
    return points.some((p) => p.id !== editId && p.name.trim().toLowerCase() === n);
  }, [points, name, editId]);

  const hasValidCoords = isValidLat(lat) && isValidLng(lng);
  const mapLat = hasValidCoords ? Number(lat) : undefined;
  const mapLng = hasValidCoords ? Number(lng) : undefined;

  const startEdit = (p) => {
    setEditId(p.id);
    setErr("");
    setName(p.name);
    setType(p.type);
    setLat(p.lat != null ? String(p.lat) : "");
    setLng(p.lng != null ? String(p.lng) : "");
  };

  const cancelEdit = () => {
    setEditId(null);
    setErr("");
    setName(""); setType("entrega"); setLat(""); setLng("");
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || busy) return;
    setErr("");
    if (nameTaken) { setErr("Ya existe un punto con ese nombre."); return; }
    if (lat.trim() && !isValidLat(lat)) { setErr("Latitud inválida: debe estar entre -90 y 90."); return; }
    if (lng.trim() && !isValidLng(lng)) { setErr("Longitud inválida: debe estar entre -180 y 180."); return; }
    setBusy(true);
    try {
      const payload = { name: trimmedName, type, lat: lat.trim() ? parseFloat(lat) : null, lng: lng.trim() ? parseFloat(lng) : null };
      if (editId) {
        await onUpdatePunto(editId, payload);
        setEditId(null);
      } else {
        await onAddPunto(payload);
      }
      setName(""); setType("entrega"); setLat(""); setLng("");
    } catch (e) {
      setErr(e?.code === "23505" ? "Ya existe un punto con ese nombre." : (e?.message || "No se pudo guardar el punto."));
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    const target = points.find((p) => p.id === id);
    const enRecorridos = recorridos.filter((R) => R.stops.some((s) => s.point === id));
    const seEliminarian = enRecorridos.filter((R) => R.stops.filter((s) => s.point !== id).length < 2);
    const detalle = enRecorridos.length
      ? `Está en ${enRecorridos.length} recorrido${enRecorridos.length === 1 ? "" : "s"}.` +
        (seEliminarian.length
          ? ` ${seEliminarian.length} quedaría${seEliminarian.length === 1 ? "" : "n"} con menos de 2 paradas y se eliminaría${seEliminarian.length === 1 ? "" : "n"} también.`
          : "")
      : "No está en ningún recorrido.";
    if (!window.confirm(`¿Eliminar "${target?.name ?? "este punto"}"?\n\n${detalle}`)) return;
    if (editId === id) cancelEdit();
    if (expandedId === id) setExpandedId(null);
    await onRemovePunto(id);
  };

  const copyCoords = async (p) => {
    try { await navigator.clipboard.writeText(`${p.lat}, ${p.lng}`); } catch { /* portapapeles no disponible */ }
  };

  const filtered = search.trim()
    ? points.filter((p) =>
        p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        TYPE_META[p.type].label.toLowerCase().includes(search.trim().toLowerCase())
      )
    : points;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">
          {editId ? "Editar punto" : "Nuevo punto"}
        </h2>
        <div className="space-y-3">
          <Field label="Nombre">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Almacén / Cliente / Sucursal" />
          </Field>
          {nameTaken && <p className="text-xs text-rose-400">Ya existe un punto con ese nombre.</p>}
          <Field label="Tipo">
            <div className="flex gap-1">
              {Object.entries(TYPE_META).map(([k, v]) => (
                <button key={k} onClick={() => setType(k)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs ${type === k ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-slate-700 text-slate-400"}`}>
                  {v.label}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitud (opcional)"><input className={inputCls} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="19.4326" /></Field>
            <Field label="Longitud (opcional)"><input className={inputCls} value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-99.1332" /></Field>
          </div>
          <Suspense fallback={<MapFallback className="h-56 w-full rounded-lg" />}>
            <LeafletMap
              interactive
              className="h-56 w-full overflow-hidden rounded-lg"
              lat={mapLat}
              lng={mapLng}
              defaultCenter={defaultCenter}
              onPick={(la, ln) => { setLat(la.toFixed(6)); setLng(ln.toFixed(6)); }}
            />
          </Suspense>
          <p className="text-xs text-slate-500">Coordenadas opcionales: haz clic en el mapa o arrastra el pin para fijarlas; también puedes teclearlas.</p>
          {err && <p className="text-xs text-rose-400">{err}</p>}
          <div className="flex gap-2">
            {editId && (
              <Btn variant="ghost" onClick={cancelEdit} className="flex-1 justify-center">
                <X size={16} /> Cancelar
              </Btn>
            )}
            <Btn onClick={save} disabled={busy || nameTaken} className={`${editId ? "flex-1" : "w-full"} justify-center`}>
              {editId ? <><Save size={16} /> Guardar cambios</> : <><Plus size={16} /> Agregar punto</>}
            </Btn>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Puntos registrados</h2>
        {points.length > 0 && (
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              className={inputCls + " pl-8"}
              placeholder="Buscar punto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        {points.length === 0 ? (
          <Empty>Aún no hay puntos. Agrega tu almacén como <span className="text-amber-400">Depósito</span> y tus clientes.</Empty>
        ) : filtered.length === 0 ? (
          <Empty>Sin resultados para <span className="text-slate-300">"{search}"</span>.</Empty>
        ) : (
          <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
            {filtered.map((p) => (
              <li key={p.id}
                className={`rounded-lg border bg-slate-950/50 transition ${editId === p.id ? "border-amber-500/50 bg-amber-500/5" : "border-slate-800"}`}>
                <div role="button" tabIndex={0}
                  onClick={() => setExpandedId((cur) => cur === p.id ? null : p.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedId((cur) => cur === p.id ? null : p.id); } }}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TYPE_META[p.type].dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-200">{p.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {TYPE_META[p.type].label}
                      {p.lat != null && p.lng != null && <span className="font-mono"> · {p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>}
                    </div>
                  </div>
                  <ChevronDown size={15}
                    className={`shrink-0 transition ${expandedId === p.id ? "rotate-180 text-amber-400" : "text-slate-600"}`} />
                  <button onClick={(e) => { e.stopPropagation(); editId === p.id ? cancelEdit() : startEdit(p); }}
                    className={`shrink-0 transition ${editId === p.id ? "text-amber-400" : "text-slate-600 hover:text-amber-400"}`}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); remove(p.id); }} className="shrink-0 text-slate-600 hover:text-rose-400">
                    <Trash2 size={15} />
                  </button>
                </div>
                {expandedId === p.id && (
                  <div className="space-y-2 border-t border-slate-800 px-3 py-3">
                    {p.lat != null && p.lng != null ? (
                      <>
                        <Suspense fallback={<MapFallback className="h-40 w-full rounded-lg" />}>
                          <LeafletMap className="h-40 w-full overflow-hidden rounded-lg" lat={p.lat} lng={p.lng} />
                        </Suspense>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-slate-400">{p.lat.toFixed(6)}, {p.lng.toFixed(6)}</span>
                          <button onClick={() => copyCoords(p)} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-300">
                            <Copy size={12} /> Copiar
                          </button>
                        </div>
                        <a href={googleMapsUrl(p)} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700">
                          <ExternalLink size={13} /> Ver ubicación en Google Maps
                        </a>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500">Este punto no tiene coordenadas registradas.</p>
                        <div className="flex items-center gap-2">
                          <span className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-600">
                            <ExternalLink size={13} /> Ver ubicación en Google Maps
                          </span>
                          <Btn variant="ghost" onClick={() => startEdit(p)} className="justify-center text-xs">
                            <Pencil size={13} /> Agregar coordenadas
                          </Btn>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
const DRAFT_KEY = "rtb_drafts";

function RegistrarTab({ points, onAddRecorrido }) {
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

  if (points.length < 2) return <Card className="p-6"><Empty>Necesitas al menos 2 puntos. Créalos en <span className="text-amber-400">Puntos</span>.</Empty></Card>;

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
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${isActive ? "border-amber-500/50 bg-amber-500/5" : "border-slate-800 bg-slate-950/50"}`}>
                  <FileText size={14} className={isActive ? "text-amber-400 shrink-0" : "text-slate-600 shrink-0"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-200">{d.dateISO}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{d.seq.length} paradas</span>
                      {isActive && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">editando</span>}
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
                  <div className="mb-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-3 lg:grid-cols-6">
                    <Stat label="Tu orden (en matriz)" value={fmtMin(r.realOnMatrix)} color="text-rose-300" />
                    <Stat label="Orden óptimo" value={fmtMin(r.optCost)} color="text-amber-300" />
                    <Stat label="Real medido ese día" value={fmtMin(r.realMeasured)} />
                    <Stat label="Espera total" value={fmtMin(r.totalWait)} color="text-sky-300" />
                    {r.totalBreak > 0 && <Stat label="Comida" value={fmtMin(r.totalBreak)} color="text-orange-300" />}
                    <Stat label="Total ruta" value={fmtMin(r.realMeasured + r.totalWait + r.totalBreak)} color="text-violet-300" highlight />
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
   Tab: Generación y carga de rutas (antes "Optimizar")

   Calcula la ruta óptima (tiempo o distancia), permite reordenarla a
   mano y anclar paradas, la muestra en un mapa con ETA por parada, y
   la asigna a un chofer (obligatorio) — el chofer la inicia desde su
   Ruta del día.
   ============================================================ */
function OptimizarTab({ points, segments, waits, rutasGuardadas = [], onSaveRutaGuardada, onUpdateRutaGuardada, onDeleteRutaGuardada, profiles = [] }) {
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
      <h2 className="text-lg font-bold text-slate-100">Generación y carga de rutas</h2>
      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-200">Puntos a visitar hoy</h2>
            <div className="relative mb-2">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
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
                        className={`rounded-lg border px-2.5 py-2 text-left text-xs transition ${isStart ? "border-amber-500 bg-amber-500/15 text-amber-200" : on ? "border-teal-500 bg-teal-500/10 text-teal-200" : "border-slate-700 text-slate-400 hover:border-slate-600"}`}>
                        <div className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${TYPE_META[p.type].dot}`} /><span className="truncate">{p.name}</span></div>
                        {isStart && <span className="text-[10px] text-amber-400/80">Inicio</span>}
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
                <button onClick={() => setClosed(true)} className={`flex-1 rounded-lg border px-2 py-2 text-xs ${closed ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-slate-700 text-slate-400"}`}>Cerrada (regresa)</button>
                <button onClick={() => setClosed(false)} className={`flex-1 rounded-lg border px-2 py-2 text-xs ${!closed ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-slate-700 text-slate-400"}`}>Abierta</button>
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
      {error && <Card className="border-rose-900/50 bg-rose-950/20 p-4 text-sm text-rose-300"><AlertTriangle size={16} className="mb-1 inline" /> {error}</Card>}
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
  if (!rutasGuardadas.length) return null;
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-200">Rutas guardadas</h3>
      <ul className="divide-y divide-slate-800">
        {rutasGuardadas.map((r) => {
          const chofer = r.assignedTo ? profiles.find((p) => p.userId === r.assignedTo)?.nombre ?? "Chofer asignado" : null;
          return (
            <li key={r.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${editingId === r.id ? "bg-amber-500/5" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-200">{r.nombre}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                  {r.fecha && <span className="flex items-center gap-1"><Calendar size={11} /> {r.fecha}</span>}
                  <span>{r.stops.length} paradas</span>
                  <span>{r.closed ? "Cerrada" : "Abierta"}</span>
                  {chofer ? <span className="flex items-center gap-1 text-amber-600"><Users size={10} /> {chofer}</span> : <span className="text-slate-700">Sin asignar</span>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Btn variant="ghost" onClick={() => onEdit(r)} className="py-1 px-2.5 text-xs">
                  <Pencil size={13} /> Editar
                </Btn>
                <Btn
                  variant="ghost"
                  onClick={() => { if (confirm(`¿Eliminar "${r.nombre}"?`)) onDelete(r.id); }}
                  className="py-1 px-2 text-rose-400 hover:text-rose-300"
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
        className={`shrink-0 ${anchored ? "text-amber-400" : "text-slate-500 hover:text-slate-300"}`}>
        {anchored ? <Lock size={13} /> : <Unlock size={13} />}
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-10 w-44 rounded-lg border border-slate-700 bg-slate-900 p-1 text-xs shadow-lg">
          <button onClick={() => { onFree(); setOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-slate-300 hover:bg-slate-800">Libre</button>
          <button onClick={() => { onFirst(); setOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-slate-300 hover:bg-slate-800">Primera tras el inicio</button>
          <button onClick={() => { onLast(); setOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-slate-300 hover:bg-slate-800">Última antes de regresar</button>
          <button onClick={() => { onHere(); setOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-slate-300 hover:bg-slate-800">Fijar en esta posición</button>
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
          <button onClick={() => onCriterio("time")} className={`rounded-lg border px-3 py-1.5 text-xs ${criterio === "time" ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-slate-700 text-slate-400"}`}>Por tiempo</button>
          <button onClick={() => onCriterio("dist")} disabled={session.distUnavailable} className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-30 ${criterio === "dist" ? "border-sky-500 bg-sky-500/10 text-sky-300" : "border-slate-700 text-slate-400"}`}>Por distancia</button>
          {session.distUnavailable && <span className="text-[10px] text-slate-600">faltan coordenadas/km para distancia</span>}
          <span className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
            {session.optExactTime ? "Óptima exacta" : `Heurística (${session.n} puntos)`}
          </span>
        </div>

        {criteriaDiffer && (
          <p className="mb-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs text-slate-400">
            <GitCompare size={14} className="shrink-0 text-slate-500" />
            {criterio === "time" ? "Si priorizaras distancia, el orden óptimo sería otro." : "Si priorizaras tiempo, el orden óptimo sería otro."}
          </p>
        )}

        <div className={`mb-3 grid gap-2 text-center ${comidaMin > 0 ? "grid-cols-4" : "grid-cols-3"}`}>
          <Stat label="Manejo" value={fmtMin(curStats.totT)} highlight={criterio === "time"} />
          <Stat label="Esperas" value={fmtMin(curStats.totW)} />
          {comidaMin > 0 && <Stat label="Comida" value={fmtMin(comidaMin)} color="text-orange-300" />}
          <Stat label="Total día" value={fmtMin(curStats.totT + curStats.totW + comidaMin)} highlight />
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-slate-500">
          <span>Distancia: <span className={`font-mono ${criterio === "dist" ? "text-sky-300" : "text-slate-300"}`}>{fmtKm(curStats.totD)}</span></span>
          {etaInfo && <span>Regreso: <span className="font-mono text-slate-300">{minToHHMM(etaInfo.horaRegresoMin)}{etaInfo.approxReturn ? " ≈" : ""}</span></span>}
        </div>

        {!isManualOptimal && optStats && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-700/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            <span>{deltaAbs >= 0 ? "+" : ""}{fmtMin(deltaAbs)} · {deltaAbs >= 0 ? "+" : ""}{deltaPct.toFixed(0)}% que el óptimo</span>
            <button onClick={onRestoreOptimal} className="shrink-0 underline hover:text-amber-200">Restaurar orden óptimo</button>
          </div>
        )}
        {isManualOptimal && <p className="mb-3 text-center text-xs text-teal-400">Orden óptimo</p>}
        {curStats.anyEst && <p className="mb-3 text-center text-[10px] text-rose-300">incluye tramos estimados</p>}

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
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${isStart ? "border-amber-500/40 bg-amber-500/5" : "border-slate-800 bg-slate-950/40"}`}
              >
                {!isStart && <GripVertical size={13} className="shrink-0 cursor-grab text-slate-600" />}
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-slate-200">{p.name}{isStart && <span className="ml-1 text-[10px] text-amber-400/80">Inicio</span>}</span>
                {leg && <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500"><ChevronRight size={11} /><span className={`font-mono ${leg.learned ? "text-teal-400" : "text-rose-400"}`}>{fmtMin(leg.min)}</span></span>}
                {eta && <span className="shrink-0 font-mono text-[11px] text-slate-400">{minToHHMM(eta.etaMin)}{eta.approx ? "≈" : ""}</span>}
                {!isStart && (
                  <>
                    <button onClick={() => move(i, -1)} disabled={i <= 1} className="shrink-0 text-slate-500 hover:text-slate-300 disabled:opacity-20"><ArrowUp size={13} /></button>
                    <button onClick={() => move(i, 1)} disabled={i >= manualOrder.length - 1} className="shrink-0 text-slate-500 hover:text-slate-300 disabled:opacity-20"><ArrowDown size={13} /></button>
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
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-xs text-slate-500">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px]">↩</span>
            <span>Regreso al inicio</span>
            <span className="ml-auto font-mono">{fmtMin(curStats.legs[curStats.legs.length - 1].min)}</span>
          </div>
        )}

        {missingCoordsCount > 0 && (
          <p className="mt-2 text-[11px] text-slate-500">{missingCoordsCount} parada(s) sin coordenadas no se muestran en el mapa.</p>
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
      <h3 className="mb-3 text-sm font-semibold text-slate-200">
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
          <p className="rounded-lg border border-rose-800/50 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
            <AlertTriangle size={13} className="mr-1 inline" />
            Este chofer ya tiene la ruta "{conflict.nombre}" asignada el {fecha}.
            {!confirmConflict && " Presiona \"Asignar a chofer\" otra vez para confirmar."}
          </p>
        )}
        {saveError && (
          <p className="rounded-lg border border-rose-800/50 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
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
        <Btn variant="ghost" onClick={() => doSave(null)} disabled={saving || !nombre.trim()} className="w-full justify-center text-slate-400">
          <BookMarked size={15} /> {editingRoute ? "Guardar como plantilla nueva" : "Guardar plantilla sin asignar"}
        </Btn>
      </div>
    </Card>
  );
}

/* ============================================================
   Tab: Ruta del día
   ============================================================ */
function RutaDiaTab({ rutaDia, setRutaDia, onSaveRuta, allPoints, rutasGuardadas = [], onLoadRutaGuardada, onUpdateRutaGuardada, onDeleteRutaGuardada, isAdmin = false, profiles = [] }) {
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

  const startEdit = (r) => { setEditId(r.id); setEditStops(r.stops); setEditSearch(""); setEditAssignedTo(r.assignedTo ?? ""); };
  const cancelEdit = () => { setEditId(null); setEditStops([]); setEditSearch(""); setEditAssignedTo(null); };
  const saveEdit = async (r) => {
    if (editStops.length < 2) return;
    setEditSaving(true);
    try {
      await onUpdateRutaGuardada(r.id, { nombre: r.nombre, fecha: r.fecha, closed: r.closed, stops: editStops, assignedTo: editAssignedTo || null, horaInicio: r.horaInicio ?? null });
      cancelEdit();
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  if (!rutaDia) {
    return (
      <div className="space-y-4">
        <Card className="p-6">
          <Empty>
            {isAdmin
              ? <>No tienes una ruta en curso. Si ya asignaste una, aparece abajo — presiona <span className="text-amber-400">"Cargar"</span>. Para crear y asignar una nueva ve a <span className="text-amber-400">Generación y carga de rutas</span>.</>
              : <>No tienes una ruta asignada en curso. Cuando el despachador te asigne una aparecerá abajo — presiona <span className="text-amber-400">"Cargar"</span> para iniciarla.</>}
          </Empty>
        </Card>
        {rutasGuardadas.length > 0 && (
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <BookMarked size={15} className="text-amber-400" /> Rutas guardadas
            </h3>
            <ul className="space-y-2">
              {rutasGuardadas.map((r) => (
                <li key={r.id} className="rounded-lg border border-slate-700 bg-slate-800/50">
                  {editId === r.id ? (
                    /* ---- Editor inline ---- */
                    <div className="p-3 space-y-3">
                      <p className="text-xs font-semibold text-amber-300">Editando: {r.nombre}</p>

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
                            <span className="flex items-center gap-1 text-amber-600">
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
                              onClick={() => { if (confirm(`¿Eliminar "${r.nombre}"?`)) onDeleteRutaGuardada(r.id); }}
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

  const { title, closed, startId, startName, endId, route, remaining, phase, nextStop, nextLegKm, done } = rutaDia;
  const patch = (updates) => setRutaDia({ ...rutaDia, ...updates });

  /* Puntos disponibles como "extra" (no planificados, no visitados, no el inicio) */
  const visitedIds = new Set(route.map((s) => s.id));
  const remainingIds = new Set(remaining.map((s) => s.id));
  const extraPoints = (allPoints || []).filter(
    (p) => !visitedIds.has(p.id) && !remainingIds.has(p.id) && p.id !== startId
  );

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
      };
    });
    setSaving(true); setErr("");
    try {
      await onSaveRuta({ dateISO: today, ts: Date.now(), stops: recStops });
      patch({ route: finalRoute, done: true });
    } catch { setErr("Error al guardar. Intenta de nuevo."); }
    finally { setSaving(false); }
  };

  /* -------- Handlers por fase -------- */
  const handleInitialArrival = () => {
    patch({
      route: [{ id: startId, name: startName, arrivedAt: Date.now(), departedAt: null, legKm: "" }],
      phase: "at-stop",
    });
  };

  const handleDeparture = () => {
    const now = Date.now();
    patch({
      route: route.map((s, i) => i === route.length - 1 ? { ...s, departedAt: now } : s),
      phase: "choose-next",
    });
  };

  const handleSelectNext = (stop) => {
    patch({
      remaining: remaining.filter((s) => s.id !== stop.id),
      nextStop: stop,
      nextLegKm: "",
      phase: "traveling",
    });
    setExtraSearch("");
  };

  const handleArrival = async () => {
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

  const cancel = () => {
    if (confirm("¿Cancelar la ruta del día? Se perderán los tiempos registrados.")) setRutaDia(null);
  };

  const curStop = route.length > 0 ? route[route.length - 1] : null;

  /* -------- Done -------- */
  if (done) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle2 size={44} className="mx-auto mb-3 text-teal-400" />
        <h2 className="mb-1 text-base font-semibold text-slate-200">¡Ruta completada!</h2>
        <p className="mb-5 text-sm text-slate-400">El recorrido fue guardado y ya alimenta el aprendizaje del sistema.</p>
        <Btn variant="ghost" onClick={() => setRutaDia(null)}>Nueva ruta del día</Btn>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Ruta del día · {title}</h2>
            <p className="text-xs text-slate-500">
              {route.length} visitadas · {remaining.length} planificadas pendientes · {closed ? "Ruta cerrada" : "Ruta abierta"}
            </p>
          </div>
          {isAdmin && <Btn variant="danger" onClick={cancel}>Cancelar ruta</Btn>}
        </div>
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
                <li key={i} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${isLast ? "border-amber-500/50 bg-amber-500/5" : "border-teal-900/40 bg-teal-950/20"}`}>
                  <div className="mt-0.5 shrink-0">
                    {isLast
                      ? <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-950">{i + 1}</span>
                      : <CheckCircle2 size={18} className="text-teal-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isLast ? "text-amber-200" : "text-teal-200"}`}>{stop.name}</span>
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
            <h3 className="mb-3 text-sm font-semibold text-slate-200">¿A dónde vas ahora?</h3>

            {remaining.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Paradas planificadas pendientes</p>
                <ul className="space-y-1.5">
                  {remaining.map((stop) => (
                    <li key={stop.id}>
                      <button onClick={() => handleSelectNext(stop)}
                        className="flex w-full items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5 text-left transition hover:border-slate-600">
                        <MapPin size={14} className="shrink-0 text-amber-400" />
                        <span className="text-sm text-slate-200">{stop.name}</span>
                        <ChevronRight size={14} className="ml-auto text-slate-600" />
                      </button>
                    </li>
                  ))}
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
                  className="flex w-full items-center gap-3 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2.5 text-left transition hover:border-amber-700/50">
                  <Navigation size={14} className="shrink-0 text-amber-400" />
                  <span className="text-sm text-amber-300">Regresar al almacén (cerrar ruta)</span>
                  <ChevronRight size={14} className="ml-auto text-amber-700" />
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
            <h3 className="mb-3 text-sm font-semibold text-slate-200">En camino a {nextStop.name}</h3>
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
