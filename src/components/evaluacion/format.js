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
  Excelente: { text: "text-rtb-teal-700", bg: "bg-rtb-teal-50", border: "border-rtb-teal-200", bar: "bg-rtb-teal-500" },
  Bien: { text: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200", bar: "bg-sky-500" },
  Regular: { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", bar: "bg-amber-500" },
  Bajo: { text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", bar: "bg-rose-500" },
  "Sin datos": { text: "text-rtb-navy-mid", bg: "bg-slate-100", border: "border-slate-300", bar: "bg-slate-400" },
};

export const CRITERIO_LABEL = { ruteo: "Ruteo", entregas: "Entregas", esperas: "Esperas", ritmo: "Ritmo" };
