import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  MapPin, Clock, Zap, TrendingDown, LogOut, Navigation,
  Award, Radio, Map as MapIcon, Database, ShieldCheck, UserCog, UserCircle,
} from "lucide-react";
import {
  getSession, signOut, onAuth,
  getMyProfile, getProfiles, updateProfile, updateMyName,
  changeMyPassword,
  adminCrearUsuario, adminResetPassword, adminToggleUsuario,
  getPuntos, addPunto, updatePunto, removePunto,
  getRecorridos, addRecorrido, getBackup, restoreBackup,
  getRutasGuardadas, addRutaGuardada, updateRutaGuardada, removeRutaGuardada,
  getAllRutasActivas, getRutaActiva, saveRutaActiva, clearRutaActiva, subscribeRutasActivas,
} from "./lib/supabase";
import { deriveObservations } from "./lib/routing";
import { genEditId } from "./lib/utils";
import { saveLocal, readLocal, clearLocal, reconcile } from "./lib/rutaDiaCache";
import { mergeRutaActiva, effectivePending } from "./lib/rutaActivaMerge";
import { LoginGate, SetPasswordGate } from "./components/auth/LoginGate";
import { FeedbackProvider, useToast, useConfirm } from "./components/feedback";
import SeguimientoTab from "./components/seguimiento/SeguimientoTab";
import EvaluacionTab from "./components/evaluacion/EvaluacionTab";
import PuntosTab from "./components/puntos/PuntosTab";
import RegistrarTab from "./components/registrar/RegistrarTab";
import AhorroTab from "./components/ahorro/AhorroTab";
import MatrizTab from "./components/matriz/MatrizTab";
import OptimizarTab from "./components/optimizar/OptimizarTab";
import RutaDiaTab from "./components/rutadia/RutaDiaTab";
import DatosTab from "./components/datos/DatosTab";
import UsuariosTab from "./components/usuarios/UsuariosTab";
import MiCuentaTab from "./components/micuenta/MiCuentaTab";

// Envoltorio delgado: FeedbackProvider (toasts/confirm propios, ver
// src/components/feedback.jsx) debe quedar POR ENCIMA del componente que
// usa useToast()/useConfirm() — de ahí la separación en dos funciones.
export default function OptimizadorRutas() {
  return (
    <FeedbackProvider>
      <AppInner />
    </FeedbackProvider>
  );
}

