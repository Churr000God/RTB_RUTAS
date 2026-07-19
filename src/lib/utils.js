// =====================================================================
// src/lib/utils.js
// Utilidades de formato e identificadores compartidas entre pestañas.
// =====================================================================

export function fmtMin(m) {
  if (m == null || !isFinite(m)) return "—";
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
export const fmtKm = (k) => (k == null || !isFinite(k) ? "—" : `${k.toFixed(1)} km`);
export const fmtTime = (ts) => {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
};
// Id único para entradas de editLog/notes (crypto.randomUUID puede faltar en http no-seguro).
export const genEditId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
