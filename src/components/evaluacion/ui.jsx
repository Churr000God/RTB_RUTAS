// Primitivas visuales mínimas para los componentes de Evaluación —
// duplican las de App.jsx a propósito (mismo patrón que
// src/components/seguimiento/DriverCard.jsx: standalone, sin importar
// del archivo raíz).

export const Card = ({ children, className = "" }) => (
  <div className={"rounded-xl border border-slate-800 bg-slate-900/70 " + className}>{children}</div>
);

export const Empty = ({ children }) => (
  <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/30 px-4 py-8 text-center text-sm text-slate-500">{children}</div>
);

export const Stat = ({ label, value, color, highlight }) => (
  <div className={`rounded-lg border px-2 py-2 ${highlight ? "border-rtb-gold-500/40 bg-rtb-gold-500/5" : "border-slate-800 bg-slate-950/50"}`}>
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`font-mono text-sm ${color || (highlight ? "text-rtb-gold-300" : "text-slate-200")}`}>{value}</div>
  </div>
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

export const SeqList = ({ names, closed }) => (
  <ol className="space-y-1">
    {names.map((n, i) => (
      <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-transparent bg-slate-800 text-[10px] font-bold text-slate-400 print-brand-border">{i + 1}</span>{n}
      </li>
    ))}
    {closed && <li className="flex items-center gap-2 text-xs text-slate-500"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-transparent bg-slate-800 text-[10px] print-brand-border">↩</span>regreso al inicio</li>}
  </ol>
);
