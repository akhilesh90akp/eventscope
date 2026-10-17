/**
 * billing — plans, prices, the free pilot and "access until" dates.
 *
 * Pure functions, no Firebase and no React. One rule drives everything:
 * each company has an `accessUntil` date (the last day of its pilot, or of
 * the period it paid for). After it come GRACE_DAYS days to pay; then the
 * app turns read-only automatically. firestore.rules enforces the same
 * moment through `blockAfterMs` (written alongside accessUntil), so it
 * works even if nobody opens the app. A pending "I've paid" claim
 * (tenants/{id}/payments/pending) keeps the company working meanwhile.
 *
 * Tenant fields used here:
 *   plan ('trial'|'basic'|'standard'|'premium'), cycle ('monthly'|'yearly'),
 *   pilotStart, pilotLength, pilotUnit ('days'|'months'), pilotExtended,
 *   accessUntil ('YYYY-MM-DD'), autoSuspend (bool), blockAfterMs (number|null),
 *   status ('active'|'suspended'), suspendedAt, suspendNote, reactivatedAt
 *
 * Covered by tests/billing.test.mjs.
 */

// ============================================================
// CONSTANTS — PLANS
// ============================================================

/** Days after accessUntil before the app turns read-only */
export const GRACE_DAYS = 5;
/** Default pilot length for new companies (and existing ones without dates) */
export const DEFAULT_PILOT = { length: 3, unit: 'months' };

/** Feature keys that depend on the plan (everything else is in every plan) */
export const FEATURES = {
  jobLog: 'Job Log',
  reports: 'Profit reports',
  purchases: 'Purchases',
  excel: 'Excel download',
  contracts: 'Contracts',
  branding: 'Your brand colour on PDFs',
};

/** Paid plans. Prices in rupees; yearly = 10 months (2 months free). No GST for now. */
export const PAID_PLANS = [
  {
    id: 'basic', name: 'Basic', tag: 'For getting started', monthly: 999, team: 2, teamLabel: 'Owner + 1 staff',
    features: [],
    lead: 'Includes',
    items: ['Quotations, bills & PDFs', 'WhatsApp sharing', 'Calendar & daily limit', 'Event reminders on your phone', 'Unlimited events'],
  },
  {
    id: 'standard', name: 'Standard', tag: 'For busy event teams', monthly: 1599, team: 5, teamLabel: 'Up to 5 people', popular: true,
    features: ['jobLog', 'reports', 'purchases', 'excel'],
    lead: 'Everything in Basic, plus',
    items: ['Job Log — costs per event', 'Profit reports', 'Purchases by year', 'Excel download'],
  },
  {
    id: 'premium', name: 'Premium', tag: 'For growing companies', monthly: 2599, team: Infinity, teamLabel: 'Unlimited team', premium: true,
    features: ['jobLog', 'reports', 'purchases', 'excel', 'contracts', 'branding'],
    lead: 'Everything in Standard, plus',
    items: ['Contracts (service agreements)', 'Your brand colour on PDFs, no EventScope mark', 'Priority help on WhatsApp', 'New features first'],
  },
];

const planById = (id) => PAID_PLANS.find(p => p.id === id) || null;

/** Price for a plan and billing cycle (yearly = 10 × monthly) */
export const planPrice = (planId, cycle = 'monthly') => {
  const p = planById(planId);
  if (!p) return 0;
  return cycle === 'yearly' ? p.monthly * 10 : p.monthly;
};

/** "Free pilot" / "Standard" … */
export const planName = (planId) => (planId === 'trial' || !planId ? 'Free pilot' : planById(planId)?.name || planId);

/** Does this plan include the feature? The free pilot includes everything. */
export const hasFeature = (planId, feature) => {
  if (!planId || planId === 'trial') return true;
  return !!planById(planId)?.features.includes(feature);
};

/** Cheapest plan that has the feature ("Standard" / "Premium") */
export const planFor = (feature) => PAID_PLANS.find(p => p.features.includes(feature))?.name || 'Premium';

/** How many people (owners + staff + open invites) the plan allows */
export const teamLimit = (planId) => (!planId || planId === 'trial' ? Infinity : planById(planId)?.team ?? Infinity);

