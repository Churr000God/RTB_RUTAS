// Formateadores compartidos por los componentes de Seguimiento (duplican los
// de App.jsx a propósito: estos componentes son standalone, sin importar del
// archivo raíz — mismo patrón que RouteMap.jsx/LeafletMap.jsx).

export function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function fmtMin(m) {
  if (m == null || !isFinite(m)) return "—";
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
