// =====================================================================
// src/components/ahorro/AhorroTab.jsx
// Pestaña "Análisis de ahorro": compara el orden real de cada recorrido
// contra el óptimo sugerido por la matriz aprendida, con gráfica de
// tendencia.
// =====================================================================
import { useState, useMemo } from "react";
import { ChevronRight, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { Card, Btn, Empty, Stat } from "../ui";
import { fmtMin, fmtKm } from "../../lib/utils";
import { mean, analizarAhorro } from "../../lib/routing";

/* ============================================================
   Tab: Análisis de ahorro
   ============================================================ */
export default function AhorroTab({ points, recorridos }) {
  const [loo, setLoo] = useState(true);
  const results = useMemo(() => analizarAhorro(points, recorridos, { leaveOneOut: loo }), [points, recorridos, loo]);
  const [open, setOpen] = useState(null);

  if (recorridos.length === 0) return <Card className="p-6"><Empty>Registra recorridos para poder analizar el ahorro.</Empty></Card>;
  if (results.length === 0) return <Card className="p-6"><Empty>Aún no hay recorridos analizables. Se necesitan recorridos de <span className="text-rtb-gold-400">3 paradas o más</span> (con menos, el orden no cambia nada).</Empty></Card>;

  const totalGap = results.reduce((s, r) => s + r.gap, 0);
  const avgPct = mean(results.map((r) => r.gapPct)) ?? 0;
  const yaOptimos = results.filter((r) => r.sameOrder).length;
  const chartData = results.map((r, i) => ({ label: `#${i + 1}`, fecha: r.date, tuOrden: Math.round(r.realOnMatrix), optima: Math.round(r.optCost) }));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Info size={15} className="mt-0.5 text-slate-500" />
            <p className="max-w-2xl text-xs leading-relaxed text-slate-400">
              Comparo <span className="text-slate-200">tu orden real</span> contra el <span className="text-rtb-gold-300">orden óptimo</span>, midiendo ambos con los <span className="text-teal-400">mismos tiempos promedio</span>. Así la única diferencia es el orden de visita: lo que ves es <span className="text-slate-200">desperdicio puro de ruteo</span>, no efecto del tráfico de un día. Si la brecha se encoge con el tiempo, el equipo está rutando mejor.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={loo} onChange={(e) => setLoo(e.target.checked)} className="accent-rtb-gold-500" />
            Excluir cada recorrido de su propio dato (más honesto)
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Recorridos analizados" value={results.length} />
          <Stat label="Tiempo desperdiciado (total)" value={fmtMin(totalGap)} color="text-rose-300" />
          <Stat label="Ahorro potencial promedio" value={`${avgPct.toFixed(1)}%`} color="text-rtb-gold-300" highlight />
          <Stat label="Ya iban óptimos" value={`${yaOptimos}/${results.length}`} color="text-teal-300" />
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Tu orden vs. la ruta óptima, recorrido por recorrido</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} unit="m" />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#cbd5e1" }} formatter={(v, n) => [`${v} min`, n === "tuOrden" ? "Tu orden" : "Óptima"]}
                labelFormatter={(l, p) => p?.[0]?.payload ? `Recorrido ${l} · ${p[0].payload.fecha}` : l} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "tuOrden" ? "Tu orden real" : "Ruta óptima")} />
              <Line type="monotone" dataKey="tuOrden" stroke="#fb7185" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="optima" stroke="#AD9551" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-center text-xs text-slate-500">El área entre las dos líneas es el tiempo que estás dejando en la mesa. Idealmente se cierra con el tiempo.</p>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Detalle por recorrido</h3>
        <ul className="space-y-2">
          {results.map((r, i) => (
            <li key={r.id} className="rounded-lg border border-slate-800 bg-slate-950/50">
              <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                <span className="font-mono text-xs text-slate-500">#{i + 1}</span>
                <span className="text-sm text-slate-300">{r.date}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{r.n} paradas</span>
                {r.sameOrder ? (
                  <span className="flex items-center gap-1 text-xs text-teal-400"><CheckCircle2 size={13} /> óptimo</span>
                ) : (
                  <span className="text-xs text-rose-300">−{fmtMin(r.gap)} desperdicio <span className="text-slate-500">({r.gapPct.toFixed(0)}%)</span></span>
                )}
                {r.estimado && <AlertTriangle size={13} className="text-rose-400" />}
                <ChevronRight size={15} className={`ml-auto text-slate-600 transition ${open === r.id ? "rotate-90" : ""}`} />
              </button>
              {open === r.id && (
                <div className="border-t border-slate-800 px-3 py-3">
                  <div className="mb-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-3 lg:grid-cols-6">
                    <Stat label="Tu orden (en matriz)" value={fmtMin(r.realOnMatrix)} color="text-rose-300" />
                    <Stat label="Orden óptimo" value={fmtMin(r.optCost)} color="text-rtb-gold-300" />
                    <Stat label="Real medido ese día" value={fmtMin(r.realMeasured)} />
                    <Stat label="Espera total" value={fmtMin(r.totalWait)} color="text-sky-300" />
                    {r.totalBreak > 0 && <Stat label="Comida" value={fmtMin(r.totalBreak)} color="text-orange-300" />}
                    <Stat label="Total ruta" value={fmtMin(r.realMeasured + r.totalWait + r.totalBreak)} color="text-violet-300" highlight />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-wider text-rose-400">Orden que hiciste</div>
                      <SeqList names={r.realNames} closed={r.closed} />
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-wider text-rtb-gold-400">Orden óptimo sugerido</div>
                      <SeqList names={r.optNames} closed={r.closed} />
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
const SeqList = ({ names, closed }) => (
  <ol className="space-y-1">
    {names.map((n, i) => (
      <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-400">{i + 1}</span>{n}
      </li>
    ))}
    {closed && <li className="flex items-center gap-2 text-xs text-slate-500"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px]">↩</span>regreso al inicio</li>}
  </ol>
);

