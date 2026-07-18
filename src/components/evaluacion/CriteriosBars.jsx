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
          <div key={k} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">{CRITERIO_LABEL[k]}</span>
              <span className="font-mono text-xs text-slate-200">{aplica && score != null ? Math.round(score) : "N/A"}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${aplica && score != null ? score : 0}%` }} />
            </div>
            {detail && isObj && raw.detail && <p className="mt-1 text-[10px] text-slate-500">{raw.detail}</p>}
          </div>
        );
      })}
    </div>
  );
}
