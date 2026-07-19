// =====================================================================
// src/components/micuenta/MiCuentaTab.jsx
// Pestaña "Mi cuenta" (todos los roles): nombre propio y contraseña.
// =====================================================================
import { useState } from "react";
import { UserCircle, KeyRound, Save } from "lucide-react";
import { Card, Btn, Field, inputCls } from "../ui";

/* ============================================================
   Tab: Mi cuenta (todos los roles) — nombre propio y contraseña
   ============================================================ */
export default function MiCuentaTab({ profile, onUpdateName, onChangePassword }) {
  const [nombre, setNombre] = useState(profile?.nombre ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState("");

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  const saveName = async () => {
    if (!nombre.trim() || nombre.trim() === profile?.nombre) return;
    setSavingName(true); setNameMsg("");
    try { await onUpdateName(nombre.trim()); setNameMsg("Guardado"); }
    catch (e) { setNameMsg(e.message || "No se pudo guardar"); }
    finally { setSavingName(false); setTimeout(() => setNameMsg(""), 2500); }
  };

  const savePassword = async () => {
    setPwErr(""); setPwMsg("");
    if (pw.length < 6) { setPwErr("La contraseña debe tener al menos 6 caracteres."); return; }
    if (pw !== pw2) { setPwErr("Las contraseñas no coinciden."); return; }
    setSavingPw(true);
    try { await onChangePassword(pw); setPw(""); setPw2(""); setPwMsg("Contraseña actualizada"); }
    catch (e) { setPwErr(e.message || "No se pudo cambiar la contraseña."); }
    finally { setSavingPw(false); }
  };

  return (
    <div className="max-w-md space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <UserCircle size={14} className="text-rtb-gold-400" />
          <span className="text-sm font-semibold text-slate-200">Mi nombre</span>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Nombre">
              <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Field>
          </div>
          <Btn onClick={saveName} disabled={savingName || !nombre.trim() || nombre.trim() === profile?.nombre} className="py-2 px-3 text-xs">
            <Save size={12} /> {savingName ? "Guardando…" : "Guardar"}
          </Btn>
        </div>
        {nameMsg && <p className="mt-2 text-xs text-teal-400">{nameMsg}</p>}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound size={14} className="text-rtb-gold-400" />
          <span className="text-sm font-semibold text-slate-200">Cambiar contraseña</span>
        </div>
        <div className="space-y-2">
          <Field label="Nueva contraseña">
            <input type="password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label="Repite la contraseña">
            <input type="password" className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePassword()} />
          </Field>
          {pwErr && <p className="text-xs text-rose-400">{pwErr}</p>}
          {pwMsg && <p className="text-xs text-teal-400">{pwMsg}</p>}
          <Btn onClick={savePassword} disabled={savingPw || !pw || !pw2} className="text-xs">
            {savingPw ? "Guardando…" : "Actualizar contraseña"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
