// =====================================================================
// src/components/auth/LoginGate.jsx
// Pantallas previas a la app: inicio de sesión y, cuando la sesión
// viene de un enlace de invitación o recuperación, definir contraseña.
//
// Primer contacto con el sistema → aplica la identidad de marca plena
// (identidad_visual/RTB_sistema_visual.md): lienzo blanco, logo, Great
// Vibes para el nombre, Playfair para el remate, teal/oro de acento y
// texto en navy. El resto de la app conserva el tablero oscuro por
// comodidad operativa (ver §2.1 del documento de mejoras transversales).
// =====================================================================
import { useState } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import { signIn, sendPasswordReset, changeMyPassword } from "../../lib/supabase";

const cardInputCls =
  "w-full rounded-lg border border-rtb-navy/15 bg-white px-3 py-2 text-sm text-rtb-navy placeholder-rtb-navy/35 focus:border-rtb-teal focus:outline-none focus:ring-2 focus:ring-rtb-teal/20";
const primaryBtnCls =
  "w-full rounded-lg bg-rtb-teal px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-rtb-navy disabled:cursor-not-allowed disabled:opacity-50";
const linkBtnCls = "w-full text-center text-xs text-rtb-navy-mid transition hover:text-rtb-navy hover:underline";

/** Lienzo de marca que envuelve el login y las pantallas de contraseña:
 * resplandor teal arriba, difuminándose a blanco (ver "estructura del
 * hero" en la guía). */
function BrandCanvas({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-rtb-teal-light/20 via-white to-white px-4 font-sans">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src="/logo-rtb.png" alt="Refacciones Tomás Badillo" className="mx-auto mb-3 h-20 w-20" />
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-rtb-gold">Portal de despacho</p>
          <h1 className="font-script text-4xl leading-none text-rtb-navy">Refacciones Tomás Badillo</h1>
          <p className="mt-1 font-display text-xs uppercase tracking-[0.3em] text-rtb-navy-mid">S.A. de C.V.</p>
        </div>
        <div className="rounded-2xl border border-rtb-surface bg-white p-6 shadow-xl shadow-rtb-navy/5">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Login
   ============================================================ */
export function LoginGate() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("login"); // "login" | "forgot" | "forgot-sent"
  const go = async () => {
    setErr(""); setBusy(true);
    try { await signIn(email.trim(), pw); }
    catch { setErr("Credenciales incorrectas."); setBusy(false); }
  };
  const sendReset = async () => {
    if (!email.trim()) { setErr("Escribe tu correo."); return; }
    setErr(""); setBusy(true);
    try {
      await sendPasswordReset(email.trim(), window.location.origin);
      setMode("forgot-sent");
    } catch { setErr("No se pudo enviar el correo."); }
    finally { setBusy(false); }
  };
  return (
    <BrandCanvas>
      <p className="mb-4 text-center text-xs text-rtb-navy-mid">
        {mode === "login" ? "Inicia sesión para continuar" : "Recuperar contraseña"}
      </p>
      {mode === "forgot-sent" ? (
        <div className="space-y-3 text-center">
          <CheckCircle2 size={28} className="mx-auto text-rtb-teal" />
          <p className="text-sm text-rtb-navy">Si el correo existe, te enviamos un enlace para restablecer tu contraseña.</p>
          <button onClick={() => setMode("login")} className={linkBtnCls}>Volver</button>
        </div>
      ) : (
        <div className="space-y-3">
          <input className={cardInputCls} placeholder="correo" value={email} onChange={(e) => setEmail(e.target.value)} />
          {mode === "login" && (
            <input type="password" className={cardInputCls} placeholder="contraseña" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
          )}
          {err && <p className="text-xs text-rose-600">{err}</p>}
          {mode === "login" ? (
            <>
              <button onClick={go} disabled={busy} className={primaryBtnCls}>{busy ? "Entrando…" : "Entrar"}</button>
              <button onClick={() => { setErr(""); setMode("forgot"); }} className={linkBtnCls}>¿Olvidaste tu contraseña?</button>
            </>
          ) : (
            <>
              <button onClick={sendReset} disabled={busy} className={primaryBtnCls}>{busy ? "Enviando…" : "Enviar enlace"}</button>
              <button onClick={() => { setErr(""); setMode("login"); }} className={linkBtnCls}>Volver a iniciar sesión</button>
            </>
          )}
        </div>
      )}
    </BrandCanvas>
  );
}

/* ============================================================
   Definir contraseña (invitación / reseteo) — se muestra cuando
   la sesión viene de un enlace de invitación o de recuperación,
   antes de dejar entrar a la app.
   ============================================================ */
export function SetPasswordGate({ onDone }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setErr("");
    if (pw.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres."); return; }
    if (pw !== pw2) { setErr("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try { await changeMyPassword(pw); onDone(); }
    catch (e) { setErr(e.message || "No se pudo guardar la contraseña."); }
    finally { setBusy(false); }
  };
  return (
    <BrandCanvas>
      <div className="mb-4 flex items-center justify-center gap-2 text-rtb-navy">
        <KeyRound size={16} className="text-rtb-gold" />
        <p className="text-xs">Define tu contraseña para entrar por primera vez</p>
      </div>
      <div className="space-y-3">
        <input type="password" className={cardInputCls} placeholder="Nueva contraseña" value={pw} onChange={(e) => setPw(e.target.value)} />
        <input type="password" className={cardInputCls} placeholder="Repite la contraseña" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
        {err && <p className="text-xs text-rose-600">{err}</p>}
        <button onClick={go} disabled={busy} className={primaryBtnCls}>{busy ? "Guardando…" : "Guardar y entrar"}</button>
      </div>
    </BrandCanvas>
  );
}
