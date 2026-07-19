// =====================================================================
// src/components/usuarios/UsuariosTab.jsx
// Pestaña "Usuarios" (admin): alta, roles, reset de contraseña y
// deshabilitar/habilitar cuentas.
// =====================================================================
import { useState } from "react";
import {
  Save, Pencil, UserCog, KeyRound, UserPlus, Ban, Mail, CheckCircle2,
} from "lucide-react";
import { Card, Btn, Field, inputCls } from "../ui";
import { useToast, useConfirm } from "../feedback";

const SUPERADMIN_ID = "5ecb861d-7d41-4d01-a916-72eb1c2b1817";

/* ============================================================
   Tab: Usuarios (admin) — alta, roles, reset de contraseña y
   deshabilitar/habilitar cuentas
   ============================================================ */
const ROLE_META = {
  admin:      { label: "Administrador", badge: "bg-rtb-gold-50 text-rtb-gold-700" },
  supervisor: { label: "Supervisor",    badge: "bg-sky-50 text-sky-700" },
  driver:     { label: "Chofer",        badge: "bg-slate-100 text-slate-400" },
};

function NuevoUsuarioForm({ onCrear, onClose }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("driver");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!nombre.trim() || !email.trim()) return;
    setErr(""); setBusy(true);
    try {
      await onCrear({ nombre: nombre.trim(), email: email.trim(), role });
      onClose();
    } catch (e) { setErr(e.message || "No se pudo crear el usuario."); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserPlus size={14} className="text-rtb-gold-700" />
        <span className="text-sm font-semibold text-rtb-navy">Nuevo usuario</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Nombre">
          <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" />
        </Field>
        <Field label="Correo">
          <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
        </Field>
        <Field label="Rol">
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="driver">driver — Chofer</option>
            <option value="supervisor">supervisor — Supervisor</option>
            <option value="admin">admin — Administrador</option>
          </select>
        </Field>
      </div>
      <p className="mt-2 text-[11px] text-rtb-navy-mid">Se envía un correo de invitación; la persona define su propia contraseña al abrirlo.</p>
      {err && <p className="mt-2 text-xs text-rose-700">{err}</p>}
      <div className="mt-3 flex gap-2">
        <Btn onClick={submit} disabled={busy || !nombre.trim() || !email.trim()} className="py-1 px-3 text-xs">
          <Mail size={12} /> {busy ? "Enviando invitación…" : "Invitar"}
        </Btn>
        <Btn variant="ghost" onClick={onClose} className="py-1 px-3 text-xs">Cancelar</Btn>
      </div>
    </Card>
  );
}

