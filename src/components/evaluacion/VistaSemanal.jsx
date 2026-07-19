import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { agruparPorSemana } from "../../lib/evaluacion";
import { Card, Empty, SectionTitle } from "./ui";
import CriteriosBars from "./CriteriosBars";

/** Puntuación promedio de la flota agrupada por semana ISO, con tendencia. */
export default function VistaSemanal({ evs }) {
  const semanas = agruparPorSemana(evs);
  if (!semanas.length) return <Card className="p-6"><Empty>Sin datos para este periodo.</Empty></Card>;
  const chartData = semanas.map((s) => ({ semana: s.semana, promedio: s.promedio != null ? Math.round(s.promedio) : null }));

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <SectionTitle>Puntuación promedio por semana</SectionTitle>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D0EAEA" />
              <XAxis dataKey="semana" stroke="#1A5F7A" fontSize={10} />
              <YAxis stroke="#1A5F7A" fontSize={11} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #D0EAEA", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#002B5B" }} />
              <Line type="monotone" dataKey="promedio" stroke="#159895" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="space-y-2">
        {semanas.slice().reverse().map((s) => (
          <Card key={s.semana} className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-rtb-navy">{s.semana}</span>
              <span className="text-xs text-rtb-navy-mid">{s.n} recorrido{s.n === 1 ? "" : "s"} · promedio {s.promedio != null ? Math.round(s.promedio) : "—"}</span>
            </div>
            <CriteriosBars criterios={s.porCriterio} detail={false} />
          </Card>
        ))}
      </div>
    </div>
  );
}
