// =====================================================================
// src/lib/supabase.js
// Capa de datos. La app trabaja con objetos JS planos; el mapeo
// desde/hacia columnas de la DB se hace aquí.
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error("Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el archivo .env");
}

export const supabase = createClient(url, anon);

/* ------------------------------ Auth ------------------------------ */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}
export async function signOut() {
  await supabase.auth.signOut();
}
/** cb recibe (session, event) — event es p.ej. 'SIGNED_IN' | 'PASSWORD_RECOVERY' | 'SIGNED_OUT'. */
export function onAuth(cb) {
  return supabase.auth.onAuthStateChange((event, session) => cb(session, event));
}

/** Cambia la contraseña del usuario ya autenticado (pantalla "Mi cuenta" o tras invitación/reseteo). */
export async function changeMyPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** Envía el correo de "olvidé mi contraseña" (pantalla de login). */
export async function sendPasswordReset(email, redirectTo) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

/* ---------------------------- Profiles ---------------------------- */
const mapProfile = (r) => ({ userId: r.user_id, nombre: r.nombre, email: r.email ?? null, role: r.role, disabled: !!r.disabled });

/** Perfil del usuario actual (role: 'admin' | 'supervisor' | 'driver'). null si no existe. */
export async function getMyProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
    .single();
  if (error) return null;
  return mapProfile(data);
}

/** Todos los perfiles (para el selector de asignación, el monitor y Usuarios). */
export async function getProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("nombre");
  if (error) return [];
  return data.map(mapProfile);
}

/** El propio usuario cambia su nombre (permitido por RLS "profiles: update propio"). */
export async function updateMyName(nombre) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data, error } = await supabase
    .from("profiles")
    .update({ nombre })
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) throw error;
  return mapProfile(data);
}

/** Admin actualiza nombre y/o rol de cualquier perfil. */
export async function updateProfile(userId, { nombre, role }) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ nombre, role })
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw error;
  return mapProfile(data);
}

/* ------------------- Gestión de usuarios (admin) -------------------
 * Vía Edge Functions: la service_role nunca toca el navegador.
 * supabase.functions.invoke adjunta automáticamente el JWT del admin
 * que llama en el header Authorization.
 * ------------------------------------------------------------------- */

