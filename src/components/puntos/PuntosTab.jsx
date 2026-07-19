// =====================================================================
// src/components/puntos/PuntosTab.jsx
// Pestaña "Puntos": alta/edición/borrado de depósito y clientes, con
// mapa Leaflet para fijar coordenadas y dirección (manual o geocodificada).
// =====================================================================
import { useState, useMemo, Suspense } from "react";
import {
  Plus, Save, Trash2, Pencil, X, ChevronDown, Search, Copy, ExternalLink, Compass,
} from "lucide-react";
import { Card, Btn, Field, inputCls, Empty } from "../ui";
import { useConfirm } from "../feedback";
import { LeafletMap, MapFallback } from "../maps";
import { TYPE_META, CITY_FALLBACK } from "../../lib/constants";
import { reverseGeocode } from "../../lib/geocode";

const isValidLat = (v) => v.trim() !== "" && !isNaN(Number(v)) && Number(v) >= -90 && Number(v) <= 90;
const isValidLng = (v) => v.trim() !== "" && !isNaN(Number(v)) && Number(v) >= -180 && Number(v) <= 180;
const googleMapsUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

export default function PuntosTab({ points, recorridos, onAddPunto, onUpdatePunto, onRemovePunto }) {
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [type, setType] = useState("entrega");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [direccion, setDireccion] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  // Centro por defecto del mapa al crear: el depósito con coordenadas, o la ciudad.
  const defaultCenter = useMemo(() => {
    const dep = points.find((p) => p.type === "deposito" && p.lat != null && p.lng != null);
    return dep ? { lat: dep.lat, lng: dep.lng } : CITY_FALLBACK;
  }, [points]);

  // Nombre duplicado (ignorando mayúsculas/espacios), excluyendo el propio punto en edición.
  const nameTaken = useMemo(() => {
    const n = name.trim().toLowerCase();
    if (!n) return false;
    return points.some((p) => p.id !== editId && p.name.trim().toLowerCase() === n);
  }, [points, name, editId]);

  const hasValidCoords = isValidLat(lat) && isValidLng(lng);
  const mapLat = hasValidCoords ? Number(lat) : undefined;
  const mapLng = hasValidCoords ? Number(lng) : undefined;

  const startEdit = (p) => {
    setEditId(p.id);
    setErr("");
    setName(p.name);
    setType(p.type);
    setLat(p.lat != null ? String(p.lat) : "");
    setLng(p.lng != null ? String(p.lng) : "");
    setDireccion(p.direccion || "");
  };

  const cancelEdit = () => {
    setEditId(null);
    setErr("");
    setName(""); setType("entrega"); setLat(""); setLng(""); setDireccion("");
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || busy) return;
    setErr("");
    if (nameTaken) { setErr("Ya existe un punto con ese nombre."); return; }
    if (lat.trim() && !isValidLat(lat)) { setErr("Latitud inválida: debe estar entre -90 y 90."); return; }
    if (lng.trim() && !isValidLng(lng)) { setErr("Longitud inválida: debe estar entre -180 y 180."); return; }
    setBusy(true);
    try {
      const payload = {
        name: trimmedName, type,
        lat: lat.trim() ? parseFloat(lat) : null,
        lng: lng.trim() ? parseFloat(lng) : null,
        direccion: direccion.trim() || null,
      };
      if (editId) {
        await onUpdatePunto(editId, payload);
        setEditId(null);
      } else {
        await onAddPunto(payload);
      }
      setName(""); setType("entrega"); setLat(""); setLng(""); setDireccion("");
    } catch (e) {
      setErr(e?.code === "23505" ? "Ya existe un punto con ese nombre." : (e?.message || "No se pudo guardar el punto."));
    } finally { setBusy(false); }
  };

  const obtenerDireccion = async () => {
    if (!hasValidCoords || geocoding) return;
    setGeocoding(true);
    try {
      const d = await reverseGeocode(Number(lat), Number(lng));
      if (d) setDireccion(d);
      else setErr("No se pudo obtener la dirección (sin resultado o sin conexión).");
    } finally { setGeocoding(false); }
  };

  const remove = async (id) => {
    const target = points.find((p) => p.id === id);
    const enRecorridos = recorridos.filter((R) => R.stops.some((s) => s.point === id));
    const seEliminarian = enRecorridos.filter((R) => R.stops.filter((s) => s.point !== id).length < 2);
    const detalle = enRecorridos.length
      ? `Está en ${enRecorridos.length} recorrido${enRecorridos.length === 1 ? "" : "s"}.` +
        (seEliminarian.length
          ? ` ${seEliminarian.length} quedaría${seEliminarian.length === 1 ? "" : "n"} con menos de 2 paradas y se eliminaría${seEliminarian.length === 1 ? "" : "n"} también.`
          : "")
      : "No está en ningún recorrido.";
    const ok = await confirm({ message: `¿Eliminar "${target?.name ?? "este punto"}"?\n\n${detalle}`, confirmLabel: "Eliminar", danger: true });
    if (!ok) return;
    if (editId === id) cancelEdit();
    if (expandedId === id) setExpandedId(null);
    await onRemovePunto(id);
  };

  const copyCoords = async (p) => {
    try { await navigator.clipboard.writeText(`${p.lat}, ${p.lng}`); } catch { /* portapapeles no disponible */ }
  };

  const filtered = search.trim()
    ? points.filter((p) =>
        p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        TYPE_META[p.type].label.toLowerCase().includes(search.trim().toLowerCase())
      )
    : points;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">
          {editId ? "Editar punto" : "Nuevo punto"}
        </h2>
        <div className="space-y-3">
          <Field label="Nombre">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Almacén / Cliente / Sucursal" />
          </Field>
          {nameTaken && <p className="text-xs text-rose-400">Ya existe un punto con ese nombre.</p>}
          <Field label="Tipo">
            <div className="flex gap-1">
              {Object.entries(TYPE_META).map(([k, v]) => (
                <button key={k} onClick={() => setType(k)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs ${type === k ? "border-rtb-gold-500 bg-rtb-gold-500/10 text-rtb-gold-300" : "border-slate-700 text-slate-400"}`}>
                  {v.label}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitud (opcional)"><input className={inputCls} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="19.4326" /></Field>
            <Field label="Longitud (opcional)"><input className={inputCls} value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-99.1332" /></Field>
          </div>
          <Suspense fallback={<MapFallback className="h-56 w-full rounded-lg" />}>
            <LeafletMap
              interactive
              className="h-56 w-full overflow-hidden rounded-lg"
              lat={mapLat}
              lng={mapLng}
              defaultCenter={defaultCenter}
              onPick={(la, ln) => { setLat(la.toFixed(6)); setLng(ln.toFixed(6)); }}
            />
          </Suspense>
          <p className="text-xs text-slate-500">Coordenadas opcionales: haz clic en el mapa o arrastra el pin para fijarlas; también puedes teclearlas.</p>
          <Field label="Dirección (opcional)">
            <div className="flex gap-2">
              <input className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle, número, colonia…" />
              <Btn variant="ghost" onClick={obtenerDireccion} disabled={!hasValidCoords || geocoding} className="shrink-0 justify-center whitespace-nowrap text-xs">
                <Compass size={14} /> {geocoding ? "Buscando…" : "Obtener dirección"}
              </Btn>
            </div>
            {!hasValidCoords && <p className="mt-1 text-[11px] text-slate-600">Fija coordenadas para poder obtenerla automáticamente.</p>}
          </Field>
          {err && <p className="text-xs text-rose-400">{err}</p>}
          <div className="flex gap-2">
            {editId && (
              <Btn variant="ghost" onClick={cancelEdit} className="flex-1 justify-center">
                <X size={16} /> Cancelar
              </Btn>
            )}
            <Btn onClick={save} disabled={busy || nameTaken} className={`${editId ? "flex-1" : "w-full"} justify-center`}>
              {editId ? <><Save size={16} /> Guardar cambios</> : <><Plus size={16} /> Agregar punto</>}
            </Btn>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Puntos registrados</h2>
        {points.length > 0 && (
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              className={inputCls + " pl-8"}
              placeholder="Buscar punto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        {points.length === 0 ? (
          <Empty>Aún no hay puntos. Agrega tu almacén como <span className="text-rtb-gold-400">Depósito</span> y tus clientes.</Empty>
        ) : filtered.length === 0 ? (
          <Empty>Sin resultados para <span className="text-slate-300">"{search}"</span>.</Empty>
        ) : (
          <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
            {filtered.map((p) => (
              <li key={p.id}
                className={`rounded-lg border bg-slate-950/50 transition ${editId === p.id ? "border-rtb-gold-500/50 bg-rtb-gold-500/5" : "border-slate-800"}`}>
                <div role="button" tabIndex={0}
                  onClick={() => setExpandedId((cur) => cur === p.id ? null : p.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedId((cur) => cur === p.id ? null : p.id); } }}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TYPE_META[p.type].dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-200">{p.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {TYPE_META[p.type].label}
                      {p.lat != null && p.lng != null && <span className="font-mono"> · {p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>}
                    </div>
                  </div>
                  <ChevronDown size={15}
                    className={`shrink-0 transition ${expandedId === p.id ? "rotate-180 text-rtb-gold-400" : "text-slate-600"}`} />
                  <button onClick={(e) => { e.stopPropagation(); editId === p.id ? cancelEdit() : startEdit(p); }}
                    className={`shrink-0 transition ${editId === p.id ? "text-rtb-gold-400" : "text-slate-600 hover:text-rtb-gold-400"}`}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); remove(p.id); }} className="shrink-0 text-slate-600 hover:text-rose-400">
                    <Trash2 size={15} />
                  </button>
                </div>
                {expandedId === p.id && (
                  <div className="space-y-2 border-t border-slate-800 px-3 py-3">
                    {p.direccion && <p className="text-xs text-slate-400">{p.direccion}</p>}
                    {p.lat != null && p.lng != null ? (
                      <>
                        <Suspense fallback={<MapFallback className="h-40 w-full rounded-lg" />}>
                          <LeafletMap className="h-40 w-full overflow-hidden rounded-lg" lat={p.lat} lng={p.lng} />
                        </Suspense>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-slate-400">{p.lat.toFixed(6)}, {p.lng.toFixed(6)}</span>
                          <button onClick={() => copyCoords(p)} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-300">
                            <Copy size={12} /> Copiar
                          </button>
                        </div>
                        <a href={googleMapsUrl(p)} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700">
                          <ExternalLink size={13} /> Ver ubicación en Google Maps
                        </a>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500">Este punto no tiene coordenadas registradas.</p>
                        <div className="flex items-center gap-2">
                          <span className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-600">
                            <ExternalLink size={13} /> Ver ubicación en Google Maps
                          </span>
                          <Btn variant="ghost" onClick={() => startEdit(p)} className="justify-center text-xs">
                            <Pencil size={13} /> Agregar coordenadas
                          </Btn>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
