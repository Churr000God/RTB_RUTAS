import { describe, it, expect } from "vitest";
import {
  solveTSP, tourCost, metricsForOrder, computeETAs, minToHHMM, parseHHMM,
} from "./routing";

// Matriz simétrica de prueba, depósito en índice 0.
//      0    1    2    3
//  0 [ 0,   1,   4,   3 ]
//  1 [ 1,   0,   2,   4 ]
//  2 [ 4,   2,   0,   1 ]
//  3 [ 3,   4,   1,   0 ]
// Ciclo óptimo cerrado: 0-1-2-3-0 (o su reverso 0-3-2-1-0), costo 7.
const SQUARE = [
  [0, 1, 4, 3],
  [1, 0, 2, 4],
  [4, 2, 0, 1],
  [3, 4, 1, 0],
];

describe("solveTSP — sin anclajes (Held-Karp exacto, n<=12)", () => {
  it("encuentra el ciclo óptimo cerrado", () => {
    const r = solveTSP(SQUARE, 4, true);
    expect(r).not.toBeNull();
    expect(r.exact).toBe(true);
    expect(r.order[0]).toBe(0);
    expect(new Set(r.order).size).toBe(4);
    expect(r.cost).toBeCloseTo(7);
    expect(tourCost(r.order, SQUARE, true)).toBeCloseTo(7);
  });

  it("ruta abierta: no suma el tramo de regreso", () => {
    const r = solveTSP(SQUARE, 4, false);
    expect(r).not.toBeNull();
    expect(r.order[0]).toBe(0);
    // Óptimo abierto conocido: 1-0... en realidad probamos vía tourCost directo.
    expect(tourCost(r.order, SQUARE, false)).toBeCloseTo(r.cost);
  });

  it("n<=1 es trivial", () => {
    expect(solveTSP(SQUARE, 1, true)).toEqual({ order: [0], cost: 0, exact: true });
  });

  it("devuelve null si no hay tour factible (tramo faltante en ambos sentidos)", () => {
    const C = [
      [0, null],
      [null, 0],
    ];
    expect(solveTSP(C, 2, true)).toBeNull();
  });
});

describe("solveTSP — con anclajes", () => {
  it("respeta 'primera tras el inicio' (posición 1)", () => {
    // Ancla nodo 2 en posición 1 → fuerza 0->2->... óptimo con esa
    // restricción es [0,2,3,1] costo 10 (ver cálculo en el header).
    const r = solveTSP(SQUARE, 4, true, new Map([[2, 1]]));
    expect(r).not.toBeNull();
    expect(r.exact).toBe(true);
    expect(r.order).toEqual([0, 2, 3, 1]);
    expect(r.cost).toBeCloseTo(10);
  });

  it("respeta 'última antes del regreso' (posición n-1)", () => {
    // Ancla nodo 1 en posición 3 (última) → óptimo con esa restricción
    // es [0,3,2,1] costo 7.
    const r = solveTSP(SQUARE, 4, true, new Map([[1, 3]]));
    expect(r).not.toBeNull();
    expect(r.order).toEqual([0, 3, 2, 1]);
    expect(r.cost).toBeCloseTo(7);
  });

  it("respeta una posición intermedia concreta", () => {
    // Ancla nodo 3 en posición 2 (segunda parada).
    const r = solveTSP(SQUARE, 4, true, new Map([[3, 2]]));
    expect(r).not.toBeNull();
    expect(r.order[2]).toBe(3);
    expect(new Set(r.order).size).toBe(4);
  });

  it("acepta anclajes como objeto plano (no solo Map)", () => {
    const r = solveTSP(SQUARE, 4, true, { 2: 1 });
    expect(r).not.toBeNull();
    expect(r.order).toEqual([0, 2, 3, 1]);
  });

  it("rechaza (null) dos nodos anclados a la misma posición", () => {
    const r = solveTSP(SQUARE, 4, true, new Map([[1, 1], [2, 1]]));
    expect(r).toBeNull();
  });

  it("rechaza (null) anclar el depósito (nodo 0, siempre fijo en posición 0)", () => {
    const r = solveTSP(SQUARE, 4, true, new Map([[0, 1]]));
    expect(r).toBeNull();
  });

  it("rechaza (null) una posición fuera de rango", () => {
    expect(solveTSP(SQUARE, 4, true, new Map([[1, 0]]))).toBeNull(); // posición 0 es el depósito
    expect(solveTSP(SQUARE, 4, true, new Map([[1, 4]]))).toBeNull(); // fuera de rango
  });

  it("sin anclajes, el resultado es idéntico al no pasar el parámetro", () => {
    const withEmpty = solveTSP(SQUARE, 4, true, new Map());
    const withoutArg = solveTSP(SQUARE, 4, true);
    expect(withEmpty.cost).toBeCloseTo(withoutArg.cost);
  });
});

