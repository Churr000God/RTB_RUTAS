import { AlertTriangle } from "lucide-react";
import { alertasRecorridos, alertasChoferes, etiquetaFor } from "../../lib/evaluacion";
import { Card, Empty } from "./ui";
import ScoreBadge from "./ScoreBadge";

const UMBRAL_DEFAULT = 60;

/** Rutas y choferes por debajo del umbral de puntuación (propuesto: 60). */
export default function AlertasPanel({ evs, profiles, umbral = UMBRAL_DEFAULT }) {
  const rutas = alertasRecorridos(evs, umbral);
  const choferes = alertasChoferes(evs, profiles, umbral);
  const nombreDeChofer = (driverId) =>
    driverId == null ? "Sin asignar" : (profiles.find((p) => p.userId === driverId)?.nombre ?? "Chofer eliminado");

  if (!rutas.length && !choferes.length) {
    return (
      <Card className="p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
          <AlertTriangle size={14} className="text-slate-500" /> Alertas de bajo desempeño
        </h3>
        <Empty>Nada por debajo de {umbral} pts en este periodo.</Empty>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
        <AlertTriangle size={14} className="text-rose-400" /> Alertas de bajo desempeño
        <span className="text-[11px] font-normal text-slate-500">(umbral: {umbral} pts)</span>
      </h3>
      {choferes.length > 0 && (
        <div className="mb-3">
          <h4 className="mb-1.5 text-[11px] uppercase tracking-wider text-slate-500">Choferes</h4>
          <ul className="space-y-1.5">
            {choferes.map((g) => (
              <li key={g.driverId ?? "sin-asignar"} className="flex items-center justify-between rounded-lg border border-rose-900/40 bg-rose-950/20 px-3 py-2 text-xs">
                <span className="text-slate-200">{g.nombre}</span>
                <ScoreBadge score={g.promedio} etiqueta={etiquetaFor(g.promedio)} size="sm" />
              </li>
            ))}
          </ul>
        </div>
      )}
      {rutas.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[11px] uppercase tracking-wider text-slate-500">Recorridos</h4>
          <ul className="space-y-1.5">
            {rutas.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-lg border border-rose-900/40 bg-rose-950/20 px-3 py-2 text-xs">
                <span className="text-slate-200">{e.date} · {nombreDeChofer(e.driverId)}</span>
                <ScoreBadge score={e.puntuacionFinal} etiqueta={e.etiqueta} size="sm" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
