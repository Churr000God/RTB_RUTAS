import { ETIQUETA_COLOR, fmtScore } from "./format";

/** Insignia de puntuación + etiqueta (Excelente/Bien/Regular/Bajo/Sin datos). */
export default function ScoreBadge({ score, etiqueta, size = "md" }) {
  const c = ETIQUETA_COLOR[etiqueta] || ETIQUETA_COLOR["Sin datos"];
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-semibold print-brand-gold print-brand-border print-brand-surface ${c.border} ${c.bg} ${c.text} ${pad}`}>
      {fmtScore(score)} · {etiqueta}
    </span>
  );
}
