/**
 * staffCosts — Day sheet and Staff & wages money rules (pure, no Firestore)
 *
 * Every rupee is counted once and in whole rupees:
 *   - A monthly salary is spread over the days of THAT month (÷ days in the
 *     month). Leftover rupees go to the first days, so a month always adds up
 *     to exactly the salary (Dec: 30,000 = 968 × 6 days + 967 × 25 days).
 *   - Monthly staff are counted every day, filled in or not. Leave doesn't cut
 *     pay (no leave rules yet). Daily-wage staff count only on days they're ticked.
 *   - A day's total = event-day costs (events team at events + shared costs) +
 *     running cost (warehouse, leave, days with no events, days not filled).
 *   - Event-day costs are split EQUALLY across that day's events; leftover
 *     rupees go to the first events. Per Job Log column the same rounding is
 *     used, and the last column takes the difference, so each event's share and
 *     each column's total both match the day exactly.
 *   - Office staff are never part of a day: their pay is "office salaries".
 *
 * Data shapes (see AppContext for where they're stored):
 *   person  { id, name, pay: 'monthly'|'daily', amount, worksIn: 'events'|'office',
 *             ot: { mode: 'hour'|'night', rate }, payCycle: 'daily'|'weekly'|'monthly',
 *             startDate?, endDate? }
 *   sheet   { date, staff: { [id]: { where: 'events'|'warehouse'|'leave', otHours } },
 *             costs: [{ id, label, amount, column }], notes, tasks }
 *   payment { id, staffId, date, type: 'early'|'advance'|'bonus'|'pay', amount,
 *             advanceBack?, recoverPerPay?, method?, note?, forMonth? ('YYYY-MM' a pay is for),
 *             daySheet? (date of a "Paid today" tick) }
 */

// ============================================================
// ROUNDING & DATES
// ============================================================

/** Splits a whole-rupee total into n whole-rupee parts; leftover rupees go to the first parts */
export const splitRupees = (total, n) => {
  if (!n) return [];
  const t = Math.round(Number(total) || 0);
  const base = Math.floor(t / n);
  const rest = t - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
};