export default function UsuariosTab({ profiles, currentUserId, onUpdate, onCrear, onResetPassword, onToggle }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState({});   // userId → { nombre, role }
  const [saving, setSaving] = useState({});     // userId → bool
  const [saved, setSaved] = useState({});       // userId → bool (tick temporal)
  const [busyAction, setBusyAction] = useState({}); // userId → "reset" | "toggle"
  const [msg, setMsg] = useState({});           // userId → texto de confirmación temporal
  const [showNew, setShowNew] = useState(false);

  const startEdit = (p) => setEditing((prev) => ({ ...prev, [p.userId]: { nombre: p.nombre, role: p.role } }));
  const cancelEdit = (userId) => setEditing((prev) => { const n = { ...prev }; delete n[userId]; return n; });

  const flash = (userId, text) => {
    setMsg((prev) => ({ ...prev, [userId]: text }));
    setTimeout(() => setMsg((prev) => { const n = { ...prev }; delete n[userId]; return n; }), 2500);
  };

  const save = async (userId) => {
    const { nombre, role } = editing[userId];
    if (!nombre.trim()) return;
    setSaving((prev) => ({ ...prev, [userId]: true }));
    try {
      await onUpdate(userId, nombre.trim(), role);
      setSaved((prev) => ({ ...prev, [userId]: true }));
      setTimeout(() => setSaved((prev) => { const n = { ...prev }; delete n[userId]; return n; }), 2000);
      cancelEdit(userId);
    } catch (e) { console.error(e); toast("No se pudo guardar el usuario.", { type: "error" }); }
    finally { setSaving((prev) => { const n = { ...prev }; delete n[userId]; return n; }); }
  };

  const resetPassword = async (p) => {
    if (!p.email) return;
    if (!(await confirm(`¿Enviar correo de reseteo de contraseña a ${p.nombre} (${p.email})?`))) return;
    setBusyAction((prev) => ({ ...prev, [p.userId]: "reset" }));
    try { await onResetPassword(p.email); flash(p.userId, "Correo de reseteo enviado"); }
    catch (e) { flash(p.userId, e.message || "No se pudo enviar"); }
    finally { setBusyAction((prev) => { const n = { ...prev }; delete n[p.userId]; return n; }); }
  };

  const toggle = async (p) => {
    const next = !p.disabled;
    const ok = await confirm({
      message: next ? `¿Deshabilitar el acceso de ${p.nombre}?` : `¿Rehabilitar el acceso de ${p.nombre}?`,
      confirmLabel: next ? "Deshabilitar" : "Rehabilitar",
      danger: next,
    });
    if (!ok) return;
    setBusyAction((prev) => ({ ...prev, [p.userId]: "toggle" }));
    try { await onToggle(p.userId, next); }
    catch (e) { flash(p.userId, e.message || "No se pudo actualizar"); }
    finally { setBusyAction((prev) => { const n = { ...prev }; delete n[p.userId]; return n; }); }
  };

  return (
    <div className="space-y-3">
      {showNew ? (
        <NuevoUsuarioForm onCrear={onCrear} onClose={() => setShowNew(false)} />
      ) : (
        <Btn onClick={() => setShowNew(true)} className="text-xs">
          <UserPlus size={13} /> Nuevo usuario
        </Btn>
      )}

      {profiles.length === 0 && (
        <Card className="p-8 text-center">
          <UserCog size={36} className="mx-auto mb-3 text-slate-400" />
          <p className="text-sm text-rtb-navy-mid">No hay perfiles registrados.</p>
        </Card>
      )}

      {profiles.map((p) => {
        const ed = editing[p.userId];
        const isSaving = saving[p.userId];
        const isSaved = saved[p.userId];
        const isMe = p.userId === currentUserId;
        const isSuperAdmin = p.userId === SUPERADMIN_ID;
        const busy = busyAction[p.userId];
        const roleMeta = ROLE_META[p.role] ?? ROLE_META.driver;
        return (
          <Card key={p.userId} className={`p-4 ${p.disabled ? "opacity-60" : ""}`}>
            {ed ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <UserCog size={14} className="text-rtb-gold-700" />
                  <span className="text-xs text-rtb-navy-mid font-mono">{p.userId.slice(0, 8)}…</span>
                  {isMe && <span className="rounded bg-rtb-teal-50 px-1.5 py-0.5 text-[10px] text-rtb-navy-mid">tú</span>}
                  {isSuperAdmin && <span className="rounded bg-rtb-gold-50 px-1.5 py-0.5 text-[10px] text-rtb-gold-700">acceso maestro</span>}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Nombre">
                    <input
                      className={inputCls}
                      value={ed.nombre}
                      onChange={(e) => setEditing((prev) => ({ ...prev, [p.userId]: { ...prev[p.userId], nombre: e.target.value } }))}
                    />
                  </Field>
                  <Field label="Rol">
                    {isSuperAdmin ? (
                      <div className={inputCls + " flex items-center gap-2 cursor-not-allowed opacity-60"}>
                        <span className="flex-1 text-rtb-gold-700">admin — Administrador</span>
                        <span className="text-[10px] text-rtb-navy-mid">bloqueado</span>
                      </div>
                    ) : (
                      <select
                        className={inputCls}
                        value={ed.role}
                        onChange={(e) => setEditing((prev) => ({ ...prev, [p.userId]: { ...prev[p.userId], role: e.target.value } }))}
                      >
                        <option value="driver">driver — Chofer</option>
                        <option value="supervisor">supervisor — Supervisor</option>
                        <option value="admin">admin — Administrador</option>
                      </select>
                    )}
                  </Field>
                </div>
                <div className="flex gap-2">
                  <Btn onClick={() => save(p.userId)} disabled={isSaving || !ed.nombre.trim()} className="py-1 px-3 text-xs">
                    <Save size={12} /> {isSaving ? "Guardando…" : "Guardar"}
                  </Btn>
                  <Btn variant="ghost" onClick={() => cancelEdit(p.userId)} className="py-1 px-3 text-xs">Cancelar</Btn>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-rtb-navy">{p.nombre}</span>
                    {isMe && <span className="rounded bg-rtb-teal-50 px-1.5 py-0.5 text-[10px] text-rtb-navy-mid">tú</span>}
                    {isSuperAdmin && <span className="rounded bg-rtb-gold-50 px-1.5 py-0.5 text-[10px] text-rtb-gold-700">acceso maestro</span>}
                    {p.disabled && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700">deshabilitado</span>}
                    {isSaved && <CheckCircle2 size={13} className="text-rtb-teal-700" />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-rtb-navy-mid">
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${roleMeta.badge}`}>{p.role}</span>
                    {isSuperAdmin && <span className="text-slate-400">rol permanente</span>}
                    {p.email && <span className="text-slate-400">{p.email}</span>}
                    {msg[p.userId] && <span className="text-rtb-teal-700">{msg[p.userId]}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.email && (
                    <Btn variant="ghost" onClick={() => resetPassword(p)} disabled={!!busy} className="py-1 px-2 text-xs" title="Resetear contraseña">
                      <KeyRound size={13} /> {busy === "reset" ? "…" : ""}
                    </Btn>
                  )}
                  {!isSuperAdmin && !isMe && (
                    <Btn variant="ghost" onClick={() => toggle(p)} disabled={!!busy}
                      className={`py-1 px-2 text-xs ${p.disabled ? "text-rtb-teal-700" : "text-rose-700"}`}
                      title={p.disabled ? "Rehabilitar" : "Deshabilitar"}>
                      <Ban size={13} /> {busy === "toggle" ? "…" : ""}
                    </Btn>
                  )}
                  <Btn variant="ghost" onClick={() => startEdit(p)} className="py-1 px-2 text-slate-400 hover:text-rtb-navy">
                    <Pencil size={13} />
                  </Btn>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
