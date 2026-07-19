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

/** Color determinista para un driverId. Saturación/luminosidad fijas para
 * contraste sobre tarjeta clara (bg-rtb-surface): fill/text sin cambios
 * (ya daban ≥8.8:1 y ≥6.6:1 respectivamente contra #EEF8F7 en cualquier
 * hue); stroke oscurecido de 55% a 30% de luminosidad — a 55% el anillo
 * caía hasta 1.35:1 contra la tarjeta clara en los hues amarillo-verde
 * (invisible, bajo el mínimo WCAG de 3:1 para bordes/UI); a 30% el peor
 * caso sube a 4.88:1. Verificado con verificador de contraste WCAG para
 * los 24 hues (cada 15°) antes de aplicar. */
export function colorForDriver(id) {
  const hue = id ? hash(String(id)) % 360 : 0;
  return {
    hue,
    stroke: `hsl(${hue} 45% 30%)`,
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
