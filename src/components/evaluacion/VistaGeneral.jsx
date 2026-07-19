import { resumenFlota } from "../../lib/evaluacion";
import { Card, Empty } from "./ui";
import CriteriosBars from "./CriteriosBars";
import { fmtMin } from "./format";

/** Resumen general de flota: promedio, distribución de etiquetas y tiempo
 * total desperdiciado vs. el orden óptimo. */
export default function VistaGeneral({ evs }) {
  const r = resumenFlota(evs);
  if (!r.n) return <Card className="p-6"><Empty>Sin datos para este periodo.</Empty></Card>;

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-200">Resumen de flota</h3>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Recorridos evaluados</div>
          <div className="font-mono text-sm text-slate-200">{r.n}</div>
        </div>
        <div className="rounded-lg border border-rtb-gold-500/40 bg-rtb-gold-500/5 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Puntuación promedio</div>
          <div className="font-mono text-sm text-rtb-gold-300">{r.promedio != null ? Math.round(r.promedio) : "—"}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Tiempo desperdiciado (total)</div>
          <div className="font-mono text-sm text-rose-300">{fmtMin(r.tiempoDesperdiciado)}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Excelente / Bien / Regular / Bajo</div>
          <div className="font-mono text-sm text-slate-200">{r.distribucion.excelente}/{r.distribucion.bien}/{r.distribucion.regular}/{r.distribucion.bajo}</div>
        </div>
      </div>
      <CriteriosBars criterios={r.porCriterio} detail={false} />
    </Card>
  );
}
