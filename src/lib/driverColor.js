// =====================================================================
// src/lib/driverColor.js
// Identidad visual por chofer sin cambios de esquema: color determinista
// derivado del driverId (hash → hue) e iniciales del nombre. Mismo hue
// en cada render/dispositivo — permite distinguir varias rutas activas
// a simple vista y, más adelante, colorear su marcador en el mapa.
// =====================================================================

/** Hash estable (djb2) de un string a entero sin signo. */
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h;
}

/** Color determinista para un driverId. Saturación/luminosidad fijas para contraste sobre fondo oscuro. */
export function colorForDriver(id) {
  const hue = id ? hash(String(id)) % 360 : 0;
  return {
    hue,
    stroke: `hsl(${hue} 70% 55%)`,
    bg: `hsl(${hue} 40% 20%)`,
    text: `hsl(${hue} 85% 80%)`,
  };
}

/** Iniciales (máx. 2 letras) a partir del nombre del chofer. */
export function initialsFor(nombre) {
  if (!nombre) return "?";
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
