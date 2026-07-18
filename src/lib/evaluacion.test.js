import { describe, it, expect } from "vitest";
import {
  ruteoCriterio, entregasCriterio, esperasCriterio, ritmoCriterio, combinarCriterios,
  etiquetaFor, DEFAULT_WEIGHTS,
  evaluarRecorrido, evaluarRecorridos,
  agruparPorUsuario, agruparPorSemana, resumenFlota, rankingChoferes,
  alertasRecorridos, alertasChoferes,
} from "./evaluacion";

/* ============================================================
   Criterios individuales (matemática pura)
   ============================================================ */
describe("ruteoCriterio", () => {
  it("0% de brecha -> 100 pts", () => {
    expect(ruteoCriterio(0)).toMatchObject({ score: 100, aplica: true });
  });
  it("decae linealmente con el gap y nunca baja de 0", () => {
    expect(ruteoCriterio(30).score).toBeCloseTo(70);
    expect(ruteoCriterio(150).score).toBe(0); // clamp
  });
  it("sin datos -> no aplica", () => {
    expect(ruteoCriterio(null)).toMatchObject({ score: null, aplica: false });
    expect(ruteoCriterio(NaN)).toMatchObject({ score: null, aplica: false });
  });
});

describe("entregasCriterio", () => {
  it("todas completadas -> 100", () => {
    const stops = [{ estado: "entregado" }, { estado: "recolectado" }];
    expect(entregasCriterio(stops)).toMatchObject({ score: 100, aplica: true });
  });
  it("mezcla completadas/no_se_pudo -> proporción", () => {
    const stops = [{ estado: "entregado" }, { estado: "no_se_pudo" }, { estado: "entregado" }, { estado: null }];
    // 2 completadas de 3 intentadas (el null no cuenta como intentada)
    expect(entregasCriterio(stops).score).toBeCloseTo((2 / 3) * 100);
  });
  it("sin ningún estado registrado -> no aplica (N/A)", () => {
    const stops = [{ estado: null }, { estado: undefined }];
    expect(entregasCriterio(stops)).toMatchObject({ score: null, aplica: false });
  });
});

describe("esperasCriterio", () => {
  it("espera real <= habitual -> 100", () => {
    const stops = [{ point: "a", waitMin: 4 }, { point: "b", waitMin: 5 }];
    const W = { a: 5, b: 5 };
    expect(esperasCriterio(stops, W).score).toBe(100);
  });
  it("espera real > habitual penaliza proporcionalmente", () => {
    const stops = [{ point: "a", waitMin: 10 }]; // 100% sobre lo habitual (5 -> 10)
    const W = { a: 5 };
    expect(esperasCriterio(stops, W).score).toBeCloseTo(0);
  });
  it("ignora paradas sin espera habitual aprendida", () => {
    const stops = [{ point: "a", waitMin: 20 }]; // sin W[a]
    expect(esperasCriterio(stops, {}).aplica).toBe(false);
  });
});

describe("ritmoCriterio", () => {
  it("real <= esperado para el orden real -> 100", () => {
    expect(ritmoCriterio(18, 20)).toMatchObject({ score: 100, aplica: true });
  });
  it("real > esperado penaliza proporcionalmente", () => {
    expect(ritmoCriterio(40, 20).score).toBeCloseTo(0); // 100% más lento
  });
  it("sin tiempo esperado -> no aplica", () => {
    expect(ritmoCriterio(10, null)).toMatchObject({ score: null, aplica: false });
    expect(ritmoCriterio(10, 0)).toMatchObject({ score: null, aplica: false });
  });
});

describe("combinarCriterios", () => {
  it("suma ponderada cuando todos los criterios aplican", () => {
    const criterios = {
      ruteo: { score: 100, aplica: true },
      entregas: { score: 100, aplica: true },
      esperas: { score: 100, aplica: true },
      ritmo: { score: 100, aplica: true },
    };
    const { puntuacionFinal, etiqueta } = combinarCriterios(criterios, DEFAULT_WEIGHTS);
    expect(puntuacionFinal).toBeCloseTo(100);
    expect(etiqueta).toBe("Excelente");
  });
  it("redistribuye el peso cuando un criterio no aplica", () => {
    const criterios = {
      ruteo: { score: 100, aplica: true },
      entregas: { score: null, aplica: false }, // N/A: su peso (30) se redistribuye
      esperas: { score: 0, aplica: true },
      ritmo: { score: 100, aplica: true },
    };
    // Solo cuentan ruteo(35)+esperas(20)+ritmo(15) = 70 de peso total.
    const { puntuacionFinal } = combinarCriterios(criterios, DEFAULT_WEIGHTS);
    const esperado = (35 * 100 + 20 * 0 + 15 * 100) / 70;
    expect(puntuacionFinal).toBeCloseTo(esperado);
  });
  it("sin ningún criterio aplicable -> null / Sin datos", () => {
    const criterios = {
      ruteo: { score: null, aplica: false },
      entregas: { score: null, aplica: false },
      esperas: { score: null, aplica: false },
      ritmo: { score: null, aplica: false },
    };
    const { puntuacionFinal, etiqueta } = combinarCriterios(criterios, DEFAULT_WEIGHTS);
    expect(puntuacionFinal).toBeNull();
    expect(etiqueta).toBe("Sin datos");
  });
});

