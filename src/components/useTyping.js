/**
 * useTyping — true while a text field has focus on a touch screen
 *
 * i.e. while the phone's on-screen keyboard is up. Layout hides the bottom
 * menu and ActionBar hides itself while typing: iPhone shrinks the visible
 * area for the keyboard, which would lift bottom-fixed bars up into the form.
 */

// ============================================================
// IMPORTS
// ============================================================
import { useEffect, useState } from 'react';

// ============================================================
// HELPERS
// ============================================================

/** Fields that bring up the on-screen keyboard (not checkboxes, buttons, pickers) */
const NO_KEYBOARD = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);
const opensKeyboard = (el) => !!el && (
  el.isContentEditable
  || el.tagName === 'TEXTAREA'
  || (el.tagName === 'INPUT' && !NO_KEYBOARD.has((el.type || 'text').toLowerCase()) && !el.readOnly && !el.disabled)
);

// ============================================================
// HOOK
// ============================================================

export function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return undefined;
    const update = () => setTyping(opensKeyboard(document.activeElement));
    // focusout fires before the next field gets focus — check after it settles
    const onOut = () => setTimeout(update, 50);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', onOut);
    return () => { document.removeEventListener('focusin', update); document.removeEventListener('focusout', onOut); };
  }, []);
  return typing;
}