/** Days in the month of a 'YYYY-MM-DD' date (or year, month 1–12) */
export const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
const parts = (date) => { const [y, m, d] = String(date).split('-').map(Number); return { y, m, d }; };
/** 'YYYY-MM' of a date */
export const monthOf = (date) => String(date).slice(0, 7);
/** Every date of a month, 'YYYY-MM-01' … */
export const datesOfMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return Array.from({ length: daysInMonth(y, m) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
};

/** Is the person on the books that day (start/end dates are optional) */
export const isActiveOn = (p, date) => (!p.startDate || date >= p.startDate) && (!p.endDate || date <= p.endDate);

// ============================================================
// ONE PERSON, ONE DAY
// ============================================================

/** A monthly person's pay for one day: salary ÷ days in that month, leftover rupees on the first days */
export const monthlyDayCost = (salary, date) => {
  const { y, m, d } = parts(date);
  const n = daysInMonth(y, m);
  const s = Math.round(Number(salary) || 0);
  const base = Math.floor(s / n);
  return base + (d <= s - base * n ? 1 : 0);
};

/** Pay for one day before overtime (monthly: share of salary; daily: the wage) */
export const dayPay = (p, date) => (p.pay === 'monthly' ? monthlyDayCost(p.amount, date) : Math.round(Number(p.amount) || 0));

/** Overtime for one day: hours × rate, or the fixed late-night amount when any overtime is entered */
export const overtimePay = (p, otHours) => {
  const h = Number(otHours) || 0;
  if (h <= 0 || !p.ot) return 0;
  const rate = Math.round(Number(p.ot.rate) || 0);
  return p.ot.mode === 'night' ? rate : Math.round(h * rate);
};

// ============================================================
// ONE DAY
// ============================================================

/**
 * Works out a day: who counts, what it cost, and each event's share per Job Log column.
 *   staff: array of people · sheet: the day's sheet or null (not filled) · eventIds: events that day
 *   staffColumn: the Job Log column staff cost goes to (default 'labour')
 *   columnOrder: Job Log column ids in order; the last column used takes the rounding
 * → { filled, rows: [{ id, name, where, pay, ot, total }], staffAtEvents, running, shared,
 *     eventDay, total, each: [per event], shares: { [eventId]: { [column]: amount } } }
 */
const DEFAULT_ORDER = ['labour', 'rental', 'material', 'transport', 'vendors', 'commPaid', 'other'];
export const computeDay = ({ date, staff = [], sheet = null, eventIds = [], staffColumn = 'labour', columnOrder = DEFAULT_ORDER }) => {
  const filled = !!sheet;
  const hasEvents = eventIds.length > 0;
  const rows = [];
  staff.filter(p => p.worksIn !== 'office' && isActiveOn(p, date)).forEach(p => {
    const entry = sheet?.staff?.[p.id];
    if (p.pay === 'daily' && !entry) return; // daily wage only when ticked
    if (p.pay === 'daily' && entry.where === 'leave') return; // not working, not paid
    let where = entry?.where || (filled && hasEvents ? 'events' : 'warehouse');
    if (!hasEvents && where === 'events') where = 'warehouse';
    if (!filled) where = 'notfilled';
    const pay = dayPay(p, date);
    const ot = where === 'leave' || where === 'notfilled' ? 0 : overtimePay(p, entry?.otHours);
    rows.push({ id: p.id, name: p.name, where, pay, ot, total: pay + ot });
  });
  const costs = (sheet?.costs || []).filter(c => Math.round(Number(c.amount) || 0) > 0);
  const shared = costs.reduce((t, c) => t + Math.round(Number(c.amount) || 0), 0);
  const staffAtEvents = rows.filter(r => r.where === 'events').reduce((t, r) => t + r.total, 0);
  const staffRunning = rows.filter(r => r.where !== 'events').reduce((t, r) => t + r.total, 0);
  const eventDay = hasEvents && filled ? staffAtEvents + shared : 0;
  const running = staffRunning + (hasEvents && filled ? 0 : shared);
  const n = eventIds.length;
  const each = eventDay ? splitRupees(eventDay, n) : eventIds.map(() => 0);
  // column totals (staff first, then cost columns in the order they appear)
  const colTotals = new Map();
  if (eventDay) {
    colTotals.set(staffColumn, staffAtEvents);
    costs.forEach(c => { const col = c.column || 'other'; colTotals.set(col, (colTotals.get(col) || 0) + Math.round(Number(c.amount) || 0)); });
  }
  // Job Log column order decides which column absorbs the rounding (the last one)
  const rank = (k) => { const i = columnOrder.indexOf(k); return i < 0 ? 999 : i; };
  const cols = [...colTotals.keys()].filter(k => colTotals.get(k) !== 0).sort((a, b) => rank(a) - rank(b));
  const shares = {};
  eventIds.forEach(id => { shares[id] = {}; });
  if (eventDay && cols.length) {
    const last = cols[cols.length - 1];
    // each column's spare rupees continue where the previous column's stopped, so no
    // event collects them all and the last column never goes below zero
    let start = 0;
    cols.slice(0, -1).forEach(col => {
      const total = colTotals.get(col);
      const base = Math.floor(total / n);
      const rest = total - base * n;
      eventIds.forEach((id, i) => { shares[id][col] = base + (((i - start + n) % n) < rest ? 1 : 0); });
      start = (start + rest) % n;
    });
    eventIds.forEach((id, i) => { const others = Object.values(shares[id]).reduce((t, v) => t + v, 0); shares[id][last] = each[i] - others; });
  }
  return { date, filled, rows, staffAtEvents, running, shared, eventDay, total: eventDay + running, each, shares };
};

// ============================================================
// ONE PERSON, ONE MONTH
// ============================================================

/**
 * A person's month: earned (from the days), overtime, bonuses, what was paid and what is left.
 *   sheets: { [date]: sheet } for that month (missing = not filled) · payments: this person's payments
 * → { days, leave, earned, ot, bonus, paidEarly, paid, advanceBack, advanceOwed, plannedBack, toPay }
 *   toPay = earned + ot − paid early − paid − advance taken back (bonuses are paid on the spot)
 */
export const staffMonth = (p, month, sheets = {}, payments = [], from = '') => {
  let earned = 0, ot = 0, days = 0, leave = 0;
  datesOfMonth(month).forEach(date => {
    if (!isActiveOn(p, date) || (from && date < from)) return;
    const entry = sheets[date]?.staff?.[p.id];
    if (p.pay === 'monthly') {
      earned += monthlyDayCost(p.amount, date);
      if (entry?.where === 'leave') leave++; else days++;
      if (entry && entry.where !== 'leave' && sheets[date]) ot += overtimePay(p, entry.otHours);
    } else if (entry && entry.where !== 'leave') {
      earned += dayPay(p, date); days++;
      ot += overtimePay(p, entry.otHours);
    }
  });
  // payments count in the month they're for (forMonth), so a December salary paid on 30 Nov still counts
  const counts = (x) => !from || (x.forMonth ? x.forMonth >= monthOf(from) : x.date >= from);
  const mine = payments.filter(x => x.staffId === p.id && counts(x));
  const inMonth = mine.filter(x => (x.forMonth || monthOf(x.date)) === month);   // a pay made on 2 Dec for November counts in November
  const sum = (arr, k = 'amount') => arr.reduce((t, x) => t + Math.round(Number(x[k]) || 0), 0);
  const paidEarly = sum(inMonth.filter(x => x.type === 'early'));
  const paid = sum(inMonth.filter(x => x.type === 'pay'));
  const bonus = sum(inMonth.filter(x => x.type === 'bonus'));
  const advanceBack = sum(inMonth.filter(x => x.type === 'pay'), 'advanceBack');
  const advanceOwed = advanceStatus(p.id, payments).owed;
  const plannedBack = Math.min(advanceOwed, advanceStatus(p.id, payments).recoverPerPay || advanceOwed);
  const toPay = earned + ot - paidEarly - paid - advanceBack;
  return { days, leave, earned, ot, bonus, paidEarly, paid, advanceBack, advanceOwed, plannedBack, toPay };
};

/**
 * What's left from earlier months (paid less → positive, paid more → negative),
 * counting from the Day sheets start date. → rupees
 */
export const carriedIn = (p, month, sheets = {}, payments = [], from = '') => {
  if (!from || monthOf(from) >= month) return 0;
  let total = 0;
  let [y, m] = monthOf(from).split('-').map(Number);
  for (;;) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    if (ym >= month) break;
    total += staffMonth(p, ym, sheets, payments, from).toPay;
    m++; if (m > 12) { m = 1; y++; }
  }
  return total;
};

