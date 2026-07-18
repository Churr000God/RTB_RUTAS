import { agruparPorUsuario, etiquetaFor } from "../../lib/evaluacion";
import { Card, Empty } from "./ui";
import ScoreBadge from "./ScoreBadge";
import CriteriosBars from "./CriteriosBars";

/** Puntuación promedio por chofer en el periodo, desglosada por criterio. */
export default function VistaUsuario({ evs, profiles }) {
  const grupos = agruparPorUsuario(evs, profiles);
  if (!grupos.length) return <Card className="p-6"><Empty>Sin datos para este periodo.</Empty></Card>;

  return (
    <div className="space-y-3">
      {grupos.map((g) => (
        <Card key={g.driverId ?? "sin-asignar"} className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-200">{g.nombre}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{g.n} recorrido{g.n === 1 ? "" : "s"}</span>
              <ScoreBadge score={g.promedio} etiqueta={etiquetaFor(g.promedio)} />
            </div>
          </div>
          <CriteriosBars criterios={g.porCriterio} detail={false} />
        </Card>
      ))}
    </div>
  );
}