/** Basic and Standard PDFs carry a small "Made with EventScope" line */
export const showsEventScopeMark = (planId) => !hasFeature(planId, 'branding');

// ============================================================
// DATES ('YYYY-MM-DD' strings, calendar days — no time zones)
// ============================================================

const toUTC = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/** Today in India, 'YYYY-MM-DD' */
export const todayIST = (now = Date.now()) => fromUTC(now + 5.5 * 3600 * 1000);

export const addDays = (iso, n) => fromUTC(toUTC(iso) + n * 86400000);

/** Same day n months later (31 Jan + 1 month → 28/29 Feb) */
export const addMonths = (iso, n) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12); const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return fromUTC(Date.UTC(ny, nm, Math.min(d, last)));
};

/** Whole days from a to b (b − a) */
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);

/** Last day of a period that starts on `start`: 14 Oct + 3 months → 13 Jan */
export const periodEnd = (start, length, unit) =>
  addDays(unit === 'days' ? addDays(start, Number(length) || 0) : addMonths(start, Number(length) || 0), -1);

/** The moment (ms) writes stop: midnight IST after the last grace day */
export const blockAfterMs = (accessUntil) =>
  (isDate(accessUntil) ? Date.parse(`${addDays(accessUntil, GRACE_DAYS + 1)}T00:00:00+05:30`) : null);

// ============================================================
// FIELDS TO SAVE
// ============================================================

/** Tenant fields for a pilot of `length` days/months from `start` */
export const pilotFields = ({ start, length, unit, autoSuspend = true, extended = false }) => {
  const accessUntil = periodEnd(start, length, unit);
  return {
    plan: 'trial', pilotStart: start, pilotLength: Number(length), pilotUnit: unit, pilotExtended: !!extended,
    accessUntil, autoSuspend: !!autoSuspend, blockAfterMs: autoSuspend ? blockAfterMs(accessUntil) : null,
  };
};

/**
 * Next paid period: continues from the current end date if that's still
 * ahead (paying early loses no days), otherwise starts today.
 * → { start, end }
 */
export const renewalRange = (tenant, cycle, today = todayIST()) => {
  const until = tenant?.accessUntil;
  const start = isDate(until) && until >= today ? addDays(until, 1) : today;
  return { start, end: periodEnd(start, cycle === 'yearly' ? 12 : 1, 'months') };
};

/** Tenant fields after a confirmed payment */
export const paidFields = ({ plan, cycle, until, autoSuspend = true }) => ({
  plan, cycle, accessUntil: until, autoSuspend: !!autoSuspend,
  blockAfterMs: autoSuspend ? blockAfterMs(until) : null,
});

// ============================================================
// ACCESS STATE
// ============================================================

/**
 * Where a company stands today.
 * @param {object} tenant
 * @param {string} today  'YYYY-MM-DD'
 * @param {boolean} pending an "I've paid" claim is waiting for EventScope
 * @returns {{ kind: 'pilot'|'paid'|'open', plan, until, daysLeft, phase, graceLeft, readOnly, warn }}
 *   phase: 'active' | 'ending' (last 14 days; 7 for monthly) | 'grace' | 'ended' (past grace) | 'suspended' (by EventScope)
 *   readOnly: the app should stop changes (same as the rules)
 */
export const accessInfo = (tenant, today = todayIST(), pending = false) => {
  const plan = tenant?.plan || 'trial';
  const until = isDate(tenant?.accessUntil) ? tenant.accessUntil : null;
  const kind = !until ? 'open' : plan === 'trial' ? 'pilot' : 'paid';
  const auto = tenant?.autoSuspend !== false;
  const warn = kind === 'paid' && tenant?.cycle === 'monthly' ? 7 : 14;
  const daysLeft = until ? daysBetween(today, until) + 1 : null;   // including today
  let phase = 'active';
  let graceLeft = 0;
  if (until && daysLeft <= 0) {
    graceLeft = GRACE_DAYS + daysLeft;          // daysLeft is 0 the day after `until`
    phase = graceLeft > 0 || !auto ? 'grace' : 'ended';
  } else if (until && daysLeft <= warn) {
    phase = 'ending';
  }
  if ((tenant?.status || 'active') !== 'active') phase = 'suspended';
  const readOnly = phase === 'suspended' || (phase === 'ended' && !pending);
  return { kind, plan, until, daysLeft, phase, graceLeft: Math.max(0, graceLeft), readOnly, warn, pending };
};

