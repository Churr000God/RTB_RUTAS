import { describe, it, expect } from "vitest";
import {
  mergeRutaActiva, mergeEditLog, mergeNotes,
  consumedIds, effectivePending, computeDeviation, DEVIATION_DEFAULTS,
} from "./rutaActivaMerge";
import { colorForDriver, initialsFor } from "./driverColor";

const baseState = () => ({
  title: "Ruta X", closed: false, startId: "s", startName: "Depósito",
  endId: null, driverNombre: "Juan",
  route: [{ id: "s", name: "Depósito", arrivedAt: 1000, departedAt: 1000 }],
  phase: "choose-next", nextStop: null, nextLegKm: "", done: false, horaInicio: null,
  noticeAckAt: 0,
  remaining: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
  notes: [], notice: null, editLog: [],
  _wDriver: 100, _wPlan: 100, _wDispatch: 100, _w: 100,
});

describe("mergeRutaActiva — grupos ortogonales", () => {
  it("driver-newer conserva progreso y adopta el plan más nuevo del despacho", () => {
    const base = baseState();
    const incoming = {
      ...base,
      route: [...base.route, { id: "a", name: "A", arrivedAt: 2000, departedAt: null }],
      phase: "at-stop",
      _wDriver: 200, // el chofer avanzó
    };
    const dispatchEdit = {
      ...base,
      remaining: [{ id: "b", name: "B" }, { id: "c", name: "C" }],
      _wPlan: 300, // el despacho editó después, en otro dispositivo
    };
    // primero se funde el avance del chofer con el estado base...
    const afterDriver = mergeRutaActiva(base, incoming);
    // ...luego llega la edición del despacho: no debe pisar route/phase
    const merged = mergeRutaActiva(afterDriver, dispatchEdit);
    expect(merged.route).toHaveLength(2);
    expect(merged.phase).toBe("at-stop");
    expect(merged.remaining).toEqual([{ id: "b", name: "B" }, { id: "c", name: "C" }]);
  });

  it("plan-newer no pisa el progreso driver aunque venga en el mismo objeto", () => {
    const base = baseState();
    const incoming = { ...base, remaining: [{ id: "b", name: "B" }], _wPlan: 500, route: [] /* stale */ };
    const merged = mergeRutaActiva(base, incoming);
    expect(merged.route).toEqual(base.route); // gana base (mayor _wDriver)
    expect(merged.remaining).toEqual([{ id: "b", name: "B" }]); // gana incoming (mayor _wPlan)
  });

  it("dispatch-newer trae notas y notice sin afectar otros grupos", () => {
    const base = baseState();
    const incoming = {
      ...base,
      notice: { id: "n1", text: "Se agregó una parada", at: 1 },
      notes: [{ id: "note1", text: "Pásate por bodega", by: "u1", byName: "Ana", at: 1 }],
      _wDispatch: 400,
    };
    const merged = mergeRutaActiva(base, incoming);
    expect(merged.notice).toEqual(incoming.notice);
    expect(merged.notes).toEqual(incoming.notes);
    expect(merged.route).toEqual(base.route);
    expect(merged.remaining).toEqual(base.remaining);
  });

  it("empate de sellos: gana base (evita perder progreso reciente propio)", () => {
    const base = baseState();
    const incoming = { ...base, phase: "at-stop" }; // mismo _wDriver=100
    expect(mergeRutaActiva(base, incoming).phase).toBe("choose-next");
  });

  it("editLog se fusiona por unión, sin duplicar ni perder entradas", () => {
    const base = { ...baseState(), editLog: [{ id: "e1", at: 1, action: "add" }] };
    const incoming = { ...baseState(), editLog: [{ id: "e1", at: 1, action: "add" }, { id: "e2", at: 2, action: "remove" }] };
    const merged = mergeRutaActiva(base, incoming);
    expect(merged.editLog.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("fallback a `_w` legado cuando faltan los sellos por grupo", () => {
    const base = { ...baseState(), _wDriver: undefined, _wPlan: undefined, _wDispatch: undefined, _w: 50 };
    const incoming = { ...baseState(), _wDriver: undefined, _wPlan: undefined, _wDispatch: undefined, _w: 999, phase: "traveling" };
    const merged = mergeRutaActiva(base, incoming);
    expect(merged.phase).toBe("traveling");
  });

  it("preserva campos inmutables no nulos de cualquiera de los dos lados", () => {
    const base = { ...baseState(), title: null };
    const incoming = { ...baseState(), title: "Ruta real" };
    expect(mergeRutaActiva(base, incoming).title).toBe("Ruta real");
  });

  it("devuelve el otro lado si uno es null (ruta inexistente/borrada)", () => {
    const base = baseState();
    expect(mergeRutaActiva(null, base)).toBe(base);
    expect(mergeRutaActiva(base, null)).toBe(base);
    expect(mergeRutaActiva(null, null)).toBeNull();
  });
});

describe("mergeEditLog / mergeNotes", () => {
  it("dedupea por id y ordena por `at`", () => {
    const a = [{ id: "2", at: 20 }, { id: "1", at: 10 }];
    const b = [{ id: "1", at: 10 }, { id: "3", at: 30 }];
    expect(mergeEditLog(a, b).map((e) => e.id)).toEqual(["1", "2", "3"]);
  });

  it("mergeNotes se comporta igual que mergeEditLog (unión append-only)", () => {
    const a = [{ id: "n1", at: 1, text: "hola" }];
    const b = [{ id: "n2", at: 2, text: "chau" }];
    expect(mergeNotes(a, b)).toHaveLength(2);
  });
});

describe("consumedIds / effectivePending", () => {
  it("excluye visitados y el destino inmediato en traveling", () => {
    const state = {
      route: [{ id: "s" }, { id: "a" }],
      phase: "traveling",
      nextStop: { id: "b", name: "B" },
      remaining: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
    };
    expect(consumedIds(state)).toEqual(new Set(["s", "a", "b"]));
    expect(effectivePending(state)).toEqual([{ id: "c", name: "C" }]);
  });

  it("un punto reagregado por el despacho reaparece si no fue visitado", () => {
    const state = { route: [{ id: "s" }], phase: "choose-next", nextStop: null, remaining: [{ id: "z", name: "Z" }] };
    expect(effectivePending(state)).toEqual([{ id: "z", name: "Z" }]);
  });

  it("un punto ya visitado que el despacho vuelve a agregar no reaparece", () => {
    const state = { route: [{ id: "s" }, { id: "a" }], phase: "choose-next", nextStop: null, remaining: [{ id: "a", name: "A" }] };
    expect(effectivePending(state)).toEqual([]);
  });

  it("state nulo devuelve lista vacía", () => {
    expect(effectivePending(null)).toEqual([]);
  });
});

describe("computeDeviation", () => {
  const allPoints = [
    { id: "s", name: "Depósito", lat: 19.0, lng: -99.0 },
    { id: "a", name: "A", lat: 19.05, lng: -99.05 },
  ];

  it("sin datos aprendidos ni observaciones, no genera alerta (espera esperada = 0)", () => {
    const state = { phase: "at-stop", done: false, route: [{ id: "a", name: "A", arrivedAt: Date.now() - 60000 }] };
    expect(computeDeviation(state, { allPoints, segments: [], waits: [] })).toBeNull();
  });

  it("alerta de espera larga cuando el real excede umbral y esperado", () => {
    const now = 1_000_000_000;
    const waits = [{ point: "a", min: 5, ts: 1 }, { point: "a", min: 5, ts: 2 }];
    const state = { phase: "at-stop", done: false, route: [{ id: "a", name: "A", arrivedAt: now - 40 * 60000 }] };
    const dev = computeDeviation(state, { allPoints, segments: [], waits }, now);
    expect(dev?.kind).toBe("wait");
    expect(dev.realMin).toBeGreaterThan(dev.expectedMin);
  });

  it("no alerta si el real está dentro de lo esperado", () => {
    const now = 1_000_000_000;
    const waits = [{ point: "a", min: 20, ts: 1 }];
    const state = { phase: "at-stop", done: false, route: [{ id: "a", name: "A", arrivedAt: now - 5 * 60000 }] };
    expect(computeDeviation(state, { allPoints, segments: [], waits }, now)).toBeNull();
  });

  it("alerta de tramo largo en fase traveling, marcada approx sin datos aprendidos", () => {
    const now = 1_000_000_000;
    const state = {
      phase: "traveling", done: false,
      route: [{ id: "s", name: "Depósito", arrivedAt: now - 200 * 60000, departedAt: now - 180 * 60000 }],
      nextStop: { id: "a", name: "A" },
    };
    const dev = computeDeviation(state, { allPoints, segments: [] }, now, { minAbs: 5, ratio: 1.2 });
    expect(dev?.kind).toBe("leg");
    expect(dev.approx).toBe(true);
  });

  it("ruta terminada nunca genera alerta", () => {
    const state = { done: true, phase: "at-stop", route: [{ id: "a", arrivedAt: 0 }] };
    expect(computeDeviation(state, { allPoints })).toBeNull();
  });
});

describe("colorForDriver / initialsFor", () => {
  it("es determinista: mismo id produce el mismo color", () => {
    expect(colorForDriver("driver-1")).toEqual(colorForDriver("driver-1"));
  });

  it("ids distintos suelen producir hues distintos", () => {
    expect(colorForDriver("driver-1").hue).not.toBe(colorForDriver("driver-2").hue);
  });

  it("hue siempre en [0,360)", () => {
    const { hue } = colorForDriver("cualquier-uuid-1234");
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });

  it("initialsFor combina primera y última palabra", () => {
    expect(initialsFor("Juan Pérez")).toBe("JP");
    expect(initialsFor("Ana")).toBe("AN");
    expect(initialsFor("")).toBe("?");
    expect(initialsFor(null)).toBe("?");
  });
});
