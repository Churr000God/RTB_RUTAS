// =====================================================================
// src/components/seguimiento/SeguimientoTab.jsx
// Reemplaza al antiguo MonitorTab (src/App.jsx): interfaz completa de
// seguimiento en vivo — una tarjeta por chofer con identidad, línea de
// tiempo, estadísticas, edición del plan de pendientes y alertas de
// desviación. Ver el módulo funcional "Seguimiento de Ruta".
// =====================================================================
import { Radio } from "lucide-react";
import DriverCard from "./DriverCard";

export default function SeguimientoTab({
  activeRoutes, profiles, allPoints, segments, waits,
  onLiberar, onAddStop, onRemoveStop, onReorder, onSendNote,
}) {
  const entries = Object.values(activeRoutes || {});

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-rtb-teal-100 bg-rtb-surface p-8 text-center">
        <Radio size={36} className="mx-auto mb-3 text-slate-400" />
        <p className="text-sm text-rtb-navy-mid">No hay rutas en curso en este momento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-rtb-navy-mid">
        {entries.length} {entries.length === 1 ? "ruta activa" : "rutas activas"} · actualización en vivo
      </p>
      {entries.map(({ driverId, driverNombre, state }) => (
        <DriverCard
          key={driverId}
          driverId={driverId}
          driverNombre={driverNombre}
          state={state}
          allPoints={allPoints}
          segments={segments}
          waits={waits}
          onLiberar={onLiberar}
          onAddStop={onAddStop}
          onRemoveStop={onRemoveStop}
          onReorder={onReorder}
          onSendNote={onSendNote}
        />
      ))}
    </div>
  );
}
