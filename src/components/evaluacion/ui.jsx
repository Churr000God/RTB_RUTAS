// Primitivas visuales mínimas para los componentes de Evaluación —
// duplican las de App.jsx a propósito (mismo patrón que
// src/components/seguimiento/DriverCard.jsx: standalone, sin importar
// del archivo raíz).
// Tema claro de marca — ver src/components/ui.jsx para la explicación
// completa del sistema (blanco/navy/teal/oro).

export const Card = ({ children, className = "" }) => (
  <div className={"rounded-xl border border-rtb-teal-100 bg-rtb-surface " + className}>{children}</div>
);

export const Empty = ({ children }) => (
  <div className="rounded-lg border border-dashed border-rtb-teal-200 bg-rtb-surface px-4 py-8 text-center text-sm text-rtb-navy-mid">{children}</div>
);

export const Stat = ({ label, value, color, highlight }) => (
  <div className={`rounded-lg border px-2 py-2 ${highlight ? "border-rtb-gold-300 bg-rtb-gold-50" : "border-rtb-teal-100 bg-white"}`}>
    <div className="text-[10px] uppercase tracking-wider text-rtb-navy-mid">{label}</div>
    <div className={`font-mono text-sm tabular-nums ${color || (highlight ? "text-rtb-gold-700" : "text-rtb-navy")}`}>{value}</div>
  </div>
);

export const Btn = ({ children, onClick, variant = "primary", disabled, className = "" }) => {
  const styles = {
    primary: "bg-rtb-teal text-white hover:bg-rtb-navy font-semibold",
    success: "bg-rtb-teal-700 text-white hover:bg-rtb-teal-800 font-semibold",
    ghost: "bg-white text-rtb-navy hover:bg-rtb-surface border border-rtb-navy/15",
    danger: "bg-white text-rose-700 hover:bg-rose-50 border border-rose-200",
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
      <li key={i} className="flex items-center gap-2 text-sm text-rtb-navy">
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-transparent bg-rtb-surface text-[10px] font-bold text-rtb-navy-mid print-brand-border">{i + 1}</span>{n}
      </li>
    ))}
    {closed && <li className="flex items-center gap-2 text-xs text-rtb-navy-mid"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-transparent bg-rtb-surface text-[10px] print-brand-border">↩</span>regreso al inicio</li>}
  </ol>
);

// Encabezado de sección — ver src/components/ui.jsx (SectionTitle) para
// la explicación completa.
export const SectionTitle = ({ children, eyebrow, icon: Icon, className = "" }) => (
  <div className={`mb-3 ${className}`}>
    {eyebrow && (
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-rtb-gold-700">{eyebrow}</div>
    )}
    <div className="flex items-center gap-2">
      {Icon && <Icon size={16} className="text-rtb-teal" />}
      <h3 className="font-display text-base font-semibold text-rtb-navy">{children}</h3>
    </div>
    <div className="mt-1.5 h-px w-10 bg-rtb-gold-300" />
  </div>
);
