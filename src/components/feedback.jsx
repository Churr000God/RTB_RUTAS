// =====================================================================
// src/components/feedback.jsx
// Toasts + diálogo de confirmación propios, para reemplazar los
// alert()/confirm() nativos del navegador (§2.2 del documento de
// mejoras transversales — rompen el estilo y se ven toscos en el
// teléfono). Un solo <FeedbackProvider> en la raíz monta ambos; se
// consumen con los hooks useToast()/useConfirm() desde cualquier tab.
// =====================================================================
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

/* ------------------------------ Toasts ------------------------------ */
const ToastContext = createContext(null);

const TOAST_META = {
  success: { icon: CheckCircle2, cls: "border-rtb-teal-200 bg-rtb-teal-50 text-rtb-teal-800" },
  error:   { icon: AlertTriangle, cls: "border-rose-300 bg-rose-50 text-rose-800" },
  warn:    { icon: AlertTriangle, cls: "border-orange-300 bg-orange-50 text-orange-800" },
  info:    { icon: Info,          cls: "border-rtb-teal-100 bg-white text-rtb-navy" },
};

/** Hook para disparar avisos efímeros: toast("Guardado", { type: "success" }). */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <FeedbackProvider>");
  return ctx;
}

function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:top-4">
      {toasts.map((t) => {
        const meta = TOAST_META[t.type] || TOAST_META.info;
        const Icon = meta.icon;
        return (
          <div key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg backdrop-blur ${meta.cls}`}>
            <Icon size={16} className="mt-0.5 shrink-0" />
            <p className="flex-1">{t.message}</p>
            <button onClick={() => onDismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------- ConfirmDialog --------------------------- */
const ConfirmContext = createContext(null);

/** Hook que devuelve confirm(opts) => Promise<boolean>, para reemplazar
 * `if (!confirm("...")) return;` por `if (!(await confirm({ message: "..." }))) return;` */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <FeedbackProvider>");
  return ctx;
}

function ConfirmModal({ state, onResolve }) {
  if (!state) return null;
  const { title, message, confirmLabel = "Confirmar", cancelLabel = "Cancelar", danger = false } = state;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-rtb-navy/40 px-4 backdrop-blur-sm" onClick={() => onResolve(false)}>
      <div className="w-full max-w-sm rounded-xl border border-rtb-teal-100 bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {title && <h3 className="mb-1.5 font-display text-sm font-semibold text-rtb-navy">{title}</h3>}
        <p className="mb-4 whitespace-pre-line text-sm text-rtb-navy-mid">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => onResolve(false)}
            className="rounded-lg border border-rtb-navy/15 bg-white px-3 py-2 text-sm text-rtb-navy transition hover:bg-rtb-surface">
            {cancelLabel}
          </button>
          <button onClick={() => onResolve(true)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold text-white transition ${
              danger ? "bg-rose-600 hover:bg-rose-500" : "bg-rtb-teal hover:bg-rtb-navy"
            }`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Provider ----------------------------- */
export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const dismiss = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const toast = useCallback((message, { type = "info", duration = 3500 } = {}) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration) setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const [confirmState, setConfirmState] = useState(null);
  const resolveRef = useRef(null);
  const confirm = useCallback((opts) => {
    const message = typeof opts === "string" ? opts : opts.message;
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setConfirmState({ ...(typeof opts === "string" ? {} : opts), message });
    });
  }, []);
  const onResolve = useCallback((ok) => {
    setConfirmState(null);
    resolveRef.current?.(ok);
    resolveRef.current = null;
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <ToastStack toasts={toasts} onDismiss={dismiss} />
        <ConfirmModal state={confirmState} onResolve={onResolve} />
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
