// Formateadores/estilos compartidos por los componentes de Evaluación.
// Duplican los de App.jsx a propósito (mismo patrón que
// src/components/seguimiento/format.js): standalone, sin importar del
// archivo raíz.

export function fmtMin(m) {
  if (m == null || !isFinite(m)) return "—";
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function fmtScore(score) {
  return score == null ? "—" : Math.round(score).toString();
}

export const ETIQUETA_COLOR = {
  Excelente: { text: "text-teal-300", bg: "bg-teal-900/40", border: "border-teal-700/50", bar: "bg-teal-500" },
  Bien: { text: "text-sky-300", bg: "bg-sky-900/40", border: "border-sky-700/50", bar: "bg-sky-500" },
  Regular: { text: "text-amber-300", bg: "bg-amber-900/40", border: "border-amber-700/50", bar: "bg-amber-500" },
  Bajo: { text: "text-rose-300", bg: "bg-rose-900/40", border: "border-rose-700/50", bar: "bg-rose-500" },
  "Sin datos": { text: "text-slate-400", bg: "bg-slate-800/60", border: "border-slate-700/50", bar: "bg-slate-600" },
};

export const CRITERIO_LABEL = { ruteo: "Ruteo", entregas: "Entregas", esperas: "Esperas", ritmo: "Ritmo" };
