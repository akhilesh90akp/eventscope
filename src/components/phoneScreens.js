/**
 * phoneScreens — which screens are "main" or "task" on phones, and the hooks
 * pages use to add a sub-line or buttons to the phone title bar
 *
 * PHONE_SCREENS maps each route to its title and kind; Layout reads it and
 * PhoneHeader (components/PhoneHeader.jsx) draws the bar. Task screens hide
 * the bottom menu. No UI here.
 */

// ============================================================
// IMPORTS
// ============================================================
import { createContext, useContext, useLayoutEffect } from 'react';

// ============================================================
// CONSTANTS
// ============================================================

/** Title and kind of each route on phones. First match wins. */
export const PHONE_SCREENS = [
  { match: /^\/$/, title: '', logo: true },
  { match: /^\/new/, title: 'New event', task: true, back: '/' },
  { match: /^\/edit\//, title: 'Edit event', task: true, back: '/drafts' },
  { match: /^\/quotation\//, title: 'Quotation', task: true, back: '/confirmed' },
  { match: /^\/bill\//, title: 'Invoice', task: true, back: '/confirmed' },
  { match: /^\/contract\//, title: 'Contract', task: true, back: '/confirmed' },
  { match: /^\/job\//, title: 'Job Log', task: true, back: '/completed' },
  { match: /^\/calendar/, title: 'Calendar' },
  { match: /^\/drafts/, title: 'Drafts' },
  { match: /^\/confirmed/, title: 'Confirmed' },
  { match: /^\/completed/, title: 'Completed' },
  { match: /^\/reports/, title: 'Reports' },
  { match: /^\/purchases/, title: 'Purchases' },
  { match: /^\/billing/, title: 'Plan & billing' },
  { match: /^\/settings\/.+/, title: 'Settings', task: true, back: '/settings' },
  { match: /^\/settings/, title: 'Settings' },
  { match: /^\/admin/, title: 'Admin' },
];

export const phoneScreenFor = (path) => PHONE_SCREENS.find(s => s.match.test(path)) || { title: '' };

// ============================================================
// CONTEXT
// ============================================================

export const PhoneHeaderContext = createContext({ extra: null, setExtra: () => {} });

/**
 * Page hook: add a sub-line, a different title or right-hand buttons.
 *   usePhoneHeader({ sub: 'Rohan & Diya · Reception', right: <…/> }, [deps])
 * `deps` decide when the bar updates (the `right` node is not compared).
 */
export function usePhoneHeader(opts, deps = []) {
  const { setExtra } = useContext(PhoneHeaderContext);
  useLayoutEffect(() => {
    setExtra(opts);
    return () => setExtra(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export const usePhoneHeaderExtra = () => useContext(PhoneHeaderContext).extra;

