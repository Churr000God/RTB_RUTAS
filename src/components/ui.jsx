// =====================================================================
// src/components/ui.jsx
// Primitivas visuales compartidas por (casi) todas las pestañas.
// (components/evaluacion/ui.jsx mantiene su propia copia — mismo patrón
// standalone que components/seguimiento/, no se fusionó a propósito.)
// Acentos: oro (rtb-gold) para énfasis/acción, teal para foco/interacción —
// ver identidad_visual/RTB_sistema_visual.md y §2.1/§4.1 del documento de
// mejoras transversales.
// =====================================================================

export const Card = ({ children, className = "" }) => (
  <div className={"rounded-xl border border-slate-800 bg-slate-900/70 " + className}>{children}</div>
);
export const Btn = ({ children, onClick, variant = "primary", disabled, className = "" }) => {
  const styles = {
    primary: "bg-rtb-gold-500 text-slate-950 hover:bg-rtb-gold-400 font-semibold",
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
export const Field = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
    {children}
  </label>
);
export const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-rtb-teal focus:outline-none";
export const Empty = ({ children }) => (
  <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/30 px-4 py-8 text-center text-sm text-slate-500">{children}</div>
);
export const Stat = ({ label, value, highlight, color }) => (
  <div className={`rounded-lg border px-2 py-2 ${highlight ? "border-rtb-gold-500/40 bg-rtb-gold-500/5" : "border-slate-800 bg-slate-950/50"}`}>
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`font-mono text-sm ${color || (highlight ? "text-rtb-gold-300" : "text-slate-200")}`}>{value}</div>
  </div>
);