describe("etiquetaFor", () => {
  it("clasifica por rango", () => {
    expect(etiquetaFor(90)).toBe("Excelente");
    expect(etiquetaFor(85)).toBe("Excelente");
    expect(etiquetaFor(75)).toBe("Bien");
    expect(etiquetaFor(70)).toBe("Bien");
    expect(etiquetaFor(60)).toBe("Regular");
    expect(etiquetaFor(50)).toBe("Regular");
    expect(etiquetaFor(49)).toBe("Bajo");
    expect(etiquetaFor(null)).toBe("Sin datos");
  });
});

/* ============================================================
   evaluarRecorrido / evaluarRecorridos — escenario sintético end-to-end
   ============================================================ */

// 4 puntos en línea recta, espaciados ~4.2km (0.038° lat) entre sí: dep --
// p1 -- p2 -- p3 (orden natural = óptimo). El espaciado se eligió para que
// el fallback por haversine (speedKmh=25 por defecto en buildMatrices) dé
// tiempos del mismo orden de magnitud que los legMin sintéticos de abajo —
// si no, un atajo "estimado" barato podría verse más barato que la cadena
// "aprendida" y el óptimo dejaría de coincidir con el orden real, rompiendo
// las aserciones de `sameOrder`/`gapPct` de las pruebas siguientes.
const POINTS = [
  { id: "dep", name: "Depósito", type: "almacen", lat: 19.000, lng: -99.00 },
  { id: "p1", name: "Punto 1", type: "cliente", lat: 19.038, lng: -99.00 },
  { id: "p2", name: "Punto 2", type: "cliente", lat: 19.076, lng: -99.00 },
  { id: "p3", name: "Punto 3", type: "cliente", lat: 19.114, lng: -99.00 },
];

// Recorrido "base": aprende dep->p1 (10 min / 5 min espera), p1->p2 (8/5),
// p2->p3 (6/5), todos entregados. Sirve de fuente de aprendizaje (leave-
// one-out) para evaluar los demás recorridos, y también se evalúa a sí
// mismo (siendo el único con datos limpios, debería salir muy bien).
const R_BASE = {
  id: "r0", dateISO: "2026-07-01", ts: Date.UTC(2026, 6, 1), driverId: "driverA",
  stops: [
    { point: "dep", legMin: null, waitMin: 0, estado: null },
    { point: "p1", legMin: 10, waitMin: 5, estado: "entregado" },
    { point: "p2", legMin: 8, waitMin: 5, estado: "entregado" },
    { point: "p3", legMin: 6, waitMin: 5, estado: "entregado" },
  ],
};

// Recorrido "malo": mismo orden ya aprendido (dep->p1->p2->p3, así que el
// ruteo YA es óptimo = 100), pero tramos más lentos, esperas más largas
// y una parada no completada -> debe salir con puntuación baja en
// entregas/esperas/ritmo pero alta en ruteo.
const R_MALO = {
  id: "r1", dateISO: "2026-07-02", ts: Date.UTC(2026, 6, 2), driverId: "driverA",
  stops: [
    { point: "dep", legMin: null, waitMin: 0, estado: null },
    { point: "p1", legMin: 20, waitMin: 10, estado: "entregado" },   // 2x el tiempo/espera aprendidos
    { point: "p2", legMin: 16, waitMin: 10, estado: "no_se_pudo" },  // no completada
    { point: "p3", legMin: 12, waitMin: 10, estado: "entregado" },
  ],
};

const ALL_RECORRIDOS = [R_BASE, R_MALO];

describe("evaluarRecorrido — recorrido con datos limpios (R_BASE)", () => {
  const evs = evaluarRecorridos(POINTS, ALL_RECORRIDOS);
  const ev = evs.find((e) => e.id === "r0");

  it("evalúa el recorrido y arma el desglose por punto", () => {
    expect(ev).toBeTruthy();
    expect(ev.n).toBe(4);
    expect(ev.stops).toHaveLength(4);
    expect(ev.stops[1].name).toBe("Punto 1");
    expect(ev.stops[1].direccion).toBeNull(); // sin dirección capturada
  });

  it("con leave-one-out, dep->p1->p2->p3 no tiene datos aprendidos propios (solo R_MALO como fuente) y aun así el orden coincide con el óptimo", () => {
    expect(ev.sameOrder).toBe(true);
  });
});