function AppInner() {
  const toast = useToast();
  const confirm = useConfirm();
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

  // Indicador de conexión para la caché offline de ruta_activa (ver rutaDiaCache.js):
  // "online" refleja el navegador; "syncOk" si la última escritura llegó a Supabase.
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [syncOk, setSyncOk] = useState(true);

  // Wrapper que persiste el progreso a Supabase y actualiza el estado local.
  // Recibe profile como parámetro para evitar stale-closure (se llama desde callbacks).
  // Escribe PRIMERO en localStorage (nunca falla, protege contra pérdida de progreso
  // sin red) y luego intenta el upsert (merge_ruta_activa) a Supabase.
  //
  // El chofer solo escribe el grupo "driver" (route/phase/nextStop/etc — ver
  // rutaActivaMerge.js): se bumpea `_wDriver`, y se preservan `_wPlan`/`_wDispatch`
  // que ya venían en `next` (el plan/notas del despacho, sin tocar). El wrapper
  // que edita el plan del despacho es `applyDispatchEdit`, más abajo.
  const updateRutaDia = useCallback((next, prof) => {
    setRutaDia(next);
    const p = prof ?? profileRef.current;
    if (!p) return;
    const stamp = Date.now();
    lastWriteRef.current = stamp;
    let stamped = next ? { ...next, _wDriver: stamp } : null;
    if (stamped) {
      stamped._wPlan = stamped._wPlan ?? -1;
      stamped._wDispatch = stamped._wDispatch ?? -1;
      stamped._w = Math.max(stamped._wDriver, stamped._wPlan, stamped._wDispatch);
    }
    if (stamped && !stamped.done) saveLocal(p.userId, stamped);
    else clearLocal(p.userId);
    (async () => {
      try {
        if (next && !next.done) {
          await saveRutaActiva(p.userId, p.nombre, stamped);
        } else {
          await clearRutaActiva(p.userId);
        }
        setSyncOk(true);
      } catch (e) {
        console.error("ruta_activa sync:", e);
        setSyncOk(false);
      }
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
      // Tercera fuente: la caché del teléfono (localStorage). reconcile() fusiona
      // por grupo de campos (mergeRutaActiva) — cubre el caso de progreso propio
      // guardado sin red que el servidor todavía no tiene, Y el caso de que el
      // despacho haya editado el plan mientras estábamos desconectados.
      const localState = readLocal(prof.userId);
      const candidate = reconcile(localState, dbState);
      setRutaDia((prev) => {
        // No pisar la pantalla "done" con estado viejo si acabamos de terminar la ruta
        if (prev?.done) return prev;
        if (candidate == null) {
          // Ni servidor ni caché: si ya escribimos progreso desde este dispositivo,
          // asumimos que es una lectura adelantada (no un borrado real): el borrado
          // real siempre llega también por el canal realtime (evento DELETE).
          if (prev && !prev.done && lastWriteRef.current > 0) return prev;
          return null;
        }
        // Fusionar con lo que ya tenemos en memoria: por grupo, no por sello
        // global — así una edición del despacho con sello menor al de nuestra
        // última escritura de progreso (pero real y más nueva que la que
        // teníamos de SU grupo) no se descarta por error.
        return mergeRutaActiva(prev, candidate);
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

    // Suscripción realtime: actualiza rutas activas en vivo (admin ve todas, driver solo la suya).
    // Cada evento se FUSIONA por grupo de campos (mergeRutaActiva) contra lo que ya
    // tenemos, en vez de reemplazar de golpe: así el eco de una escritura propia, o
    // una edición del despacho sobre el plan de OTRO chofer, nunca pisan un grupo
    // ajeno más nuevo (ver src/lib/rutaActivaMerge.js).
    try {
      realtimeChannel = subscribeRutasActivas(({ eventType, driverId, state }) => {
        setActiveRoutes((prev) => {
          if (eventType === "DELETE") {
            const next = { ...prev };
            delete next[driverId];
            return next;
          }
          const prevState = prev[driverId]?.state ?? null;
          const merged = mergeRutaActiva(prevState, state);
          return { ...prev, [driverId]: { driverId, driverNombre: merged?.driverNombre ?? state?.driverNombre, state: merged } };
        });
        // Actualizar rutaDia propia (fusión por grupo, no reemplazo)
        const myId = profileRef.current?.userId;
        if (driverId === myId) {
          if (eventType === "DELETE") {
            clearLocal(myId);
            setRutaDia((prev) => (prev?.done ? prev : null));
            return;
          }
          setRutaDia((prev) => {
            const merged = mergeRutaActiva(prev, state);
            saveLocal(myId, merged);
            return merged;
          });
        }
      });
    } catch (e) { console.error("subscribeRutasActivas:", e); }

    // Re-sincronización: al recuperar la conexión, empujar al servidor cualquier
    // progreso que solo esté guardado en el teléfono (upsert previo fallido offline).
    const handleOnline = () => {
      setOnline(true);
      const p = profileRef.current;
      if (!p) return;
      const local = readLocal(p.userId);
      if (local && !local.done) {
        saveRutaActiva(p.userId, p.nombre, local)
          .then(() => setSyncOk(true))
          .catch((e) => { console.error("re-sync ruta_activa:", e); setSyncOk(false); });
      }
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      sub?.data?.subscription?.unsubscribe?.();
      if (realtimeChannel) { try { realtimeChannel.unsubscribe(); } catch {} }
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
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

  // Un chofer solo puede EJECUTAR una ruta a la vez (asignar varias sigue siendo
  // libre). Se bloquea en vez de ofrecer "reemplazar" para no perder progreso.
  const onLoadRutaDia = ({ title, stops, closed, horaInicio }) => {
    if (rutaDia && !rutaDia.done) {
      toast(`Ya tienes una ruta en curso ("${rutaDia.title}"). Termínala o cancélala antes de iniciar otra.`, { type: "warn" });
      setTab("ruta-dia");
      return;
    }
    const startStop = stops[0];
    const next = {
      title, closed,
      startId: startStop.id,
      startName: startStop.name,
      endId: closed ? startStop.id : null,
      horaInicio: horaInicio ?? null,
      route: [],
      // Plan de pendientes: lo agrega/quita/reordena el chofer al crearlo,
      // pero desde que la ruta arranca es propiedad del despacho (§5 del
      // módulo de Seguimiento) — ver src/lib/rutaActivaMerge.js.
      remaining: stops.slice(1).map((s) => ({ id: s.id, name: s.name })),
      phase: "initial",
      nextStop: null,
      nextLegKm: "",
      done: false,
      noticeAckAt: 0,
      notes: [],
      notice: null,
      editLog: [],
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
  const onLoadRutaGuardada = (r) => onLoadRutaDia({ title: r.nombre, stops: r.stops, closed: r.closed, horaInicio: r.horaInicio });
  const onLiberarRuta = async (driverId) => {
    if (!(await confirm({ message: "¿Liberar / cancelar la ruta de este chofer?", confirmLabel: "Liberar", danger: true }))) return;
    try { await clearRutaActiva(driverId); }
    catch (e) { console.error(e); toast("No se pudo liberar la ruta.", { type: "error" }); }
  };

  /**
   * Único punto de escritura del DESPACHO sobre la ruta activa de OTRO
   * chofer. Relee el estado más fresco del servidor, aplica `editFn` (que
   * solo debe tocar `remaining`/`notes`/`notice`/`editLog` — nunca
   * `route`/`phase`/`nextStop`, eso es del chofer) y guarda vía
   * `saveRutaActiva`, que a su vez llama a la función RPC `merge_ruta_activa`
   * (fusión atómica en el servidor, ver supabase/migrations/2026-07-
   * seguimiento-ruta.sql) para no pisar una escritura concurrente del chofer.
   */
  const applyDispatchEdit = useCallback(async (driverId, driverNombre, editFn, { group = "plan" } = {}) => {
    const fresh = await getRutaActiva(driverId);
    if (!fresh?.state || fresh.state.done) return;
    const stamp = Date.now();
    const by = profileRef.current?.userId ?? null;
    const byName = profileRef.current?.nombre ?? null;
    let next = { ...fresh.state };
    next = editFn(next, { stamp, by, byName }) || next;
    if (group === "plan") next._wPlan = stamp;
    if (group === "dispatch") next._wDispatch = stamp;
    next._wDriver = next._wDriver ?? -1;
    next._wPlan = next._wPlan ?? -1;
    next._wDispatch = next._wDispatch ?? -1;
    next._w = Math.max(next._wDriver, next._wPlan, next._wDispatch);
    await saveRutaActiva(driverId, fresh.driverNombre ?? driverNombre, next);
  }, []);

  const onDispatchAddStop = (driverId, driverNombre, point) =>
    applyDispatchEdit(driverId, driverNombre, (state, { stamp, by, byName }) => {
      state.remaining = [...(state.remaining || []), { id: point.id, name: point.name }];
      state.editLog = [...(state.editLog || []), { id: genEditId(), at: stamp, by, byName, action: "add", pointId: point.id, pointName: point.name }];
      return state;
    }, { group: "plan" });

  const onDispatchRemoveStop = (driverId, driverNombre, point) =>
    applyDispatchEdit(driverId, driverNombre, (state, { stamp, by, byName }) => {
      state.remaining = (state.remaining || []).filter((s) => s.id !== point.id);
      state.editLog = [...(state.editLog || []), { id: genEditId(), at: stamp, by, byName, action: "remove", pointId: point.id, pointName: point.name }];
      return state;
    }, { group: "plan" });

  // direction: -1 (subir) / +1 (bajar). Se reordena por id sobre la lista
  // VISIBLE (effectivePending del state recién leído), no por índice bruto
  // de `state.remaining`: ese array crudo puede traer entradas "fantasma"
  // ya consumidas (visitadas o en camino) que todavía no se limpiaron, y
  // un índice del cliente quedaría desalineado con ellas. De paso, al
  // reescribir `remaining` solo con la lista visible se limpian esas
  // entradas fantasma (mismo efecto que "Resuggest" del chofer).
  const onDispatchReorder = (driverId, driverNombre, pointId, direction) =>
    applyDispatchEdit(driverId, driverNombre, (state, { stamp, by, byName }) => {
      const visible = effectivePending(state);
      const idx = visible.findIndex((s) => s.id === pointId);
      const swapIdx = idx + direction;
      if (idx < 0 || swapIdx < 0 || swapIdx >= visible.length) return state;
      const reordered = [...visible];
      [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
      state.remaining = reordered;
      state.editLog = [...(state.editLog || []), { id: genEditId(), at: stamp, by, byName, action: "reorder", pointId, pointName: visible[idx].name, fromIndex: idx, toIndex: swapIdx }];
      return state;
    }, { group: "plan" });

  const onDispatchSendNote = (driverId, driverNombre, text) =>
    applyDispatchEdit(driverId, driverNombre, (state, { stamp, by, byName }) => {
      const entry = { id: genEditId(), at: stamp, by, byName, from: "dispatch", text };
      state.notes = [...(state.notes || []), entry].slice(-50);
      state.notice = { id: genEditId(), text: `Mensaje del despacho: "${text}"`, kind: "info", at: stamp };
      state.editLog = [...(state.editLog || []), { id: genEditId(), at: stamp, by, byName, action: "note", detail: text }];
      return state;
    }, { group: "dispatch" });

  const onAddPunto = async (p) => { await addPunto(p); await refresh(); };
  const onUpdatePunto = async (id, p) => { await updatePunto(id, p); await refresh(); };
  const onRemovePunto = async (id) => { await removePunto(id); await refresh(); };
  const onAddRecorrido = async (r) => {
    await addRecorrido(r);
    await refresh();
  };
  const onRestoreBackup = async (data, tipos) => { await restoreBackup(data, tipos); await refresh(); };
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
    { id: "seguimiento",label: "Seguimiento",          icon: Radio,       roles: ["admin","supervisor"] },
    { id: "optimizar",  label: "Generación y carga de rutas", icon: Zap,  roles: ["admin","supervisor"] },
    { id: "registrar",  label: "Registrar recorrido",  icon: Clock,       roles: ["admin","supervisor"] },
    { id: "ahorro",     label: "Análisis de ahorro",   icon: TrendingDown,roles: ["admin","supervisor"] },
    { id: "evaluacion", label: "Evaluación de rutas",  icon: Award,       roles: ["admin","supervisor"] },
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
          <img src="/logo-rtb-nav.png" alt="RTB" className="h-11 w-11 shrink-0" />
          <div>
            <h1 className="text-lg font-bold leading-tight">Despacho RTB · Optimizador de Rutas</h1>
            <p className="text-xs text-slate-500">
              {profile
                ? <>{isAdmin ? <ShieldCheck size={11} className="inline mr-0.5 text-rtb-gold-400" /> : null}{profile.nombre} · {isAdmin ? "Admin" : isSupervisor ? "Supervisor" : "Chofer"}</>
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
              const monitorCount = t.id === "seguimiento" ? Object.keys(activeRoutes).length : 0;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition ${tab === t.id ? "bg-slate-800 text-rtb-gold-400" : "text-slate-400 hover:text-slate-200"}`}>
                  <Icon size={15} /> {t.label}
                  {hasActive && <span className="h-1.5 w-1.5 rounded-full bg-rtb-gold-400" />}
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
        {tab === "evaluacion" && <EvaluacionTab points={points} recorridos={recorridos} profiles={profiles} />}
        {tab === "matriz"    && <MatrizTab points={points} segments={obs.segments} />}
        {tab === "optimizar" && <OptimizarTab points={points} segments={obs.segments} waits={obs.waits} rutasGuardadas={rutasGuardadas} onSaveRutaGuardada={onSaveRutaGuardada} onUpdateRutaGuardada={onUpdateRutaGuardada} onDeleteRutaGuardada={onDeleteRutaGuardada} profiles={profiles} />}
        {tab === "ruta-dia"  && <RutaDiaTab rutaDia={rutaDia} setRutaDia={(next) => updateRutaDia(next, profile)} onSaveRuta={onAddRecorrido} allPoints={points} segments={obs.segments} waits={obs.waits} rutasGuardadas={rutasGuardadas} onLoadRutaGuardada={onLoadRutaGuardada} onUpdateRutaGuardada={onUpdateRutaGuardada} onDeleteRutaGuardada={onDeleteRutaGuardada} isAdmin={isStaff} profile={profile} profiles={profiles} online={online} syncOk={syncOk} />}
        {tab === "seguimiento" && (
          <SeguimientoTab
            activeRoutes={activeRoutes}
            profiles={profiles}
            allPoints={points}
            segments={obs.segments}
            waits={obs.waits}
            onLiberar={onLiberarRuta}
            onAddStop={onDispatchAddStop}
            onRemoveStop={onDispatchRemoveStop}
            onReorder={onDispatchReorder}
            onSendNote={onDispatchSendNote}
          />
        )}
        {tab === "datos"     && <DatosTab points={points} recorridos={recorridos} rutasGuardadas={rutasGuardadas} profiles={profiles} onGetBackup={getBackup} onRestoreBackup={onRestoreBackup} />}
        {tab === "usuarios"  && <UsuariosTab profiles={profiles} currentUserId={profile?.userId} onUpdate={onUpdateProfileRole} onCrear={onAdminCrearUsuario} onResetPassword={adminResetPassword} onToggle={onAdminToggleUsuario} />}
        {tab === "micuenta"  && <MiCuentaTab profile={profile} onUpdateName={onUpdateMyName} onChangePassword={changeMyPassword} />}
      </div>
    </div>
  );
}
