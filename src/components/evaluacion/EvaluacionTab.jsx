import { useMemo, useState } from "react";
import { evaluarRecorridos } from "../../lib/evaluacion";
import { Card, Empty } from "./ui";
import ReporteRuta from "./ReporteRuta";
import VistaUsuario from "./VistaUsuario";
import VistaSemanal from "./VistaSemanal";
import VistaGeneral from "./VistaGeneral";
import RankingChoferes from "./RankingChoferes";
import AlertasPanel from "./AlertasPanel";

const VIEWS = [
  { id: "ruta", label: "Reporte por ruta" },
  { id: "usuario", label: "Por usuario" },
  { id: "semanal", label: "Semanal" },
  { id: "general", label: "General" },
];

const PERIODOS = [
  { id: "semana", label: "Semana actual", days: 7 },
  { id: "4semanas", label: "Últimas 4 semanas", days: 28 },
  { id: "todo", label: "Todo el histórico", days: null },
];

function startOfISOWeek(ts) {
  const dt = new Date(ts);
  dt.setHours(0, 0, 0, 0);
  const day = (dt.getDay() + 6) % 7; // 0 = lunes
  dt.setDate(dt.getDate() - day);
  return dt.getTime();
}

/** Tab "Evaluación de rutas": reporte por ruta con puntuación por
 * criterios + vistas agregadas (por usuario, semanal, general) + ranking
 * y alertas de bajo desempeño. Reutiliza `evaluarRecorridos` (mismo motor
 * que "Análisis de ahorro"), calculado al vuelo, sin caché. */
export default function EvaluacionTab({ points, recorridos, profiles }) {
  const [view, setView] = useState("ruta");
  const [periodo, setPeriodo] = useState("semana");
  const [selectedId, setSelectedId] = useState(null);

  const allEvs = useMemo(() => evaluarRecorridos(points, recorridos), [points, recorridos]);

  const periodEvs = useMemo(() => {
    const p = PERIODOS.find((x) => x.id === periodo);
    if (!p || p.days == null) return allEvs;
    const start = periodo === "semana" ? startOfISOWeek(Date.now()) : Date.now() - p.days * 86400000;
    return allEvs.filter((e) => e.ts >= start);
  }, [allEvs, periodo]);

  const selected = useMemo(() => {
    if (!periodEvs.length) return null;
    if (selectedId && periodEvs.some((e) => e.id === selectedId)) return periodEvs.find((e) => e.id === selectedId);
    return periodEvs[periodEvs.length - 1]; // el más reciente del periodo, por defecto
  }, [periodEvs, selectedId]);

  const nombreDeChofer = (driverId) =>
    driverId == null ? "Sin asignar" : (profiles.find((p) => p.userId === driverId)?.nombre ?? "Chofer eliminado");

  if (recorridos.length === 0) {
    return <Card className="p-6"><Empty>Registra recorridos para poder evaluarlos.</Empty></Card>;
  }
  if (allEvs.length === 0) {
    return <Card className="p-6"><Empty>Aún no hay recorridos evaluables. Se necesitan recorridos de <span className="text-rtb-gold-700">3 paradas o más</span>.</Empty></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 flex-wrap gap-1.5">
            {VIEWS.map((v) => (
              <button key={v.id} onClick={() => setView(v.id)}
                className={`rounded-lg px-3 py-1.5 text-xs transition ${view === v.id ? "bg-rtb-teal font-semibold text-white" : "bg-rtb-surface text-rtb-navy-mid hover:bg-rtb-teal-50"}`}>
                {v.label}
              </button>
            ))}
          </div>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}
            className="rounded-lg border border-rtb-navy/15 bg-white px-2 py-1.5 text-xs text-rtb-navy">
            {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </Card>

      {periodEvs.length === 0 ? (
        <Card className="p-6"><Empty>Sin recorridos evaluables en este periodo.</Empty></Card>
      ) : view === "ruta" ? (
        <div className="space-y-3">
          <Card className="p-3">
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-rtb-navy-mid">Recorrido</label>
            <select value={selected?.id || ""} onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-lg border border-rtb-navy/15 bg-white px-2 py-1.5 text-sm text-rtb-navy">
              {periodEvs.slice().reverse().map((e) => (
                <option key={e.id} value={e.id}>
                  {e.date} · {nombreDeChofer(e.driverId)} · {e.etiqueta} ({e.puntuacionFinal != null ? Math.round(e.puntuacionFinal) : "—"})
                </option>
              ))}
            </select>
          </Card>
          <ReporteRuta ev={selected} driverNombre={nombreDeChofer(selected?.driverId)} />
        </div>
      ) : view === "usuario" ? (
        <VistaUsuario evs={periodEvs} profiles={profiles} />
      ) : view === "semanal" ? (
        <VistaSemanal evs={periodEvs} />
      ) : (
        <div className="space-y-4">
          <VistaGeneral evs={periodEvs} />
          <RankingChoferes evs={periodEvs} profiles={profiles} />
          <AlertasPanel evs={periodEvs} profiles={profiles} />
        </div>
      )}
    </div>
  );
}