describe("evaluarRecorrido — recorrido con mal desempeño (R_MALO)", () => {
  const evs = evaluarRecorridos(POINTS, ALL_RECORRIDOS);
  const ev = evs.find((e) => e.id === "r1");

  it("el ruteo sale alto: ya visitó en el orden aprendido (dep->p1->p2->p3)", () => {
    expect(ev.sameOrder).toBe(true);
    expect(ev.criterios.ruteo.score).toBeCloseTo(100, 0);
  });

  it("entregas penaliza la parada 'no_se_pudo'", () => {
    expect(ev.criterios.entregas.aplica).toBe(true);
    expect(ev.criterios.entregas.score).toBeCloseTo((2 / 3) * 100);
  });

  it("esperas y ritmo penalizan por ser más lento que lo aprendido", () => {
    expect(ev.criterios.esperas.aplica).toBe(true);
    expect(ev.criterios.esperas.score).toBeLessThan(100);
    expect(ev.criterios.ritmo.aplica).toBe(true);
    expect(ev.criterios.ritmo.score).toBeLessThan(100);
  });

  it("la puntuación final combina los 4 criterios y queda por debajo de R_BASE", () => {
    const evBase = evs.find((e) => e.id === "r0");
    expect(ev.puntuacionFinal).toBeLessThan(evBase.puntuacionFinal);
  });

  it("descarta recorridos con menos de 3 paradas o puntos inexistentes", () => {
    const corto = { id: "rx", dateISO: "2026-07-03", ts: Date.UTC(2026, 6, 3), driverId: "driverA",
      stops: [{ point: "dep", legMin: null, waitMin: 0 }, { point: "p1", legMin: 5, waitMin: 0 }] };
    expect(evaluarRecorrido(corto, POINTS, [corto])).toBeNull();
    const inexistente = { id: "ry", dateISO: "2026-07-03", ts: Date.UTC(2026, 6, 3), driverId: "driverA",
      stops: [{ point: "dep" }, { point: "p1" }, { point: "no-existe" }] };
    expect(evaluarRecorrido(inexistente, POINTS, [inexistente])).toBeNull();
  });
});

/* ============================================================
   Agregados: por usuario, semanal, general, ranking, alertas
   ============================================================ */

const EVS = evaluarRecorridos(POINTS, ALL_RECORRIDOS);
const PROFILES = [{ userId: "driverA", nombre: "Juan Pérez", role: "driver" }];

describe("agruparPorUsuario", () => {
  it("agrupa ambos recorridos bajo el mismo chofer", () => {
    const g = agruparPorUsuario(EVS, PROFILES);
    expect(g).toHaveLength(1);
    expect(g[0].nombre).toBe("Juan Pérez");
    expect(g[0].n).toBe(2);
  });
  it("recorridos sin driver_id se agrupan como 'Sin asignar'", () => {
    const sinAsignar = { ...R_BASE, id: "r9", driverId: null };
    const evs2 = evaluarRecorridos(POINTS, [sinAsignar, R_MALO]);
    const g = agruparPorUsuario(evs2, PROFILES);
    expect(g.find((x) => x.nombre === "Sin asignar")).toBeTruthy();
  });
});

describe("agruparPorSemana", () => {
  it("agrupa por semana ISO", () => {
    const g = agruparPorSemana(EVS);
    expect(g.length).toBeGreaterThan(0);
    expect(g[0].semana).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("resumenFlota", () => {
  it("calcula promedio, distribución y tiempo desperdiciado", () => {
    const r = resumenFlota(EVS);
    expect(r.n).toBe(2);
    expect(r.promedio).not.toBeNull();
    expect(r.tiempoDesperdiciado).toBeGreaterThanOrEqual(0);
    const totalDistribuidos = Object.values(r.distribucion).reduce((a, b) => a + b, 0);
    expect(totalDistribuidos).toBe(2);
  });
});

describe("rankingChoferes / alertas", () => {
  it("el ranking ordena por promedio descendente", () => {
    const rank = rankingChoferes(EVS, PROFILES);
    expect(rank[0].n).toBe(2);
  });
  it("alertasRecorridos marca R_MALO si su puntuación cae bajo el umbral", () => {
    const alertas = alertasRecorridos(EVS, 100); // umbral alto a propósito para forzar el caso
    expect(alertas.some((e) => e.id === "r1")).toBe(true);
  });
  it("alertasChoferes filtra por promedio bajo umbral", () => {
    const alertas = alertasChoferes(EVS, PROFILES, 0); // umbral 0: nadie debería caer
    expect(alertas).toHaveLength(0);
  });
});
