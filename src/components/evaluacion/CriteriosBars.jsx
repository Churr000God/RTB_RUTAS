import { CRITERIO_LABEL } from "./format";

const KEYS = ["ruteo", "entregas", "esperas", "ritmo"];

/**
 * Barras de los 4 criterios. Acepta tanto un objeto `criterios` de una
 * evaluación individual ({score, aplica, detail} por clave, de
 * evaluarRecorrido) como un objeto plano de promedios ya calculados por
 * los agregadores ({ruteo: 82, entregas: null, ...} de porCriterio).
 */
export default function CriteriosBars({ criterios, detail = true }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {KEYS.map((k) => {
        const raw = criterios?.[k];
        const isObj = raw && typeof raw === "object";
        const score = isObj ? raw.score : raw;
        const aplica = isObj ? raw.aplica : score != null;
        return (
          <div key={k} className="rounded-lg border border-rtb-teal-100 bg-white p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-rtb-navy-mid">{CRITERIO_LABEL[k]}</span>
              <span className="font-mono text-xs text-rtb-navy">{aplica && score != null ? Math.round(score) : "N/A"}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 print-brand-surface print-brand-border border">
              <div className="h-full rounded-full bg-rtb-gold-500 print-brand-gold-bg" style={{ width: `${aplica && score != null ? score : 0}%` }} />
            </div>
            {detail && isObj && raw.detail && <p className="mt-1 text-[10px] text-rtb-navy-mid">{raw.detail}</p>}
          </div>
        );
      })}
    </div>
  );
}
