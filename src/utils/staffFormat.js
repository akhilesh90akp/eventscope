/**
 * staffFormat — small text helpers for Day sheets and Staff & wages
 * (rupees, month names, short dates, initials). Pure.
 */
import { formatDateWithDay } from './helpers.js';

// ============================================================
// FORMATTING
// ============================================================

export const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** '2026-11' → 'November 2026' */
export const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTH_NAMES[m - 1]} ${y}`; };
/** '2026-11' ± n months */
export const addMonths = (ym, n) => {
  let [y, m] = ym.split('-').map(Number);
  m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
};
/** 'Sat, 14 Nov' (no year) */
export const shortDay = (iso) => formatDateWithDay(iso).replace(/ \d{4}$/, '');
/** '14 Nov' */
export const dayMonth = (iso) => shortDay(iso).replace(/^\w+, /, '');
/** 'BK' from 'Biju K' */
export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
/** Whole rupees typed with commas → number (blank → '') */
export const parseRupees = (v) => { const s = String(v ?? '').replace(/[^\d]/g, ''); return s === '' ? '' : Number(s); };

/** "Monthly · ₹30,000 · OT ₹100/h" (office: "Office · Accountant · Monthly · ₹18,000") */
export const staffLine = (p) => [
  p.worksIn === 'office' ? ['Office', p.role].filter(Boolean).join(' · ') : null,
  `${p.pay === 'monthly' ? 'Monthly' : 'Daily'} · ${rupees(p.amount)}`,
  p.worksIn !== 'office' && p.ot?.rate ? `OT ${rupees(p.ot.rate)}${p.ot.mode === 'night' ? ' late night' : '/h'}` : null,
].filter(Boolean).join(' · ');
