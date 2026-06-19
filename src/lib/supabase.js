// =====================================================================
// src/lib/supabase.js
// Capa de datos que reemplaza window.storage. La app sigue trabajando
// con objetos { id, name, type, lat, lng } y { id, dateISO, ts, stops }:
// el mapeo desde/hacia las columnas de la DB se hace aquí.
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
export function onAuth(cb) {
  return supabase.auth.onAuthStateChange((_event, session) => cb(session));
}

/* ----------------------------- Puntos ----------------------------- */
const mapPunto = (r) => ({ id: r.id, name: r.nombre, type: r.tipo, lat: r.lat, lng: r.lng });

export async function getPuntos() {
  const { data, error } = await supabase.from("puntos").select("*").order("created_at");
  if (error) throw error;
  return data.map(mapPunto);
}

export async function addPunto(p) {
  const { data, error } = await supabase
    .from("puntos")
    .insert({ nombre: p.name, tipo: p.type, lat: p.lat ?? null, lng: p.lng ?? null })
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
    if (stops.length === R.stops.length) continue;   // este recorrido no lo usaba
    if (stops.length < 2) await removeRecorrido(R.id); // queda inservible → fuera
    else {
      const { error } = await supabase.from("recorridos").update({ stops }).eq("id", R.id);
      if (error) throw error;
    }
  }
  const { error } = await supabase.from("puntos").delete().eq("id", id);
  if (error) throw error;
}

/* --------------------------- Recorridos --------------------------- */
const mapRec = (r) => ({ id: r.id, dateISO: r.fecha, ts: Number(r.ts), stops: r.stops });

export async function getRecorridos() {
  const { data, error } = await supabase.from("recorridos").select("*").order("ts");
  if (error) throw error;
  return data.map(mapRec);
}

export async function addRecorrido(r) {
  const { data, error } = await supabase
    .from("recorridos")
    .insert({ fecha: r.dateISO, ts: r.ts, stops: r.stops })
    .select()
    .single();
  if (error) throw error;
  return mapRec(data);
}

export async function removeRecorrido(id) {
  const { error } = await supabase.from("recorridos").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------ Importar JSON / Borrar todo ------------------- */
// Conserva los id del JSON para no romper las referencias dentro de stops.
const IMPOSSIBLE = "00000000-0000-0000-0000-000000000000";

export async function replaceAll(points, recorridos) {
  await supabase.from("recorridos").delete().neq("id", IMPOSSIBLE); // borra todo
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
