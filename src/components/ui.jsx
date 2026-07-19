// =====================================================================
// src/components/ui.jsx
// Primitivas visuales compartidas por (casi) todas las pestañas.
// (components/evaluacion/ui.jsx mantiene su propia copia — mismo patrón
// standalone que components/seguimiento/, no se fusionó a propósito.)
// Tema claro de marca (identidad_visual/RTB_sistema_visual.md): lienzo
// blanco, tarjetas en superficie teal clara, texto en navy, acento
// principal teal (paridad con LoginGate), oro reservado a remates finos
// (eyebrows, reglas, badges de estado) — nunca relleno grande ni texto
// pequeño (bajo contraste sobre fondo claro).
// =====================================================================

export const Card = ({ children, className = "" }) => (
  <div className={"rounded-xl border border-rtb-teal-100 bg-rtb-surface " + className}>{children}</div>
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
export const Field = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-[11px] uppercase tracking-wider text-rtb-navy-mid">{label}</span>
    {children}
  </label>
);
export const inputCls = "w-full rounded-lg border border-rtb-navy/15 bg-white px-3 py-2 text-sm text-rtb-navy placeholder-rtb-navy/35 focus:border-rtb-teal focus:outline-none focus:ring-2 focus:ring-rtb-teal/20";
export const Empty = ({ children }) => (
  <div className="rounded-lg border border-dashed border-rtb-teal-200 bg-rtb-surface px-4 py-8 text-center text-sm text-rtb-navy-mid">{children}</div>
);
export const Stat = ({ label, value, highlight, color }) => (
  <div className={`rounded-lg border px-2 py-2 ${highlight ? "border-rtb-gold-300 bg-rtb-gold-50" : "border-rtb-teal-100 bg-white"}`}>
    <div className="text-[10px] uppercase tracking-wider text-rtb-navy-mid">{label}</div>
    <div className={`font-mono text-sm tabular-nums ${color || (highlight ? "text-rtb-gold-700" : "text-rtb-navy")}`}>{value}</div>
  </div>
);

// Encabezado de sección con el lenguaje tipográfico de marca (Playfair +
// remate dorado fino) — versión de app del "sec-head" de la plantilla de
// documentos, sin los elementos propios de un documento imprimible
// (números romanos, bloques de firma).
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
