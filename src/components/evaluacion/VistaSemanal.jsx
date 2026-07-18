import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { agruparPorSemana } from "../../lib/evaluacion";
import { Card, Empty } from "./ui";
import CriteriosBars from "./CriteriosBars";

/** Puntuación promedio de la flota agrupada por semana ISO, con tendencia. */
export default function VistaSemanal({ evs }) {
  const semanas = agruparPorSemana(evs);
  if (!semanas.length) return <Card className="p-6"><Empty>Sin datos para este periodo.</Empty></Card>;
  const chartData = semanas.map((s) => ({ semana: s.semana, promedio: s.promedio != null ? Math.round(s.promedio) : null }));

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Puntuación promedio por semana</h3>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="semana" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#cbd5e1" }} />
              <Line type="monotone" dataKey="promedio" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="space-y-2">
        {semanas.slice().reverse().map((s) => (
          <Card key={s.semana} className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200">{s.semana}</span>
              <span className="text-xs text-slate-500">{s.n} recorrido{s.n === 1 ? "" : "s"} · promedio {s.promedio != null ? Math.round(s.promedio) : "—"}</span>
            </div>
            <CriteriosBars criterios={s.porCriterio} detail={false} />
          </Card>
        ))}
      </div>
    </div>
  );
}
