// =====================================================================
// src/components/datos/DatosTab.jsx
// Pestaña "Datos" (admin): respaldo completo — exporta/importa puntos,
// recorridos, rutas guardadas y usuarios/roles (import selectivo por
// tipo) — y borrar todo. Antes solo cubría puntos+recorridos y el
// reimportar perdía columnas; ver getBackup/restoreBackup en
// src/lib/supabase.js (§3.1 del documento de mejoras transversales).
// =====================================================================
import { useState } from "react";
import { Download, Upload, Trash2, AlertTriangle } from "lucide-react";
import { Card, Btn, Stat } from "../ui";
import { useToast, useConfirm } from "../feedback";

const TIPO_LABEL = { points: "Puntos", recorridos: "Recorridos", rutasGuardadas: "Rutas guardadas", profiles: "Usuarios y roles" };

export default function DatosTab({ points, recorridos, rutasGuardadas = [], profiles = [], onGetBackup, onRestoreBackup }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  // Archivo ya elegido y parseado, esperando que el admin marque qué
  // tipos restaurar (import selectivo) y confirme.
  const [pending, setPending] = useState(null); // { data, selected: {points,recorridos,rutasGuardadas,profiles} }

  const exportJSON = async () => {
    setBusy(true);
    try {
      const data = await onGetBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `rtb_rutas_${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      toast("Respaldo exportado.", { type: "success" });
    } catch (e) { console.error(e); toast("No se pudo exportar el respaldo.", { type: "error" }); }
    finally { setBusy(false); }
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo si se cancela
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      let data;
      try { data = JSON.parse(r.result); }
      catch { toast("Archivo inválido: no es JSON.", { type: "error" }); return; }
      if (!Array.isArray(data.points) && !Array.isArray(data.recorridos)) {
        toast("Archivo inválido: no tiene el formato de un respaldo de RTB Rutas.", { type: "error" });
        return;
      }
      // Selección inicial: marcar solo los tipos que el archivo trae
      // (compatibilidad con respaldos viejos, solo {points, recorridos}).
      const selected = {
        points: Array.isArray(data.points),
        recorridos: Array.isArray(data.recorridos),
        rutasGuardadas: Array.isArray(data.rutasGuardadas),
        profiles: Array.isArray(data.profiles),
      };
      setPending({ data, selected });
    };
    r.readAsText(f);
  };

  const toggleTipo = (tipo) => setPending((prev) => ({ ...prev, selected: { ...prev.selected, [tipo]: !prev.selected[tipo] } }));

  const runImport = async () => {
    const tipos = pending.selected;
    if (!Object.values(tipos).some(Boolean)) { toast("Selecciona al menos un tipo de dato a restaurar.", { type: "warn" }); return; }
    const lista = Object.entries(tipos).filter(([, v]) => v).map(([k]) => TIPO_LABEL[k]).join(", ");
    const ok = await confirm({
      title: "Restaurar respaldo",
      message: `Se reemplazará por completo: ${lista}.\n\nLos datos actuales de esos tipos se perderán. No se puede deshacer.`,
      confirmLabel: "Restaurar",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onRestoreBackup(pending.data, tipos);
      setPending(null);
      toast("Respaldo restaurado.", { type: "success" });
    } catch (e) { console.error(e); toast("No se pudo restaurar el respaldo.", { type: "error" }); }
    finally { setBusy(false); }
  };

  const reset = async () => {
    const ok = await confirm({
      title: "Borrar todo",
      message: "¿Borrar TODOS los puntos y recorridos? No se puede deshacer.",
      confirmLabel: "Borrar todo",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onRestoreBackup({}, { points: true, recorridos: true });
      toast("Datos borrados.", { type: "success" });
    } catch (e) { console.error(e); toast("No se pudo borrar.", { type: "error" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-200">Respaldo y migración</h2>
        <p className="mb-4 text-xs text-slate-500">
          Exporta el JSON completo (puntos, recorridos, rutas guardadas y usuarios/roles) para respaldarlo en Nextcloud o migrar entre entornos.
          Importar es selectivo: eliges qué tipos reemplazar.
        </p>
        <div className="mb-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Stat label="Puntos" value={points.length} />
          <Stat label="Recorridos" value={recorridos.length} />
          <Stat label="Rutas guardadas" value={rutasGuardadas.length} />
          <Stat label="Usuarios" value={profiles.length} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="ghost" onClick={exportJSON} disabled={busy}><Download size={16} /> Exportar JSON</Btn>
          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 ${busy ? "pointer-events-none opacity-40" : ""}`}>
            <Upload size={16} /> Elegir archivo…
            <input type="file" accept="application/json" className="hidden" disabled={busy} onChange={pickFile} />
          </label>
          <Btn variant="danger" onClick={reset} disabled={busy}><Trash2 size={16} /> Borrar todo</Btn>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-600">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          "Usuarios y roles" solo actualiza nombre/rol de cuentas que ya existen — las cuentas nuevas se crean en la pestaña Usuarios (envían invitación por correo), un respaldo no las recrea.
        </p>
      </Card>

      {pending && (
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-200">Restaurar respaldo</h3>
          <p className="mb-3 text-xs text-slate-500">Marca qué tipos de dato quieres reemplazar con el contenido del archivo elegido.</p>
          <div className="mb-4 space-y-2">
            {Object.keys(TIPO_LABEL).map((tipo) => {
              const disponible = pending.data[tipo] != null;
              const count = Array.isArray(pending.data[tipo]) ? pending.data[tipo].length : 0;
              return (
                <label key={tipo} className={`flex items-center gap-2 text-sm ${disponible ? "text-slate-200" : "text-slate-600"}`}>
                  <input
                    type="checkbox"
                    className="accent-rtb-gold-500"
                    checked={!!pending.selected[tipo]}
                    disabled={!disponible}
                    onChange={() => toggleTipo(tipo)}
                  />
                  {TIPO_LABEL[tipo]}
                  {disponible ? <span className="font-mono text-xs text-slate-500">({count})</span> : <span className="text-xs text-slate-700">no incluido en el archivo</span>}
                </label>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Btn variant="danger" onClick={runImport} disabled={busy}>{busy ? "Restaurando…" : "Restaurar seleccionados"}</Btn>
            <Btn variant="ghost" onClick={() => setPending(null)} disabled={busy}>Cancelar</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
