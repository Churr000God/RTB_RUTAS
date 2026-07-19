// =====================================================================
// src/components/matriz/MatrizTab.jsx
// Pestaña "Matriz aprendida": tiempos observados/estimados entre cada
// par de puntos, filtrable por día de la semana.
// =====================================================================
import { useState, useMemo } from "react";
import { Card, Field, inputCls, Empty } from "../ui";
import { fmtMin } from "../../lib/utils";
import { DOW, buildMatrices } from "../../lib/routing";

/* ============================================================
   Tab: Matriz aprendida
   ============================================================ */
export default function MatrizTab({ points, segments }) {
  const [weekday, setWeekday] = useState(""), [stat, setStat] = useState("median");
  const { timeM, learned, counts } = useMemo(() => buildMatrices(points, segments, { weekday: weekday === "" ? null : +weekday, stat }), [points, segments, weekday, stat]);
  if (points.length < 2) return <Card className="p-6"><Empty>Agrega al menos 2 puntos para ver la matriz.</Empty></Card>;
  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Día de la semana">
          <select className={inputCls} value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            <option value="">Todos los días</option>{DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </Field>
        <Field label="Estadística">
          <select className={inputCls} value={stat} onChange={(e) => setStat(e.target.value)}>
            <option value="median">Mediana (robusta)</option><option value="mean">Promedio</option>
          </select>
        </Field>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-400" /> Aprendido</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Estimado</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead><tr>
            <th className="sticky left-0 bg-slate-900 p-2 text-left text-slate-500">De ↓ / A →</th>
            {points.map((p) => <th key={p.id} className="p-2 text-left font-medium text-slate-400">{p.name}</th>)}
          </tr></thead>
          <tbody>
            {points.map((from, i) => (
              <tr key={from.id} className="border-t border-slate-800">
                <td className="sticky left-0 bg-slate-900 p-2 font-medium text-slate-300">{from.name}</td>
                {points.map((to, j) => (
                  <td key={to.id} className="p-2">
                    {i === j ? <span className="text-slate-700">·</span> : (
                      <div className={`rounded px-1.5 py-1 font-mono ${learned[i][j] ? "bg-teal-500/10 text-teal-300" : "bg-rose-500/10 text-rose-300"}`}>
                        {fmtMin(timeM[i][j])}{learned[i][j] && <span className="ml-1 text-[9px] text-teal-500/70">×{counts[i][j]}</span>}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500"><span className="font-mono text-teal-500">×N</span> = cuántos recorridos reales respaldan ese tiempo. Entre más alto, más confiable.</p>
    </Card>
  );
}
