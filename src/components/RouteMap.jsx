// =====================================================================
// src/components/RouteMap.jsx
// Mapa de una ruta completa (Leaflet + OpenStreetMap, solo lectura):
// un pin numerado por parada (en el orden de visita) más una línea que
// las conecta en secuencia. La línea es un conector directo entre
// puntos — no sigue calles, no hay servicio de ruteo.
//
// Se carga vía React.lazy desde App.jsx, igual que LeafletMap.jsx, para
// no engordar el bundle inicial. Reutiliza el mismo patrón imperativo:
// el mapa se crea una sola vez sobre un <div> con ref y se actualiza a
// mano cuando cambian las paradas.
//
// Las paradas sin coordenadas se omiten del mapa; es responsabilidad
// del componente que lo usa avisar cuáles faltan (este componente no
// renderiza ese aviso).
// =====================================================================
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CITY_FALLBACK = { lat: 19.4326, lng: -99.1332 };

// Pin circular numerado: dorado de marca para el depósito (parada 1), teal para el resto.
function numberedIcon(n, isDepot) {
  const bg = isDepot ? "#AD9551" : "#0d9488";
  const html = `
    <div style="
      background:${bg}; color:#0f172a; width:26px; height:26px; border-radius:9999px;
      display:flex; align-items:center; justify-content:center;
      font:700 12px/1 system-ui, sans-serif; border:2px solid rgba(15,23,42,0.75);
      box-shadow:0 1px 3px rgba(0,0,0,.4);
    ">${n}</div>`;
  return L.divIcon({ html, className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
}

export default function RouteMap({ stops = [], closed = false, defaultCenter, defaultZoom = 13, className = "" }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  // Crear el mapa una sola vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center = defaultCenter ?? CITY_FALLBACK;
    const map = L.map(containerRef.current).setView([center.lat, center.lng], defaultZoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redibujar pines + línea cuando cambian las paradas (reordenar/anclar).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layerRef.current?.remove();
    layerRef.current = null;

    const withCoords = stops
      .map((s, i) => ({ ...s, seq: i + 1 }))
      .filter((s) => s.lat != null && s.lng != null);
    if (!withCoords.length) return;

    const group = L.layerGroup();
    withCoords.forEach((s) => {
      const marker = L.marker([s.lat, s.lng], { icon: numberedIcon(s.seq, s.seq === 1) });
      marker.bindTooltip(s.name || `Parada ${s.seq}`, { direction: "top", offset: [0, -10] });
      group.addLayer(marker);
    });

    const latlngs = withCoords.map((s) => [s.lat, s.lng]);
    if (closed && latlngs.length > 1) latlngs.push(latlngs[0]);
    if (latlngs.length > 1) {
      group.addLayer(L.polyline(latlngs, { color: "#AD9551", weight: 3, opacity: 0.8, dashArray: "6 4" }));
    }
    group.addTo(map);
    layerRef.current = group;

    const bounds = L.latLngBounds(latlngs);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }, [stops, closed]);

  // Recalcular tamaño cuando el contenedor cambia de dimensiones.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return <div ref={containerRef} className={className} />;
}