/** Crea una cuenta (invitación por correo) + su fila en profiles. role: 'admin'|'supervisor'|'driver'. */
export async function adminCrearUsuario({ nombre, email, role }) {
  const { data, error } = await supabase.functions.invoke("admin-crear-usuario", {
    body: { nombre, email, role, redirectTo: window.location.origin },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return mapProfile(data.profile);
}

/** Dispara el correo de reseteo de contraseña de otro usuario. */
export async function adminResetPassword(email) {
  const { data, error } = await supabase.functions.invoke("admin-resetear-password", {
    body: { email, redirectTo: window.location.origin },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

/** Deshabilita (reversible) o rehabilita el acceso de un usuario. */
export async function adminToggleUsuario(userId, disabled) {
  const { data, error } = await supabase.functions.invoke("admin-toggle-usuario", {
    body: { userId, disabled },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return mapProfile(data.profile);
}

/* ----------------------------- Puntos ----------------------------- */
// direccion: columna opcional (ver supabase/migrations/2026-07-evaluacion-rutas.sql).
// Manual o por geocodificación inversa (src/lib/geocode.js).
const mapPunto = (r) => ({ id: r.id, name: r.nombre, type: r.tipo, lat: r.lat, lng: r.lng, direccion: r.direccion ?? null });

export async function getPuntos() {
  const { data, error } = await supabase.from("puntos").select("*").order("created_at");
  if (error) throw error;
  return data.map(mapPunto);
}

export async function addPunto(p) {
  const { data, error } = await supabase
    .from("puntos")
    .insert({ nombre: p.name, tipo: p.type, lat: p.lat ?? null, lng: p.lng ?? null, direccion: p.direccion || null })
    .select()
    .single();
  if (error) throw error;
  return mapPunto(data);
}

export async function updatePunto(id, p) {
  const { data, error } = await supabase
    .from("puntos")
    .update({ nombre: p.name, tipo: p.type, lat: p.lat ?? null, lng: p.lng ?? null, direccion: p.direccion || null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapPunto(data);
}

export async function removePunto(id) {
  // Como las paradas viven en JSONB (sin FK), limpiamos manualmente las
  // referencias a este punto dentro de los recorridos antes de borrarlo.
  const recs = await getRecorridos();
  for (const R of recs) {
    const stops = R.stops.filter((s) => s.point !== id);
    if (stops.length === R.stops.length) continue;
    if (stops.length < 2) await removeRecorrido(R.id);
    else {
      const { error } = await supabase.from("recorridos").update({ stops }).eq("id", R.id);
      if (error) throw error;
    }
  }
  const { error } = await supabase.from("puntos").delete().eq("id", id);
  if (error) throw error;
}

/* --------------------------- Recorridos --------------------------- */
// edit_log / driver_id: columnas opcionales (ver supabase/migrations/
// 2026-07-seguimiento-ruta.sql y 2026-07-evaluacion-rutas.sql). Si alguna
// migración no se ha aplicado, se omite del insert (fallback abajo).
// driver_id: chofer que ejecutó la ruta (null en recorridos previos a
// este módulo) — necesario para las vistas "por usuario" de Evaluación.
const mapRec = (r) => ({ id: r.id, dateISO: r.fecha, ts: Number(r.ts), stops: r.stops, editLog: r.edit_log ?? [], driverId: r.driver_id ?? null });

export async function getRecorridos() {
  const { data, error } = await supabase.from("recorridos").select("*").order("ts");
  if (error) throw error;
  return data.map(mapRec);
}

export async function addRecorrido(r) {
  const payload = { fecha: r.dateISO, ts: r.ts, stops: r.stops };
  if (r.editLog?.length) payload.edit_log = r.editLog;
  if (r.driverId) payload.driver_id = r.driverId;
  let { data, error } = await supabase.from("recorridos").insert(payload).select().single();
  // Columnas opcionales: si la migración correspondiente no se ha aplicado
  // todavía, el insert falla mencionando la columna — se reintenta sin ella
  // para no bloquear el guardado del recorrido (ese dato en particular
  // simplemente no se conserva hasta que se corra la migración).
  while (error) {
    const missing = ["edit_log", "driver_id"].find((col) => col in payload && (error.message || "").includes(col));
    if (!missing) break;
    delete payload[missing];
    ({ data, error } = await supabase.from("recorridos").insert(payload).select().single());
  }
  if (error) throw error;
  return mapRec(data);
}

export async function removeRecorrido(id) {
  const { error } = await supabase.from("recorridos").delete().eq("id", id);
  if (error) throw error;
}

/* ----------------------- Rutas guardadas -------------------------- */
// assigned_to: uuid del chofer asignado (null = sin asignar, cualquier driver la ve)
// hora_inicio: hora planeada de salida ("HH:MM:SS" o null); viaja con la
// ruta hasta el chofer para calcular su ETA. Columna opcional — si la
// tabla aún no la tiene, insert/update fallarán al enviarla.
const mapRutaG = (r) => ({
  id: r.id,
  nombre: r.nombre,
  fecha: r.fecha,
  closed: r.closed,
  stops: r.stops,
  assignedTo: r.assigned_to ?? null,
  horaInicio: r.hora_inicio ?? null,
});

export async function getRutasGuardadas() {
  const { data, error } = await supabase
    .from("rutas_guardadas")
    .select("*")
    .order("fecha", { nullsFirst: false })
    .order("created_at");
  if (error) throw error;
  return data.map(mapRutaG);
}

export async function addRutaGuardada(r) {
  const { data, error } = await supabase
    .from("rutas_guardadas")
    .insert({ nombre: r.nombre, fecha: r.fecha || null, closed: r.closed, stops: r.stops, assigned_to: r.assignedTo ?? null, hora_inicio: r.horaInicio || null })
    .select()
    .single();
  if (error) throw error;
  return mapRutaG(data);
}

export async function updateRutaGuardada(id, r) {
  const { data, error } = await supabase
    .from("rutas_guardadas")
    .update({ nombre: r.nombre, fecha: r.fecha || null, closed: r.closed, stops: r.stops, assigned_to: r.assignedTo ?? null, hora_inicio: r.horaInicio || null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapRutaG(data);
}

export async function removeRutaGuardada(id) {
  const { error } = await supabase.from("rutas_guardadas").delete().eq("id", id);
  if (error) throw error;
}

/* -------------- Rutas activas (progreso en curso, por chofer) ------- */
// Una fila por chofer activo. driver_id = PK. Admin ve todas; driver solo la suya (RLS).

const mapRutaActiva = (r) => ({
  driverId: r.driver_id,
  driverNombre: r.driver_nombre,
  state: r.state,
  updatedAt: r.updated_at,
});

/** Lee todas las rutas activas (RLS filtra: driver recibe solo la suya, admin todas). */
export async function getAllRutasActivas() {
  const { data, error } = await supabase.from("ruta_activa").select("*");
  if (error) return [];
  return data.map(mapRutaActiva);
}

/** Lee la ruta activa de UN chofer (o null si no tiene). Usado por el despacho antes de editar. */
export async function getRutaActiva(driverId) {
  const { data, error } = await supabase.from("ruta_activa").select("*").eq("driver_id", driverId).maybeSingle();
  if (error) throw error;
  return data ? mapRutaActiva(data) : null;
}

/**
 * Guarda / actualiza el progreso de la ruta del chofer.
 *
 * Dos escritores (chofer y despacho) pueden tocar la misma fila a la vez,
 * cada uno dueño de un grupo de campos distinto (ver rutaActivaMerge.js).
 * En vez de un upsert ciego que pisaría el objeto completo, se llama a la
 * función `merge_ruta_activa` (RPC, ver supabase/migrations/2026-07-
 * seguimiento-ruta.sql): lee la fila con bloqueo, fusiona por grupo según
 * los sellos `_wDriver/_wPlan/_wDispatch` y escribe el resultado — atómico.
 *
 * Si la migración aún no se aplicó, cae a un upsert normal (comportamiento
 * previo: último que escribe pisa todo) para no romper la app.
 */
export async function saveRutaActiva(driverId, driverNombre, state) {
  // driverNombre viaja también dentro del state (no solo en la columna
  // denormalizada) para que el payload de realtime (que solo trae `state`)
  // pueda mostrarlo sin depender de un refresh completo.
  const incoming = { ...state, driverNombre };
  const { error } = await supabase.rpc("merge_ruta_activa", {
    p_driver: driverId, p_driver_nombre: driverNombre, p_incoming: incoming,
  });
  if (!error) return;
  if (!/merge_ruta_activa/.test(error.message || "") && error.code !== "PGRST202" && error.code !== "42883") throw error;
  // Fallback: la función RPC todavía no existe en la base (migración pendiente).
  const { error: upsertError } = await supabase
    .from("ruta_activa")
    .upsert(
      { driver_id: driverId, driver_nombre: driverNombre, state, updated_at: new Date().toISOString() },
      { onConflict: "driver_id" }
    );
  if (upsertError) throw upsertError;
}

/**
 * Borra la ruta activa de un chofer (fin de ruta o desbloqueo remoto por admin).
 * RLS permite que admin borre la de cualquier chofer; driver solo la propia.
 */
export async function clearRutaActiva(driverId) {
  const { error } = await supabase.from("ruta_activa").delete().eq("driver_id", driverId);
  if (error) throw error;
}

/**
 * Suscripción realtime a ruta_activa (todas las filas que RLS permite ver).
 * cb recibe { eventType: 'INSERT'|'UPDATE'|'DELETE', driverId, state }.
 * En DELETE: state = null, driverId proviene de payload.old.
 * Devuelve el channel para poder unsubscribe al desmontar.
 */
export function subscribeRutasActivas(cb) {
  return supabase
    .channel("ruta_activa_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "ruta_activa" },
      (payload) => {
        if (payload.eventType === "DELETE") {
          cb({ eventType: "DELETE", driverId: payload.old?.driver_id, state: null });
        } else {
          cb({ eventType: payload.eventType, driverId: payload.new?.driver_id, state: payload.new?.state ?? null });
        }
      }
    )
    .subscribe();
}

/* ------------------ Importar JSON / Borrar todo ------------------- */
const IMPOSSIBLE = "00000000-0000-0000-0000-000000000000";

export async function replaceAll(points, recorridos) {
  await supabase.from("recorridos").delete().neq("id", IMPOSSIBLE);
  await supabase.from("puntos").delete().neq("id", IMPOSSIBLE);
  if (points.length) {
    const { error } = await supabase.from("puntos").insert(
      points.map((p) => ({ id: p.id, nombre: p.name, tipo: p.type, lat: p.lat ?? null, lng: p.lng ?? null }))
    );
    if (error) throw error;
  }
  if (recorridos.length) {
    const { error } = await supabase.from("recorridos").insert(
      recorridos.map((r) => ({ id: r.id, fecha: r.dateISO, ts: r.ts, stops: r.stops }))
    );
    if (error) throw error;
  }
}
