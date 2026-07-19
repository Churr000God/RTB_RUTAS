import { resumenFlota } from "../../lib/evaluacion";
import { Card, Empty, SectionTitle } from "./ui";
import CriteriosBars from "./CriteriosBars";
import { fmtMin } from "./format";

/** Resumen general de flota: promedio, distribución de etiquetas y tiempo
 * total desperdiciado vs. el orden óptimo. */
export default function VistaGeneral({ evs }) {
  const r = resumenFlota(evs);
  if (!r.n) return <Card className="p-6"><Empty>Sin datos para este periodo.</Empty></Card>;

  return (
    <Card className="p-4">
      <SectionTitle>Resumen de flota</SectionTitle>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-rtb-teal-100 bg-white px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-rtb-navy-mid">Recorridos evaluados</div>
          <div className="font-mono text-sm text-rtb-navy">{r.n}</div>
        </div>
        <div className="rounded-lg border border-rtb-gold-300 bg-rtb-gold-50 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-rtb-navy-mid">Puntuación promedio</div>
          <div className="font-mono text-sm text-rtb-gold-700">{r.promedio != null ? Math.round(r.promedio) : "—"}</div>
        </div>
        <div className="rounded-lg border border-rtb-teal-100 bg-white px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-rtb-navy-mid">Tiempo desperdiciado (total)</div>
          <div className="font-mono text-sm text-rose-700">{fmtMin(r.tiempoDesperdiciado)}</div>
        </div>
        <div className="rounded-lg border border-rtb-teal-100 bg-white px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-rtb-navy-mid">Excelente / Bien / Regular / Bajo</div>
          <div className="font-mono text-sm text-rtb-navy">{r.distribucion.excelente}/{r.distribucion.bien}/{r.distribucion.regular}/{r.distribucion.bajo}</div>
        </div>
      </div>
      <CriteriosBars criterios={r.porCriterio} detail={false} />
    </Card>
  );
}
