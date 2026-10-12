/**
 * Contract (Event Services Agreement) — defaults.
 *
 * Each company can change these in Settings → Contract; the values fill the
 * highlighted blanks of the agreement (see components/ContractDocument.jsx).
 * The wording itself is fixed so every company gets the same reviewed text.
 */

// ============================================================
// COMPANY-LEVEL TERMS (settings.contractTerms)
// ============================================================
export const DEFAULT_CONTRACT_TERMS = {
  signatory: '',        // who signs for the company, e.g. the proprietor's name
  place: '',            // where agreements are signed, e.g. "Kochi" (falls back to the court city)
  courtCity: '',        // courts with jurisdiction, e.g. "Ernakulam"
  farDays: 60,          // cancelling more than this many days before → refund less adminPct
  adminPct: 10,         // % of contract price kept when cancelling early
  nearDays: 30,         // cancelling less than this many days before → nearPct of price
  nearPct: 50,          // % of contract price payable when cancelling late
  refundDays: 15,       // refunds paid within this many days of cancellation
  balanceDaysBefore: 1, // balance due this many days before the first function
  setupHours: 6,        // venue access before each function
  removalHours: 3,      // venue access after each function
  gstIncluded: false,   // is GST included in the contract price?
  portfolioPhotos: true // may photograph own décor for portfolio (unless client objects)
};

// ============================================================
// PER-EVENT OPTIONS
// ============================================================

/** How the advance was paid */
export const PAYMENT_MODES = ['UPI', 'Bank transfer', 'Cash', 'Cheque'];
