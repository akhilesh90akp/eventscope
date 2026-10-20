/**
 * useIsPhone — true below 1024px (phones and tablets), where the phone design
 * is used; false on laptops, which keep their own layouts.
 *
 * Pages render one layout or the other (never both hidden in the page), so a
 * screen has a single set of buttons and fields. Follows window resizes.
 */

// ============================================================
// IMPORTS
// ============================================================
import { useEffect, useState } from 'react';

// ============================================================
// CONSTANTS
// ============================================================
export const PHONE_QUERY = '(max-width: 1023.98px)';

// ============================================================
// HOOK
// ============================================================

export function useIsPhone() {
  const get = () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches;
  const [phone, setPhone] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}
