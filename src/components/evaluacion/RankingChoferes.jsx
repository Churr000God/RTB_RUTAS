import { rankingChoferes, etiquetaFor } from "../../lib/evaluacion";
import { Card, Empty } from "./ui";
import ScoreBadge from "./ScoreBadge";

/** Ranking de choferes por puntuación promedio. Ruteo y ritmo ya son
 * relativos a cada ruta (su propio óptimo/tiempo esperado), lo que ayuda
 * a que la comparación no castigue rutas más difíciles. */
export default function RankingChoferes({ evs, profiles }) {
  const rank = rankingChoferes(evs, profiles);
  return (
    <Card className="p-4">
      <h3 className="mb-1 text-sm font-semibold text-rtb-navy">Ranking de choferes</h3>
      <p className="mb-3 text-[11px] leading-relaxed text-rtb-navy-mid">
        Ruteo y ritmo se califican contra el propio óptimo/tiempo esperado de cada ruta (no un promedio de la flota), lo que normaliza en buena medida por la dificultad de cada recorrido.
      </p>
      {rank.length === 0 ? (
        <Empty>Sin datos para este periodo.</Empty>
      ) : (
        <ol className="space-y-1.5">
          {rank.map((g, i) => (
            <li key={g.driverId ?? "sin-asignar"} className="flex items-center gap-3 rounded-lg border border-rtb-teal-100 bg-white px-3 py-2">
              <span className="w-5 shrink-0 text-center font-mono text-xs text-rtb-navy-mid">{i + 1}</span>
              <span className="flex-1 text-sm text-rtb-navy">{g.nombre}</span>
              <span className="text-xs text-rtb-navy-mid">{g.n} recorrido{g.n === 1 ? "" : "s"}</span>
              <ScoreBadge score={g.promedio} etiqueta={etiquetaFor(g.promedio)} size="sm" />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
