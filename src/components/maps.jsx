// =====================================================================
// src/components/maps.jsx
// Leaflet pesa lo suyo: se carga solo cuando se muestra un mapa (chunk
// aparte). Importar estos componentes en vez de LeafletMap/RouteMap
// directamente para no duplicar la declaración lazy() por pestaña
// (el bundler deduplica el chunk igual, pero así hay un solo punto).
// =====================================================================
import { lazy } from "react";

export const LeafletMap = lazy(() => import("./LeafletMap"));
export const RouteMap = lazy(() => import("./RouteMap"));

export const MapFallback = ({ className }) => (
  <div className={`flex items-center justify-center bg-slate-950/50 text-xs text-slate-500 ${className || ""}`}>
    Cargando mapa…
  </div>
);
