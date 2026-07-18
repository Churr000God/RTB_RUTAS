import { describe, it, expect, beforeEach } from "vitest";
import { saveLocal, readLocal, clearLocal, reconcile } from "./rutaDiaCache";

// Fake localStorage en memoria (el entorno de test es "node", sin DOM real).
function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

describe("rutaDiaCache — saveLocal/readLocal/clearLocal", () => {
  let storage;
  beforeEach(() => { storage = makeFakeStorage(); });

  it("guarda y lee el mismo estado", () => {
    const state = { phase: "at-stop", route: [{ id: "a" }], _w: 123 };
    saveLocal("driver-1", state, storage);
    expect(readLocal("driver-1", storage)).toEqual(state);
  });

  it("lee null si no hay nada guardado", () => {
    expect(readLocal("driver-1", storage)).toBeNull();
  });

  it("no mezcla cachés de choferes distintos", () => {
    saveLocal("driver-1", { phase: "at-stop", _w: 1 }, storage);
    saveLocal("driver-2", { phase: "traveling", _w: 2 }, storage);
    expect(readLocal("driver-1", storage).phase).toBe("at-stop");
    expect(readLocal("driver-2", storage).phase).toBe("traveling");
  });

  it("clearLocal borra solo la entrada del chofer indicado", () => {
    saveLocal("driver-1", { phase: "at-stop", _w: 1 }, storage);
    saveLocal("driver-2", { phase: "traveling", _w: 2 }, storage);
    clearLocal("driver-1", storage);
    expect(readLocal("driver-1", storage)).toBeNull();
    expect(readLocal("driver-2", storage)).not.toBeNull();
  });

  it("ignora llamadas sin driverId o sin storage", () => {
    expect(() => saveLocal(null, { _w: 1 }, storage)).not.toThrow();
    expect(() => saveLocal("driver-1", { _w: 1 }, null)).not.toThrow();
    expect(readLocal(null, storage)).toBeNull();
  });
});

describe("rutaDiaCache — reconcile", () => {
  it("gana el estado con _w más reciente", () => {
    const local = { phase: "at-stop", _w: 100 };
    const db = { phase: "choose-next", _w: 200 };
    expect(reconcile(local, db)).toBe(db);
    expect(reconcile(db, local)).toBe(db);
  });

  it("si empatan los sellos, prefiere el local (evita perder progreso reciente)", () => {
    const local = { phase: "at-stop", _w: 100 };
    const db = { phase: "choose-next", _w: 100 };
    expect(reconcile(local, db)).toBe(local);
  });

  it("usa el local si el servidor no tiene fila (aún no sincronizado)", () => {
    const local = { phase: "at-stop", _w: 100 };
    expect(reconcile(local, null)).toBe(local);
  });

  it("usa el del servidor si no hay caché local", () => {
    const db = { phase: "choose-next", _w: 100 };
    expect(reconcile(null, db)).toBe(db);
  });

  it("devuelve null si ninguno existe", () => {
    expect(reconcile(null, null)).toBeNull();
  });

  it("trata un estado sin sello _w como más viejo que cualquier escritura real", () => {
    const local = { phase: "at-stop" }; // sin _w
    const db = { phase: "choose-next", _w: 1 };
    expect(reconcile(local, db)).toBe(db);
  });
});
