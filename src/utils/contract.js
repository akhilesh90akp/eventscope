/**
 * contract — the numbers and lists behind an Event Services Agreement.
 *
 * Pure functions, no Firebase and no React: the Contract page collects the
 * inputs, this works out what goes on paper (functions, Annexure A lines,
 * price, advance, balance, due date, agreement number) and
 * components/ContractDocument.jsx draws it. Covered by tests/contract.test.mjs.
 */

// ============================================================
// IMPORTS
// ============================================================
import { getEventSections, buildLineEntries, computeSectionTotal, itemDays, lineAmount, parseDiscount } from './helpers.js';
import { DEFAULT_CONTRACT_TERMS } from '../constants/contract.js';

// ============================================================
// AGREEMENT NUMBER
// ============================================================

/** Financial-year tag, April–March: 13 Oct 2026 → "2627" */
const fyTag = (now) => {
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${String(y).slice(2)}${String(y + 1).slice(2)}`;
};

/**
 * Next free agreement number this financial year, one past the highest
 * already saved: "KC-AGR-2627-001", "KC-AGR-2627-002", …
 */
export function nextAgreementNo(prefix = 'INV', events = [], now = new Date()) {
  const stem = `${prefix}-AGR-${fyTag(now)}-`;
  const highest = events.reduce((max, e) => {
    const no = String(e?.contract?.agreementNo || '');
    if (!no.startsWith(stem)) return max;
    const n = parseInt(no.slice(stem.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return stem + String(highest + 1).padStart(3, '0');
}

// ============================================================
// DATES
// ============================================================

/** "2026-11-06" minus n days → "2026-11-05" (local calendar dates, no time zones) */
export function dateMinusDays(isoDate, n) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d - n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// ============================================================
// MAIN — everything the agreement needs
// ============================================================

/**
 * @param {object} event     the event (with quote prices)
 * @param {object} settings  company settings (contractTerms inside)
 * @param {object} form      what was typed on the Contract page:
 *   { amount?, advance, balanceDueDate? }
 * @returns {{ functions, price, advance, balance, balanceDueDate, firstDate, terms, hidePrices, showDays }}
 *   functions: [{ id, name, date, endDate, days, time, location, total, lines: [{ name, qty, days, amount|null, included }] }]
 *   showDays: some item runs more than one day (Annexure gets a Days column)
 */
export function buildContract(event, settings = {}, form = {}) {
  // company terms over the defaults — a blank box in Settings keeps the default
  const own = Object.fromEntries(Object.entries(settings.contractTerms || {}).filter(([, v]) => v !== '' && v != null));
  const terms = { ...DEFAULT_CONTRACT_TERMS, ...own };
  const { eventGroups } = getEventSections(event || {});
  const prices = event?.itemPrices || {};
  const bundles = event?.bundles || [];
  const hidePrices = !!event?.hidePrices;
  const finalAmounts = event?.finalAmounts || {};

  const functions = eventGroups.map((g) => {
    const total = computeSectionTotal(g.id, g.items, prices, bundles, hidePrices, finalAmounts);
    const lines = buildLineEntries(g.id, g.items, bundles).map((entry) => {
      if (entry.type === 'bundle') {
        const members = entry.bundle.itemKeys.filter(k => k.startsWith(`${g.id}::`)).map(k => k.slice(g.id.length + 2));
        return { name: `${entry.bundle.name}${members.length ? ` (${members.join(', ')})` : ''}`, qty: 1, amount: hidePrices ? null : Number(entry.bundle.amount) || 0, included: false };
      }
      const p = prices[entry.key] || prices[entry.name] || { qty: 1, rate: 0 };
      const amount = lineAmount(p);
      return { name: entry.name, qty: Number(p.qty) || 1, days: itemDays(p), amount: hidePrices ? null : amount, included: !hidePrices && amount === 0 };
    });
    return { id: g.id, name: g.name, date: g.date, endDate: g.endDate || g.date, days: g.days || 1, time: g.time || '', location: g.location, total, lines };
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const quoteTotal = functions.reduce((s, f) => s + f.total, 0);
  // the quote's discount comes off the default price (typing an amount overrides)
  const quoteDiscount = parseDiscount(event?.quoteDetails?.discount, quoteTotal).amount;
  const price = form.amount !== undefined && form.amount !== '' ? Math.max(0, Number(form.amount) || 0) : quoteTotal - quoteDiscount;
  const advance = Math.max(0, Number(form.advance) || 0);
  const firstDate = functions.find(f => f.date)?.date || '';
  const balanceDueDate = form.balanceDueDate || dateMinusDays(firstDate, Number(terms.balanceDaysBefore) || 0);

  return {
    functions,
    quoteTotal,
    quoteDiscount,
    price,
    advance,
    balance: Math.max(0, price - advance),
    balanceDueDate,
    firstDate,
    terms,
    hidePrices,
    showDays: functions.some(f => f.lines.some(l => l.days > 1)),
  };
}
