/**
 * Helpers — shared utility functions
 *
 * Small, mostly pure functions used across pages: formatting and parsing,
 * GST/rounding, IDs and links, event dates, quotation pricing, bill and
 * Job Log money math, and image resizing. No Firestore access here —
 * that lives only in context/AppContext.jsx.
 */

// ============================================================
// FORMATTING
// ============================================================

/**
 * Formats a number as Indian Rupee currency.
 * @param {number} amt - Amount to format
 * @returns {string} Formatted currency string (e.g., "₹1,234.56")
 */
export const formatCurrency = (amt) => {
  if (!amt && amt !== 0) return '₹0.00';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(amt);
};

/** Whole rupees for phone cards and totals: "₹2,26,250" (paise rounded away) */
export const formatRupees = (amt) => `₹${Math.round(Number(amt) || 0).toLocaleString('en-IN')}`;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sat, 12 Sep 2026" — the phone date fields (nobody misreads 09/12). '' for no / bad date. */
export const formatDateWithDay = (iso) => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * Formats a date in a human-readable format (e.g., "15 Jan 2025").
 * @param {string} d - ISO date string
 * @returns {string} Readable date or empty string
 */
export const formatDateReadable = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * Calculates the number of days until a given date.
 * @param {string} d - ISO date string for the target date
 * @returns {number|null} Days remaining (negative if past), or null if no date
 */
export const daysUntil = (d) => {
  if (!d) return null;
  const ev = new Date(d); ev.setHours(0,0,0,0);
  const now = new Date(); now.setHours(0,0,0,0);
  // 86400000 ms = 1 day
  return Math.ceil((ev - now) / 86400000);
};

/** Parses a typed/pasted money value ("₹1,48,000", "148000", "") → number or null */
export const parseMoney = (raw) => {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '—') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/**
 * A Job Log money cell: a plain number, or a quick sum like "12000+15000-500".
 * → { value, formula } — formula is the cleaned sum text when there was one
 *   (shown again when the cell is opened), otherwise null.
 * Blank → { value: null, formula: null }; not a number or sum → null.
 */
export const parseMoneyExpr = (raw) => {
  const text = String(raw ?? '').replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  if (text === '' || text === '-' || text === '—') return { value: null, formula: null };
  if (!/^[-+]?\d+(\.\d+)?([-+]\d+(\.\d+)?)*$/.test(text)) return null;
  const parts = text.match(/[-+]?\d+(\.\d+)?/g);
  const value = Math.round(parts.reduce((s, n) => s + Number(n), 0) * 100) / 100;
  return { value, formula: parts.length > 1 ? text.replace(/^\+/, '') : null };
};

/**
 * Checks what was typed in a Job Log money cell and says why when it is wrong.
 * Returns { ok: true, value, formula } or { ok: false, message }.
 */
export const validateMoneyInput = (raw) => {
  const parsed = parseMoneyExpr(raw);
  if (!parsed) return { ok: false, message: 'Numbers only, e.g. 12000 or 12000+3500' };
  if (parsed.value !== null && parsed.value < 0) return { ok: false, message: 'An amount can’t be negative' };
  if (parsed.value !== null && parsed.value > 100000000) return { ok: false, message: 'That’s a very large amount — check the zeros' };
  return { ok: true, ...parsed };
};

// ============================================================
// CALCULATIONS
// ============================================================

/**
 * Calculates GST breakdown (CGST/SGST or IGST for inter-state).
 * @param {number} subtotal - Base amount before tax
 * @param {number} rate - GST percentage (default 18)
 * @param {boolean} interState - If true, returns IGST instead of split CGST/SGST
 * @returns {object} Object with cgst, sgst, igst, tax, and total fields
 */
export const calcGST = (subtotal, rate = 18, interState = false) => {
  if (!rate) return { cgst: 0, sgst: 0, igst: 0, tax: 0, total: subtotal };
  const tax = (subtotal * rate) / 100;
  if (interState) return { cgst: 0, sgst: 0, igst: tax, tax, total: subtotal + tax };
  return { cgst: tax/2, sgst: tax/2, igst: 0, tax, total: subtotal + tax };
};