/** Advances given minus what has been taken back, for one person (all time) */
export const advanceStatus = (staffId, payments = []) => {
  const mine = payments.filter(x => x.staffId === staffId);
  const given = mine.filter(x => x.type === 'advance');
  const total = given.reduce((t, x) => t + Math.round(Number(x.amount) || 0), 0);
  const back = mine.filter(x => x.type === 'pay').reduce((t, x) => t + Math.round(Number(x.advanceBack) || 0), 0);
  const latest = given.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  return { total, back, owed: Math.max(0, total - back), recoverPerPay: Math.round(Number(latest?.recoverPerPay) || 0) };
};

// ============================================================
// ONE MONTH, WHOLE COMPANY
// ============================================================

/**
 * The month's day costs for the company.
 *   eventsByDate: { [date]: [eventIds] } (completed or confirmed events with a function that day)
 *   upTo: last date to count (e.g. today) — later days are left out
 * → { days: [computeDay…], total, eventDay, running, office, shares: { [eventId]: { [col]: amt } } }
 */
export const computeMonth = ({ month, staff = [], sheets = {}, eventsByDate = {}, upTo, staffColumn, columnOrder, from }) => {
  const days = [];
  const shares = {};
  let office = 0;
  datesOfMonth(month).forEach(date => {
    if (upTo && date > upTo) return;
    if (from && date < from) return;
    const d = computeDay({ date, staff, sheet: sheets[date] || null, eventIds: eventsByDate[date] || [], staffColumn, columnOrder });
    days.push(d);
    Object.entries(d.shares).forEach(([id, cols]) => {
      shares[id] = shares[id] || {};
      Object.entries(cols).forEach(([c, v]) => { shares[id][c] = (shares[id][c] || 0) + v; });
    });
    staff.filter(p => p.worksIn === 'office' && p.pay === 'monthly' && isActiveOn(p, date)).forEach(p => { office += dayPay(p, date); });
  });
  const sum = (k) => days.reduce((t, d) => t + d[k], 0);
  return { days, total: sum('total'), eventDay: sum('eventDay'), running: sum('running'), office, shares };
};