/**
 * Admin status pill for a company.
 * → { label, tone: 'violet'|'emerald'|'amber'|'rose'|'gray', sub }
 */
export const adminStatus = (tenant, info, fmt = (d) => d, today = todayIST()) => {
  const range = (a, b) => `${fmt(a)} → ${fmt(b)}`;
  const reactivatedRecently = tenant?.reactivatedAt && daysBetween(String(tenant.reactivatedAt).slice(0, 10), today) <= 7;
  if (info.phase === 'suspended') {
    return { label: 'Suspended by you', tone: 'gray', sub: [tenant?.suspendedAt ? `Since ${fmt(String(tenant.suspendedAt).slice(0, 10))}` : '', tenant?.suspendNote].filter(Boolean).join(' · ') };
  }
  if (info.pending) return { label: 'Paid — confirm?', tone: 'violet', sub: 'Waiting for you to confirm the payment' };
  if (info.phase === 'ended') {
    return { label: info.kind === 'pilot' ? 'Suspended · pilot ended' : 'Suspended · not paid', tone: 'amber', sub: `Ended ${fmt(info.until)} · read-only` };
  }
  if (info.phase === 'grace') {
    return {
      label: info.kind === 'pilot' ? 'Pilot ended' : 'Payment due', tone: 'rose',
      sub: tenant?.autoSuspend === false ? `Ended ${fmt(info.until)} · auto-suspend off` : `${info.graceLeft} grace day${info.graceLeft === 1 ? '' : 's'} left`,
    };
  }
  const left = info.daysLeft != null ? ` · ${info.daysLeft} day${info.daysLeft === 1 ? '' : 's'} left` : '';
  if (info.kind === 'pilot') {
    return { label: reactivatedRecently ? 'Reactivated' : tenant?.pilotExtended ? 'Pilot extended' : 'Pilot', tone: 'violet', sub: `${range(tenant.pilotStart || info.until, info.until)}${left}` };
  }
  if (info.kind === 'paid') {
    return { label: reactivatedRecently ? 'Reactivated' : 'Paid', tone: 'emerald', sub: `Paid until ${fmt(info.until)}${info.phase === 'ending' ? left : ''}` };
  }
  return { label: reactivatedRecently ? 'Reactivated' : tenant?.plan === 'trial' || !tenant?.plan ? 'Pilot · no dates' : 'Active', tone: tenant?.plan === 'trial' || !tenant?.plan ? 'violet' : 'emerald', sub: tenant?.plan === 'trial' || !tenant?.plan ? 'Set the pilot dates' : 'No end date' };
};

// ============================================================
// UPI
// ============================================================

/**
 * upi:// link that opens Google Pay / PhonePe / Paytm with the payee, amount
 * and a note filled in (also what the QR code holds).
 */
export const upiLink = ({ upiId, payeeName = 'EventScope', amount, note = '' }) => {
  const q = [
    `pa=${encodeURIComponent(String(upiId || '').trim())}`,
    `pn=${encodeURIComponent(payeeName || 'EventScope')}`,
    `am=${Number(amount || 0).toFixed(2)}`,
    'cu=INR',
    note ? `tn=${encodeURIComponent(note.slice(0, 60))}` : '',
  ].filter(Boolean).join('&');
  return `upi://pay?${q}`;
};

// ============================================================
// DOCUMENT BRANDING
// ============================================================
export const EVENTSCOPE_PURPLE = '#652D90';

/** Accent colour for quote / bill PDFs: the company's own on Premium (and the pilot), else EventScope purple */
export const docBrandColor = (planId, settings) => {
  const c = String(settings?.brandColor || '').trim();
  return hasFeature(planId, 'branding') && /^#[0-9a-fA-F]{6}$/.test(c) ? c : EVENTSCOPE_PURPLE;
};