describe("solveTSP — heurístico con anclajes (n>12)", () => {
  // Matriz 14x14: costo = distancia en un anillo (nodo i a j = |i-j| en el
  // anillo de 14), simétrica y determinista, sin depender de geografía.
  const N = 14;
  const ring = (i, j) => Math.min(Math.abs(i - j), N - Math.abs(i - j));
  const C = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => ring(i, j)));

  it("produce un orden válido (permutación completa, inicio en 0)", () => {
    const r = solveTSP(C, N, true);
    expect(r.exact).toBe(false);
    expect(r.order[0]).toBe(0);
    expect(new Set(r.order).size).toBe(N);
  });

  it("no mueve los nodos anclados de su posición", () => {
    const anchors = new Map([[5, 1], [9, N - 1]]);
    const r = solveTSP(C, N, true, anchors);
    expect(r).not.toBeNull();
    expect(r.order[1]).toBe(5);
    expect(r.order[N - 1]).toBe(9);
    expect(new Set(r.order).size).toBe(N);
  });
});

describe("metricsForOrder", () => {
  const sub = [{ id: "dep" }, { id: "a" }, { id: "b" }];
  const timeM = [
    [0, 10, 20],
    [10, 0, 5],
    [20, 5, 0],
  ];
  const distM = [
    [0, 1, 2],
    [1, 0, 0.5],
    [2, 0.5, 0],
  ];
  const learned = [
    [true, true, false],
    [true, true, true],
    [false, true, true],
  ];
  const W = { dep: 0, a: 3, b: 1 };

  it("suma manejo/distancia/esperas de un orden dado (ruta cerrada)", () => {
    const r = metricsForOrder([0, 1, 2], { sub, timeM, distM, learned, W, closed: true });
    // 0->1 (10) + 1->2 (5) + 2->0 (20, no aprendido) = 35 min manejo
    expect(r.totT).toBeCloseTo(35);
    // 0->1 (1) + 1->2 (0.5) + 2->0 (2) = 3.5 km
    expect(r.totD).toBeCloseTo(3.5);
    // espera en a (3) + espera en b (1) = 4
    expect(r.totW).toBeCloseTo(4);
    expect(r.anyEst).toBe(true); // el tramo 2->0 no está aprendido
    expect(r.seqIds).toEqual(["dep", "a", "b"]);
  });

  it("ruta abierta no suma el tramo de regreso", () => {
    const r = metricsForOrder([0, 1, 2], { sub, timeM, distM, learned, W, closed: false });
    expect(r.totT).toBeCloseTo(15); // solo 0->1 y 1->2
    expect(r.anyEst).toBe(false); // ambos tramos usados están aprendidos
  });
});

describe("computeETAs / minToHHMM / parseHHMM", () => {
  const sub = [{ id: "dep", name: "Depósito" }, { id: "a", name: "A" }, { id: "b", name: "B" }];
  const timeM = [
    [0, 10, 20],
    [10, 0, 5],
    [20, 5, 0],
  ];
  const learned = [
    [true, true, false],
    [true, true, true],
    [false, true, true],
  ];
  const W = { dep: 0, a: 3, b: 1 };

  it("acumula ETA por parada desde la hora de inicio", () => {
    const start = parseHHMM("08:00"); // 480 min
    const { etas } = computeETAs([0, 1, 2], { sub, timeM, learned, W, closed: false }, start);
    expect(minToHHMM(etas[0].etaMin)).toBe("08:00"); // depósito
    expect(minToHHMM(etas[1].etaMin)).toBe("08:10"); // +10 manejo
    expect(minToHHMM(etas[2].etaMin)).toBe("08:18"); // +3 espera en A +5 manejo
    expect(etas[1].approx).toBe(false);
  });

  it("marca ETA aproximada tras un tramo no aprendido", () => {
    // Forzamos que el primer tramo (0->1) sea "no aprendido".
    const learnedGap = [
      [true, false, true],
      [false, true, true],
      [true, true, true],
    ];
    const start = parseHHMM("08:00");
    const { etas } = computeETAs([0, 1, 2], { sub, timeM, learned: learnedGap, W, closed: false }, start);
    expect(etas[1].approx).toBe(true);
    expect(etas[2].approx).toBe(true); // arrastra la aproximación
  });

  it("hora de regreso suma el tramo de vuelta + buffer de comida", () => {
    const start = parseHHMM("08:00");
    const { horaRegresoMin } = computeETAs([0, 1, 2], { sub, timeM, learned, W, closed: true }, start, 60);
    // 08:00 + 10 (0->1) + 3 (espera a) + 5 (1->2) + 1 (espera b) + 60 (comida) + 20 (2->0) = 09:39
    expect(minToHHMM(horaRegresoMin)).toBe("09:39");
  });

  it("parseHHMM/minToHHMM son inversas para horas válidas", () => {
    expect(minToHHMM(parseHHMM("14:37"))).toBe("14:37");
  });

  it("minToHHMM envuelve al pasar de medianoche", () => {
    expect(minToHHMM(23 * 60 + 50 + 20)).toBe("00:10");
  });
});
