// =====================================================================
// src/components/LeafletMap.jsx
// Mapa Leaflet reutilizable (OpenStreetMap, sin llave de API). Se carga
// vía React.lazy desde App.jsx para no engordar el bundle inicial.
//
// Dos modos:
//  - interactive=true  → clic o arrastre del pin fijan la ubicación
//    (usado en el formulario de alta/edición de puntos).
//  - interactive=false → solo lectura, solo muestra el pin
//    (usado en el desplegable de la lista de puntos).
//
// Leaflet es imperativo (no declarativo), así que el mapa se crea una
// sola vez sobre un <div> con ref y se actualiza a mano cuando cambian
// las props.
// =====================================================================
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CITY_FALLBACK = { lat: 19.4326, lng: -99.1332 };

// Pin ámbar dibujado por CSS/SVG: evita el problema conocido de los
// íconos PNG por defecto de Leaflet con bundlers (rutas de assets rotas).
const PIN_SVG = `
  <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9z" fill="#f59e0b"/>
    <circle cx="12" cy="9" r="3.4" fill="#0f172a"/>
  </svg>`;
const pinIcon = L.divIcon({
  html: PIN_SVG,
  className: "", // sin clases por defecto de Leaflet (fondo/blanco)
  iconSize: [28, 28],
  iconAnchor: [14, 28], // la punta del pin señala la coordenada exacta
});

export default function LeafletMap({
  lat, lng, interactive = false, onPick, defaultCenter, defaultZoom = 14, className = "",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);

  useEffect(() => { onPickRef.current = onPick; }, [onPick]);

  // Crear el mapa una sola vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center = lat != null && lng != null
      ? [lat, lng]
      : [defaultCenter?.lat ?? CITY_FALLBACK.lat, defaultCenter?.lng ?? CITY_FALLBACK.lng];
    const map = L.map(containerRef.current).setView(center, defaultZoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    if (interactive) {
      map.on("click", (e) => onPickRef.current?.(e.latlng.lat, e.latlng.lng));
    }
    mapRef.current = map;
    // El contenedor puede no tener aún su tamaño final (p. ej. un panel
    // que recién se despliega); recalcular tras el primer pintado.
    setTimeout(() => map.invalidateSize(), 50);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Crear/mover el marcador cuando cambian las coordenadas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lat == null || lng == null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const pos = [lat, lng];
    if (!markerRef.current) {
      const marker = L.marker(pos, { icon: pinIcon, draggable: interactive }).addTo(map);
      if (interactive) {
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          onPickRef.current?.(p.lat, p.lng);
        });
      }
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(pos);
    }
    map.panTo(pos);
  }, [lat, lng, interactive]);

  // Recalcular tamaño cuando el contenedor cambia de dimensiones
  // (p. ej. al desplegar la fila que lo contiene).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return <div ref={containerRef} className={className} />;
}
