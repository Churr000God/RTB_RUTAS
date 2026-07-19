// =====================================================================
// src/lib/constants.js
// Constantes compartidas entre pestañas (tipos de punto, estados de
// entrega, centro por defecto del mapa).
// =====================================================================

export const TYPE_META = {
  deposito: { label: "Depósito", dot: "bg-rtb-gold-400" },
  entrega: { label: "Entrega", dot: "bg-teal-400" },
  recoleccion: { label: "Recolección", dot: "bg-sky-400" },
};
export const CITY_FALLBACK = { lat: 19.4326, lng: -99.1332 }; // fallback si no hay depósito con coordenadas
export const ESTADO_ENTREGA = [
  { value: "", label: "Sin registrar" },
  { value: "entregado", label: "Entregado" },
  { value: "recolectado", label: "Recolectado" },
  { value: "no_se_pudo", label: "No se pudo" },
];
