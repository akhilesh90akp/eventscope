/**
 * Helpers - Utility functions
 *
 * Pure utility functions used across the application for formatting,
 * calculations, link generation, and ID creation.
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

/**
 * Formats a date string as DD-MM-YY.
 * @param {string} d - ISO date string
 * @returns {string} Formatted date or empty string
 */
export const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getFullYear()).slice(2)}`;
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

/**
 * Generates a formatted invoice number based on financial year.
 * Format: PREFIX-B2CYY(YY+1)-NNN (e.g., BB-B2C2526-001)
 * @param {string} prefix - Invoice prefix (default "BB")
 * @param {number} existingCount - Number of existing invoices for sequential numbering
 * @returns {string} Formatted invoice number
 */
export const genInvoiceNo = (prefix = 'BB', existingCount = 0) => {
  const now = new Date();
  // Financial year starts in April (month index 3)
  const fy1 = now.getMonth() >= 3 ? now.getFullYear().toString().slice(2) : (now.getFullYear()-1).toString().slice(2);
  const fy2 = (parseInt(fy1)+1).toString();
  return `${prefix}-B2C${fy1}${fy2}-${String(existingCount+1).padStart(3,'0')}`;
};

// ============================================================
// EVENT DATE HELPERS
// ============================================================

/**
 * Gets all dates from an event (main + sub-events) with labels.
 * Returns array sorted by date ascending: [{ date, label, isPast }]
 * @param {object} ev - Event object
 * @returns {Array} Array of date objects with metadata
 */
export const getAllEventDates = (ev) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dates = [];

  if (ev.mainEvent?.date) {
    const d = new Date(ev.mainEvent.date);
    d.setHours(0, 0, 0, 0);
    dates.push({
      date: ev.mainEvent.date,
      label: ev.mainEvent.name || 'Main Event',
      isPast: d < now,
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
        const d = new Date(s.date);
        d.setHours(0, 0, 0, 0);
        dates.push({
          date: s.date,
          label: s.name || 'Sub Event',
          isPast: d < now,
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
 * (contribute their own fixed amount rather than qty * rate per member).
 * @param {string} sectionId - 'main' or a sub-event's id
 * @param {string[]} itemNames - item names in this section
 * @param {Object} itemPrices - the event's itemPrices map ({qty, rate} per key)
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
    const p = (itemPrices || {})[entry.key] || { qty: 1, rate: 0 };
    return sum + (Number(p.qty) || 0) * (Number(p.rate) || 0);
  }, 0);
};

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
      total += (Number(p.qty) || 1) * (Number(p.rate) || 0);
    }
  });
  if (total === 0 && event.mainEvent?.items) {
    const allItems = [...(event.mainEvent.items || [])];
    (event.subEvents || []).forEach(s => allItems.push(...(s.items || [])));
    allItems.forEach(item => {
      const p = prices[`main::${item}`] || prices[item] || {};
      total += (Number(p.qty) || 1) * (Number(p.rate) || 0);
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
  const discount = Number(bd.discount) || 0;
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

/** Parses a typed/pasted money value ("₹1,48,000", "148000", "") → number or null */
export const parseMoney = (raw) => {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '—') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

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

/** Opens the Job Log grid in a new browser tab (it loads the app full-screen at #/job-log) */
export const openJobLog = () => {
  window.open(`${import.meta.env.BASE_URL}#/job-log`, '_blank');
};

/** Invites are keyed by the invitee's Google email, lower-cased. */
export const inviteKey = (email) => (email || '').trim().toLowerCase();