/**
 * A discount typed as an amount ("5000", "₹5,000") or a percentage ("10%")
 * → { amount, pct } against `base` (rounded to the rupee, never more than base).
 * Blank or invalid → { amount: 0, pct: null }.
 */
export const parseDiscount = (raw, base = 0) => {
  const text = String(raw ?? '').trim();
  if (!text) return { amount: 0, pct: null };
  const pctMatch = text.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pctMatch) {
    const pct = Math.min(100, Number(pctMatch[1]));
    return { amount: Math.round((Number(base) || 0) * pct / 100), pct };
  }
  const n = Number(text.replace(/[₹,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return { amount: 0, pct: null };
  return { amount: Math.min(Math.round(n), Math.max(0, Number(base) || 0)), pct: null };
};

/**
 * Rounds an amount to the nearest integer and returns the difference.
 * @param {number} amt - Amount to round
 * @returns {object} Object with rounded value and diff (rounding adjustment)
 */
export const roundOff = (amt) => {
  const r = Math.round(amt);
  return { rounded: r, diff: +(r - amt).toFixed(2) };
};

// ============================================================
// ID & LINK GENERATION
// ============================================================

/**
 * Generates a unique ID using timestamp + random string.
 * @returns {string} Unique identifier
 */
export const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

/** Invites are keyed by the invitee's Google email, lower-cased. */
export const inviteKey = (email) => (email || '').trim().toLowerCase();

/**
 * Generates a WhatsApp deep link for sending a message.
 * @param {string} phone - Phone number (auto-prefixes with 91 if needed)
 * @param {string} msg - Pre-filled message text
 * @returns {string} WhatsApp URL
 */
export const waLink = (phone, msg = '') => {
  const p = phone.replace(/\D/g, '');
  return `https://wa.me/${p.startsWith('91') ? p : '91'+p}?text=${encodeURIComponent(msg)}`;
};

/**
 * Generates a tel: link for phone calls.
 * @param {string} phone - Phone number
 * @returns {string} Telephone URL
 */
export const telLink = (phone) => `tel:+91${phone.replace(/\D/g, '')}`;

/** Opens the Job Log grid in a new browser tab (it loads the app full-screen at #/job-log) */
export const openJobLog = () => {
  window.open(`${import.meta.env.BASE_URL}#/job-log`, '_blank');
};

/**
 * Generates a formatted invoice number based on financial year.
 * Format: PREFIX-B2CYY(YY+1)-NNN (e.g., BB-B2C2526-001)
 * @param {string} prefix - Invoice prefix (default "BB")
 * @param {number} existingCount - Number of existing invoices for sequential numbering
 * @returns {string} Formatted invoice number
 */
export const genInvoiceNo = (prefix = 'INV', existingCount = 0, now = new Date()) => {
  // Financial year starts in April (month index 3)
  const fy1 = now.getMonth() >= 3 ? now.getFullYear().toString().slice(2) : (now.getFullYear()-1).toString().slice(2);
  const fy2 = (parseInt(fy1)+1).toString();
  return `${prefix}-B2C${fy1}${fy2}-${String(existingCount+1).padStart(3,'0')}`;
};

/**
 * Next free invoice number for this financial year: looks at every saved
 * bill (event.billDetails.invoiceNo) with the same prefix + year and goes one
 * past the highest, so numbers never repeat — even after a bill is deleted
 * or a number was typed by hand.
 */
export const nextInvoiceNo = (prefix = 'INV', events = [], now = new Date()) => {
  const sample = genInvoiceNo(prefix, 0, now);                 // e.g. BB-B2C2627-001
  const stem = sample.slice(0, sample.lastIndexOf('-') + 1);   // e.g. BB-B2C2627-
  const highest = events.reduce((max, e) => {
    const no = String(e?.billDetails?.invoiceNo || '');
    if (!no.startsWith(stem)) return max;
    const n = parseInt(no.slice(stem.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return genInvoiceNo(prefix, highest, now);
};

// ============================================================
// EVENT DATE HELPERS
// ============================================================

/** Longest function we accept (guards against a typo like 2062 for 2026) */
export const MAX_FUNCTION_DAYS = 31;

/**
 * Number of days a function runs: 1 for a single date; end − start + 1 when
 * it has an endDate after its date (multi-day). Old events have no endDate.
 */
export const functionDays = (fn) => {
  if (!fn?.date || !fn.endDate || fn.endDate <= fn.date) return 1;
  const [y1, m1, d1] = fn.date.split('-').map(Number);
  const [y2, m2, d2] = fn.endDate.split('-').map(Number);
  const n = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
  return Math.min(Math.max(n, 1), MAX_FUNCTION_DAYS);
};

/** What's wrong with a function's dates ('' when fine) — used by the forms' validation */
export function functionDatesProblem(fn, required = false) {
  if (!fn.date) return required ? 'Required' : '';
  if (!fn.multiDay) return '';
  if (!fn.endDate) return 'Choose the end date';
  if (fn.endDate <= fn.date) return 'End date must be after the start date';
  const [y1, m1, d1] = fn.date.split('-').map(Number);
  const [y2, m2, d2] = fn.endDate.split('-').map(Number);
  if ((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000 + 1 > MAX_FUNCTION_DAYS) return `At most ${MAX_FUNCTION_DAYS} days`;
  return '';
}

/**
 * The dates to save on the function. endDate is always written ('' for one
 * day): saves merge into the stored event, so leaving it out would keep an
 * old end date after switching back to a single day.
 */
export const functionDatesToSave = (fn) => ({ date: fn.date, endDate: fn.multiDay && functionDays(fn) > 1 ? fn.endDate : '' });

/** The function's last day ('YYYY-MM-DD'): endDate for multi-day, else its date */
export const functionEnd = (fn) => (functionDays(fn) > 1 ? fn.endDate : fn?.date || '');

/**
 * "7 Nov 2026" for one day; "7–8 Nov 2026", "30 Nov – 1 Dec 2026" or
 * "31 Dec 2026 – 1 Jan 2027" for a range.
 */
export const formatDateRange = (start, end) => {
  if (!start) return '';
  if (!end || end <= start) return formatDateReadable(start);
  const a = new Date(start), b = new Date(end);
  if (a.getFullYear() !== b.getFullYear()) return `${formatDateReadable(start)} – ${formatDateReadable(end)}`;
  if (a.getMonth() !== b.getMonth()) return `${a.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${formatDateReadable(end)}`;
  return `${a.getDate()}–${formatDateReadable(end)}`;
};

/** A function's dates for documents: "7 Nov 2026" or "7–8 Nov 2026 (2 days)" */
export const functionDateText = (fn) => {
  if (!fn?.date) return '';
  const n = functionDays(fn);
  return n > 1 ? `${formatDateRange(fn.date, fn.endDate)} (${n} days)` : formatDateReadable(fn.date);
};

/**
 * Gets all dates from an event (main + sub-events) with labels.
 * Returns array sorted by date ascending: [{ date, endDate, label, isPast }]
 * (a multi-day function is past only after its last day)
 * @param {object} ev - Event object
 * @returns {Array} Array of date objects with metadata
 */
export const getAllEventDates = (ev) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dates = [];

  if (ev.mainEvent?.date) {
    dates.push({
      date: ev.mainEvent.date,
      endDate: functionEnd(ev.mainEvent),
      label: ev.mainEvent.name || 'Main Event',
      isPast: new Date(functionEnd(ev.mainEvent)).setHours(0, 0, 0, 0) < now,
      isMain: true,
    });
  } else if (ev.date) {
    const d = new Date(ev.date);
    d.setHours(0, 0, 0, 0);
    dates.push({
      date: ev.date,
      label: ev.eventType || 'Event',
      isPast: d < now,
      isMain: true,
    });
  }

  if (ev.subEvents) {
    ev.subEvents.forEach(s => {
      if (s.date) {
        dates.push({
          date: s.date,
          endDate: functionEnd(s),
          label: s.name || 'Sub Event',
          isPast: new Date(functionEnd(s)).setHours(0, 0, 0, 0) < now,
          isMain: false,
        });
      }
    });
  }

  // Sort by date ascending
  dates.sort((a, b) => new Date(a.date) - new Date(b.date));
  return dates;
};

/**
 * Gets the "active" date for sorting — the next upcoming date (sub or main).
 * If all dates are past, returns the most recent (latest) past date.
 * @param {object} ev - Event object
 * @returns {string} The active date string for sorting
 */
export const getActiveDate = (ev) => {
  const dates = getAllEventDates(ev);
  if (dates.length === 0) return ev.createdAt || '';

  // Find first upcoming date (not past)
  const upcoming = dates.find(d => !d.isPast);
  if (upcoming) return upcoming.date;

  // All past — return the most recent one (last in sorted array)
  return dates[dates.length - 1].date;
};

/**
 * Days until the event's next function (0 while a multi-day function is
 * running, negative once everything is over). Used for the "3d" / "Today"
 * countdown chips.
 */
export const eventCountdown = (ev) => {
  const next = getAllEventDates(ev).find(d => !d.isPast);
  if (next) return Math.max(0, daysUntil(next.date));
  return daysUntil(getActiveDate(ev));
};

/** Every function of an event (main first), each marked past once its last day is over */
export function eventFunctions(ev) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isPast = (fn) => !!fn?.date && new Date(`${functionEnd(fn)}T00:00:00`) < today;
  if (!ev?.mainEvent) {
    const fn = { name: ev?.eventType || 'Event', date: ev?.date, location: ev?.eventLocation };
    return [{ fn, main: true, past: isPast(fn) }];
  }
  const main = { fn: { ...ev.mainEvent, name: ev.mainEvent.name || ev.eventType || 'Event' }, main: true, past: isPast(ev.mainEvent) };
  const subs = (ev.subEvents || []).map(s => ({ fn: { ...s, name: s.name || 'Sub event' }, main: false, past: isPast(s) }));
  return [main, ...subs].sort((a, b) => (a.fn.date || '9999').localeCompare(b.fn.date || '9999'));
}

/** Every venue used on these events, most used first: [{ name, count }] */
export function savedVenues(events = []) {
  const counts = new Map();
  const add = (v) => {
    const name = (v || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    const cur = counts.get(key);
    counts.set(key, { name: cur?.name || name, count: (cur?.count || 0) + 1 });
  };
  events.forEach(e => {
    add(e.mainEvent?.location || e.eventLocation);
    (e.subEvents || []).forEach(s => add(s.location));
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** { draft, confirmed, completed } — how many events each list holds (menu badges, page titles) */
export const countByStatus = (events = []) => events.reduce((acc, e) => {
  if (e && acc[e.status] !== undefined) acc[e.status]++;
  return acc;
}, { draft: 0, confirmed: 0, completed: 0 });

/**
 * Sorts events by active date: upcoming soonest first, then past most recent first.
 * Draft/Confirmed tabs: nearest upcoming date rises to the top (e.g. Sep 3
 * before Sep 4), with overdue events grouped afterward, most recently
 * overdue first. Completed tab is normally all-past dates, so this same
 * rule naturally shows "most recently completed" at the top there too.
 * @param {Array} events - Array of event objects
 * @returns {Array} Sorted events array
 */
export const sortByActiveDate = (events) => {
  const now = Date.now();
  return [...events].sort((a, b) => {
    const dateA = new Date(getActiveDate(a));
    const dateB = new Date(getActiveDate(b));
    const diffA = dateA - now;
    const diffB = dateB - now;
    // Both upcoming: soonest first
    if (diffA >= 0 && diffB >= 0) return diffA - diffB;
    // Both past: most recent first
    if (diffA < 0 && diffB < 0) return diffB - diffA;
    // One upcoming, one past: upcoming always ranks above past
    return diffA >= 0 ? -1 : 1;
  });
};

// ============================================================
// PRICING — BUNDLES & HIDE-PRICES MODE
//
// Shared by QuotationGenerator (editing) and BillGenerator (read-only
// rendering) so both always agree on how a section's items/bundles are
// grouped, ordered, and totaled.
// ============================================================

/** Days an item is charged for (old quotes have none → 1) */
export const itemDays = (p) => Math.max(1, Math.round(Number(p?.days)) || 1);

/** One item's amount: qty × rate × days */
export const lineAmount = (p) => (Number(p?.qty) || 0) * (Number(p?.rate) || 0) * itemDays(p);

/** True when any priced item runs more than one day (documents then show a Days column) */
export const usesDays = (itemPrices) => Object.values(itemPrices || {}).some(p => itemDays(p) > 1);

/**
 * Builds the ordered list of "line entries" for one section (main event
 * or a specific sub-event), given that section's item names in their
 * saved order and the event's bundles. A bundle occupies one entry at
 * the position of its first member's name in `itemNames` — subsequent
 * member names are absorbed into that same entry, not shown again.
 * @param {string} sectionId - 'main' or a sub-event's id
 * @param {string[]} itemNames - item names in this section, in saved order
 * @param {Array} bundles - event.bundles
 * @returns {Array} entries: { type: 'item', key, name } | { type: 'bundle', bundle }
 */
export const buildLineEntries = (sectionId, itemNames, bundles) => {
  const seen = new Set();
  const entries = [];
  (itemNames || []).forEach(name => {
    const key = `${sectionId}::${name}`;
    if (seen.has(key)) return;
    const bundle = (bundles || []).find(b => b.itemKeys.includes(key));
    if (bundle) {
      entries.push({ type: 'bundle', bundle });
      bundle.itemKeys.forEach(k => seen.add(k));
    } else {
      entries.push({ type: 'item', key, name });
      seen.add(key);
    }
  });
  return entries;
};

/**
 * Flattens a (possibly reordered) list of line entries back into a plain
 * item-name array — the shape actually persisted on mainEvent.items /
 * subEvent.items. Used after a drag-reorder, which reorders entries
 * (each bundle moving as one block), to get back the flat name order.
 * @param {Array} entries - as returned by buildLineEntries
 * @param {string} sectionId - 'main' or a sub-event's id, to strip from bundle keys
 * @returns {string[]} item names in the new order
 */
export const flattenLineEntries = (entries, sectionId) => {
  const names = [];
  entries.forEach(entry => {
    if (entry.type === 'item') {
      names.push(entry.name);
    } else {
      entry.bundle.itemKeys
        .filter(k => k.startsWith(`${sectionId}::`))
        .forEach(k => names.push(k.slice(sectionId.length + 2)));
    }
  });
  return names;
};

/**
 * Computes one section's total, respecting hide-prices mode (a single
 * manually-entered final amount replaces itemized pricing) and bundles
 * (contribute their own fixed amount rather than qty × rate × days per member).
 * @param {string} sectionId - 'main' or a sub-event's id
 * @param {string[]} itemNames - item names in this section
 * @param {Object} itemPrices - the event's itemPrices map ({qty, rate, days} per key)
 * @param {Array} bundles - event.bundles
 * @param {boolean} hidePrices - event.hidePrices
 * @param {Object} finalAmounts - event.finalAmounts ({ [sectionId]: number })
 * @returns {number}
 */
export const computeSectionTotal = (sectionId, itemNames, itemPrices, bundles, hidePrices, finalAmounts) => {
  if (hidePrices) return Number((finalAmounts || {})[sectionId]) || 0;
  const entries = buildLineEntries(sectionId, itemNames, bundles);
  return entries.reduce((sum, entry) => {
    if (entry.type === 'bundle') return sum + (Number(entry.bundle.amount) || 0);
    return sum + lineAmount((itemPrices || {})[entry.key] || { qty: 1, rate: 0 });
  }, 0);
};

/**
 * An event's sections as shown on the quotation, bill and contract: the main
 * event and each sub-event with its own date, venue and item names (old
 * single-list events become one section). Returns { allItems, eventGroups }.
 */
export const getEventSections = (event) => {
  if (event.mainEvent) {
    const mainItems = event.mainEvent.items || [];
    const subEvents = event.subEvents || [];
    const allItems = [...mainItems];
    subEvents.forEach(s => {
      (s.items || []).forEach(item => {
        if (!allItems.includes(item)) allItems.push(item);
      });
    });

    const eventGroups = [];
    if (mainItems.length > 0) {
      eventGroups.push({
        id: 'main',
        name: event.mainEvent.name || event.eventType || 'Main Event',
        date: event.mainEvent.date || '',
        endDate: functionEnd(event.mainEvent),
        days: functionDays(event.mainEvent),
        time: event.mainEvent.time || '',
        location: event.mainEvent.location || '',
        items: mainItems,
      });
    }
    subEvents.forEach(s => {
      if ((s.items || []).length > 0) {
        eventGroups.push({
          id: s.id || s.name,
          name: s.name || 'Sub Event',
          date: s.date || '',
          endDate: functionEnd(s),
          days: functionDays(s),
          time: s.time || '',
          location: s.location || '',
          items: s.items,
        });
      }
    });

    // If no groups but there are items (items added via quotation that aren't in mainEvent)
    if (eventGroups.length === 0 && allItems.length > 0) {
      eventGroups.push({
        id: 'main',
        name: event.mainEvent.name || event.eventType || 'Event',
        date: event.mainEvent.date || '',
        endDate: functionEnd(event.mainEvent),
        days: functionDays(event.mainEvent),
        location: event.mainEvent.location || '',
        items: allItems,
      });
    }

    return { allItems, eventGroups };
  }

  // Old format (flat items array)
  const items = event.items || [];
  const eventGroups = [{
    id: 'main',
    name: event.eventType || 'Event',
    date: event.date || '',
    location: event.eventLocation || '',
    items: items,
  }];
  return { allItems: items, eventGroups };
};

/** Number of items on an event (every function) */
export const eventItemCount = (ev) => getEventSections(ev).eventGroups.reduce((n, g) => n + (g.items || []).length, 0);

// ============================================================
// REVENUE & JOB LOG MATH
// ============================================================

/** Sum of item prices for an event (before discount and GST) */
const getEventSubtotal = (event) => {
  if (event?.totalAmount && Number(event.totalAmount) > 0) return Number(event.totalAmount);
  const prices = event?.itemPrices;
  if (!prices || typeof prices !== 'object') return 0;
  let total = 0;
  Object.values(prices).forEach(p => {
    if (p && typeof p === 'object' && (p.rate || p.qty)) {
      total += (Number(p.qty) || 1) * (Number(p.rate) || 0) * itemDays(p);
    }
  });
  if (total === 0 && event.mainEvent?.items) {
    const allItems = [...(event.mainEvent.items || [])];
    (event.subEvents || []).forEach(s => allItems.push(...(s.items || [])));
    allItems.forEach(item => {
      const p = prices[`main::${item}`] || prices[item] || {};
      total += (Number(p.qty) || 1) * (Number(p.rate) || 0) * itemDays(p);
    });
  }
  return total;
};

/**
 * Money summary for an event's bill, computed the same way the Bill page
 * does: subtotal − discount = revenue (excl. GST); GST on top; rounded bill
 * total; advance received; balance still due.
 * Revenue excludes GST on purpose — GST is collected for the government.
 */
export const getEventBill = (event) => {
  const bd = event?.billDetails || {};
  const subtotal = getEventSubtotal(event);
  // the bill's own discount once it's been set; until then, the quote's
  const discount = bd.discount !== undefined && bd.discount !== ''
    ? Number(bd.discount) || 0
    : parseDiscount(event?.quoteDetails?.discount, subtotal).amount;
  const revenue = Math.max(0, subtotal - discount);
  const gstOn = bd.gstEnabled !== undefined ? !!bd.gstEnabled : false;
  const gst = gstOn ? calcGST(revenue, Number(bd.gstRate) || 0, !!bd.interState).tax : 0;
  const billTotal = roundOff(revenue + gst).rounded;
  const advance = Number(bd.advance) || 0;
  return {
    subtotal, discount, revenue, gst, billTotal, advance,
    balance: Math.max(0, billTotal - advance),
    invoiceNo: bd.invoiceNo || '',
    hasBill: !!event?.billDetails,
  };
};

/** An event's revenue = bill subtotal − discount, excluding GST (see getEventBill) */
export const getEventRevenue = (event) => getEventBill(event).revenue;

/**
 * Totals for one event's Job Log row.
 * values: { [columnId]: number|null }, columns: active Job Log columns.
 * Returns { totalCost, income, profit, margin, hasAny }.
 * Blank cells count as 0; `hasAny` is false when nothing has been entered
 * yet, so the UI can show "pending" instead of a misleading profit.
 */
export const computeEventFinancials = (revenue, values = {}, columns = []) => {
  let totalCost = 0;
  let income = 0;
  let hasAny = false;
  columns.forEach(c => {
    if (c.type === 'text') return; // notes etc. — not money
    const v = values?.[c.id];
    if (v === null || v === undefined || v === '') return;
    hasAny = true;
    if (c.type === 'income') income += Number(v) || 0;
    else totalCost += Number(v) || 0;
  });
  const profit = revenue + income - totalCost;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : null;
  return { totalCost, income, profit, margin, hasAny };
};

// ============================================================
// IMAGES
// ============================================================

/**
 * Reads an image file and returns a resized data URL (max `maxWidth` px wide,
 * never upscaled). Logos/signatures are stored inside the tenant's settings
 * doc, which Firestore caps at 1 MB — shrinking on upload keeps a large photo
 * from making Settings un-savable. PNG/SVG stay PNG (keeps transparency);
 * everything else becomes JPEG.
 */
export const resizeImageFile = (file, maxWidth = 400) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read the image file.'));
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('That file does not look like an image.'));
    img.onload = () => {
      const scale = Math.min(1, maxWidth / (img.naturalWidth || maxWidth));
      const w = Math.max(1, Math.round((img.naturalWidth || maxWidth) * scale));
      const h = Math.max(1, Math.round((img.naturalHeight || maxWidth) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const keepAlpha = /png|svg|webp|gif/i.test(file.type);
      resolve(keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

/**
 * JSON with object keys sorted, so two copies of the same data compare equal
 * even when Firestore hands the keys back in a different order (used by the
 * quote's "saved / not saved yet" check).
 */
export const stableJson = (value) => JSON.stringify(value, (_k, v) => (
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((o, k) => { o[k] = v[k]; return o; }, {})
    : v
));

/** Card chip text for days until an event: "5 days" / "Today" / "Tomorrow" / "2 days ago" */
export const countdownText = (d) => (d < 0 ? `${Math.abs(d)} day${d === -1 ? '' : 's'} ago` : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `${d} days`);

/** Chip colours for countdownText: grey once past, red ≤ 3 days, amber ≤ 7, green otherwise */
export const countdownTone = (d) => (d < 0 ? 'bg-gray-100 text-gray-700' : d <= 3 ? 'bg-red-100 text-red-700' : d <= 7 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800');

// ============================================================
// ADD ITEMS SHEET (phone quotation)
// ============================================================

/** Every service name in the company's categories, once each, in list order */
export function serviceNames(categories) {
  const seen = new Set();
  const out = [];
  (categories || []).forEach(cat => (cat.items || []).forEach(n => { if (n && !seen.has(n)) { seen.add(n); out.push(n); } }));
  return out;
}

/** Services to suggest: those matching what is typed (2+ letters) or the first few, minus names already taken */
export function suggestServices(all, typed, taken, limit = 8) {
  const q = (typed || '').trim().toLowerCase();
  const takenSet = new Set(taken);
  return all.filter(n => !takenSet.has(n) && (q.length < 2 || n.toLowerCase().includes(q))).slice(0, limit);
}
