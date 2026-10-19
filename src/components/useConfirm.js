/**
 * useConfirm — ask "Are you sure?" with the app's own pop-up.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title, message, note, confirmLabel, cancelLabel, tone }))) return;
 *
 * The pop-up itself is drawn by <ConfirmProvider> (ConfirmDialog.jsx), which
 * wraps the app in main.jsx. Kept in its own file so ConfirmDialog.jsx only
 * exports components (fast refresh).
 */

// ============================================================
// IMPORTS
// ============================================================
import { createContext, useContext } from 'react';

// ============================================================
// CONTEXT
// ============================================================
export const ConfirmContext = createContext(null);

// ============================================================
// HOOK
// ============================================================

/** confirm(options) → Promise<boolean>. Falls back to the browser box if no provider is mounted. */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  return ctx || (async ({ title, message }) => window.confirm([title, typeof message === 'string' ? message : ''].filter(Boolean).join('\n\n')));
}
