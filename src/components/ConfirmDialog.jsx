/**
 * ConfirmDialog — the app's own "Are you sure?" pop-up, used instead of the
 * browser's plain OK/Cancel box everywhere.
 *
 * Wrap the app in <ConfirmProvider>, then in any component:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Delete this event?', message: …, confirmLabel: 'Delete', tone: 'danger' }))) return;
 *
 * tone 'danger' (red button, bin icon) is for anything that deletes or removes;
 * 'warning' (amber icon, purple button) for "are you sure" checks; default is
 * a plain purple confirm; 'lock' (padlock) for "your plan has ended".
 * Pass cancelLabel: null for a single-button notice. Esc / tapping outside / Cancel all answer "no".
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Trash2, AlertTriangle, HelpCircle, LogOut, Lock } from 'lucide-react';

// ============================================================
// CONSTANTS
// ============================================================
const TONES = {
  danger: { icon: Trash2, iconBox: 'bg-red-100 text-red-600', button: 'bg-red-600 hover:bg-red-700 text-white', note: 'bg-red-50 border-red-200 text-red-800' },
  warning: { icon: AlertTriangle, iconBox: 'bg-amber-100 text-amber-600', button: 'bg-bb-accent hover:bg-bb-accent-hover text-white', note: 'bg-gray-50 border-bb-border text-bb-text' },
  logout: { icon: LogOut, iconBox: 'bg-violet-100 text-violet-700', button: 'bg-bb-accent hover:bg-bb-accent-hover text-white', note: 'bg-gray-50 border-bb-border text-bb-text' },
  lock: { icon: Lock, iconBox: 'bg-amber-100 text-amber-600', button: 'bg-bb-accent hover:bg-bb-accent-hover text-white', note: 'bg-gray-50 border-bb-border text-bb-text' },
  primary: { icon: HelpCircle, iconBox: 'bg-violet-100 text-violet-700', button: 'bg-bb-accent hover:bg-bb-accent-hover text-white', note: 'bg-gray-50 border-bb-border text-bb-text' },
};

const ConfirmContext = createContext(null);

// ============================================================
// HOOK
// ============================================================

/** confirm(options) → Promise<boolean>. Falls back to the browser box if no provider is mounted. */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  return ctx || (async ({ title, message }) => window.confirm([title, typeof message === 'string' ? message : ''].filter(Boolean).join('\n\n')));
}

// ============================================================
// ConfirmProvider — MAIN COMPONENT
// ============================================================

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);     // { title, message, note, confirmLabel, cancelLabel, tone, resolve }
  const confirmBtn = useRef(null);

  const confirm = useCallback((opts) => new Promise(resolve => setReq({ ...opts, resolve })), []);

  const answer = (yes) => {
    req?.resolve(yes);
    setReq(null);
  };

  // Esc = Cancel; focus the main button so Enter confirms
  useEffect(() => {
    if (!req) return undefined;
    confirmBtn.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') answer(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  const tone = TONES[req?.tone] || TONES.primary;
  const Icon = tone.icon;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" data-testid="confirm-dialog">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => answer(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-3 ${tone.iconBox}`}>
              <Icon size={22} />
            </div>
            <h2 id="confirm-title" className="text-lg font-bold text-bb-text mb-1.5">{req.title}</h2>
            {req.message && <div className="text-sm text-bb-muted leading-relaxed">{req.message}</div>}
            {req.note && <div className={`mt-3 text-[13px] border rounded-xl px-3 py-2 ${tone.note}`}>{req.note}</div>}
            <div className="flex gap-2.5 mt-5">
              {req.cancelLabel !== null && (
                <button onClick={() => answer(false)} className="flex-1 py-2.5 rounded-xl border border-bb-border bg-white text-bb-text font-semibold text-sm cursor-pointer hover:bg-gray-50">
                  {req.cancelLabel || 'Cancel'}
                </button>
              )}
              <button ref={confirmBtn} onClick={() => answer(true)} className={`flex-1 py-2.5 rounded-xl font-semibold text-sm cursor-pointer ${tone.button}`}>
                {req.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
