// =====================================================================
// src/lib/geocode.js
// Geocodificación inversa (lat/lng -> dirección de texto) vía Nominatim
// (OpenStreetMap), el mismo proveedor de tiles que ya usan LeafletMap/
// RouteMap — sin llave de API. Requiere internet.
//
// Uso previsto: botón "Obtener dirección" en el formulario de Puntos,
// una llamada puntual por click (no hay barrido masivo), así que no hace
// falta throttling propio — solo respetar la política de uso de Nominatim
// (User-Agent identificable, sin automatizar en volumen).
// =====================================================================

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

/**
 * Devuelve la dirección de texto para unas coordenadas, o null si no se
 * pudo resolver (sin internet, sin resultado, error de red). Nunca lanza.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string|null>}
 */
export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return null;
  try {
    const url = `${NOMINATIM_URL}?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=0`;
    const res = await fetch(url, { headers: { "Accept-Language": "es" } });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.display_name || null;
  } catch {
    return null;
  }
}
