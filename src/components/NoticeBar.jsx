/**
 * NoticeBar — the one banner style used across the app: a light gradient
 * strip with a small illustration, a short bold title, one line of text and
 * an optional button. Four tones: violet (info), green (good news), amber
 * (needs action soon), rose (read-only).
 *
 * <PlanNotice> (below) picks which notice, if any, to show for the
 * company's plan / pilot / payment state — Layout renders it above every page.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { planName } from '../utils/billing';

// ============================================================
// CONSTANTS — tones and small illustrations (64 × 48)
// ============================================================
const TONES = {
  violet: { bg: 'linear-gradient(100deg,#f5f3ff 0%,#ede9fe 55%,#fdf4ff 100%)', border: '#e4dcfb', text: '#3b1d6e', accent: '#7c3aed' },
  green: { bg: 'linear-gradient(100deg,#f0fdf4 0%,#ecfdf5 50%,#f5f3ff 100%)', border: '#d1fae5', text: '#14532d', accent: '#059669' },
  amber: { bg: 'linear-gradient(100deg,#fffbeb 0%,#fef3c7 55%,#fff7ed 100%)', border: '#fde68a', text: '#78350f', accent: '#d97706' },
  rose: { bg: 'linear-gradient(100deg,#fff1f2 0%,#ffe4e6 50%,#fdf2f8 100%)', border: '#fecdd3', text: '#881337', accent: '#e11d48' },
};

const Spark = ({ x, y, c, s = 1 }) => (
  <path transform={`translate(${x} ${y}) scale(${s})`} d="M0-4l.8 2.4 2.4.8-2.4.8L0 2.4l-.8-2.4-2.4-.8 2.4-.8z" fill={c} />
);

const ART = {
  hourglass: (
    <>
      <ellipse cx="32" cy="43" rx="18" ry="3" fill="#7c3aed" opacity=".12" />
      <rect x="21" y="5" width="22" height="4" rx="2" fill="#6d28d9" /><rect x="21" y="37" width="22" height="4" rx="2" fill="#6d28d9" />
      <path d="M24 9h16c0 8-6 10-8 14 2 4 8 6 8 14H24c0-8 6-10 8-14-2-4-8-6-8-14z" fill="#ede9fe" stroke="#8b5cf6" strokeWidth="1.6" />
      <path d="M27 33c1-3 4-4 5-6 1 2 4 3 5 6z" fill="#f5b942" /><circle cx="32" cy="20" r="1.2" fill="#f5b942" />
      <Spark x={49} y={14} c="#c4b5fd" s={1.5} /><Spark x={12} y={24} c="#f5b942" />
    </>
  ),
  receipt: (
    <>
      <ellipse cx="32" cy="43" rx="18" ry="3" fill="#7c3aed" opacity=".12" />
      <path d="M20 5h24v34l-4-2.5-4 2.5-4-2.5-4 2.5-4-2.5-4 2.5z" fill="#fff" stroke="#8b5cf6" strokeWidth="1.6" />
      <rect x="25" y="11" width="14" height="2.5" rx="1.2" fill="#c4b5fd" /><rect x="25" y="17" width="10" height="2.5" rx="1.2" fill="#ddd6fe" /><rect x="25" y="23" width="12" height="2.5" rx="1.2" fill="#ddd6fe" />
      <circle cx="46" cy="30" r="8" fill="#10b981" /><path d="M42.5 30l2.5 2.5 4.5-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Spark x={12} y={14} c="#c4b5fd" />
    </>
  ),
  wallet: (
    <>
      <ellipse cx="32" cy="43" rx="18" ry="3" fill="#d97706" opacity=".14" />
      <rect x="14" y="13" width="34" height="25" rx="5" fill="#fde68a" stroke="#d97706" strokeWidth="1.6" />
      <path d="M18 13l20-8 4 8" fill="#fff7ed" stroke="#d97706" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="36" y="21" width="14" height="9" rx="3" fill="#fff" stroke="#d97706" strokeWidth="1.6" /><circle cx="41" cy="25.5" r="1.8" fill="#d97706" />
      <circle cx="52" cy="10" r="5" fill="#f59e0b" /><text x="52" y="12.6" textAnchor="middle" fontSize="7" fontWeight="800" fill="#fff" fontFamily="system-ui">₹</text>
    </>
  ),
  lock: (
    <>
      <ellipse cx="32" cy="43" rx="18" ry="3" fill="#e11d48" opacity=".12" />
      <path d="M24 20v-5a8 8 0 0 1 16 0v5" fill="none" stroke="#be123c" strokeWidth="3" strokeLinecap="round" />
      <rect x="19" y="20" width="26" height="20" rx="5" fill="#fecdd3" stroke="#e11d48" strokeWidth="1.6" />
      <circle cx="32" cy="28.5" r="2.6" fill="#be123c" /><rect x="31" y="29" width="2" height="6" rx="1" fill="#be123c" />
      <path d="M47 18c4-1 6 2 5 5-3 0-6-2-5-5z" fill="#86efac" /><path d="M49 25c3 0 4 3 3 5-2 0-4-2-3-5z" fill="#4ade80" />
      <Spark x={11} y={16} c="#fda4af" />
    </>
  ),
};

// ============================================================
// NoticeBar — MAIN COMPONENT
// ============================================================

/** A single notice: tone, art, title, text, optional action button */
export default function NoticeBar({ tone = 'violet', art = 'hourglass', title, text, action, onAction, testId }) {
  const t = TONES[tone] || TONES.violet;
  return (
    <div
      data-testid={testId || 'notice-bar'}
      className="relative overflow-hidden flex items-center gap-2.5 sm:gap-3.5 rounded-2xl pl-1.5 pr-2.5 py-2 sm:pl-2.5 sm:pr-3 sm:py-1.5"
      style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.text }}
    >
      <span className="pointer-events-none absolute -right-8 -top-8 w-[90px] h-[90px] rounded-full bg-white opacity-35" />
      <svg viewBox="0 0 64 48" className="relative shrink-0 w-[54px] h-[40px] sm:w-16 sm:h-12" aria-hidden="true">{ART[art]}</svg>
      <div className="relative flex-1 min-w-0 leading-snug">
        <div className="font-bold text-[13px] sm:text-sm">{title}</div>
        {text && <div className="text-[12.5px] sm:text-[13px] opacity-80">{text}</div>}
      </div>
      {action && (
        <button
          onClick={onAction}
          className="relative shrink-0 rounded-[10px] px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[13px] font-bold text-white cursor-pointer"
          style={{ background: t.accent, boxShadow: `0 6px 14px -8px ${t.accent}` }}
        >
          {action}
        </button>
      )}
    </div>
  );
}

// ============================================================
// PlanNotice — which notice to show for this company right now
// ============================================================

const fmt = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

/** Reads the plan state from AppContext and shows at most one NoticeBar */
export function PlanNotice() {
  const { tenant, access, isOwner } = useApp();
  const navigate = useNavigate();
  if (!tenant || !access) return null;
  const go = () => navigate('/billing');
  const ownerAction = (label) => (isOwner ? { action: label, onAction: go } : {});
  const ask = isOwner ? '' : ' Ask your company owner to renew.';
  const what = access.kind === 'pilot' ? 'Your free pilot' : `Your ${planName(access.plan)} plan`;

  if (access.phase === 'suspended') {
    return <NoticeBar tone="rose" art="lock" title="Read-only" text="EventScope has paused this account. You can still view, download and share — contact EventScope support to switch it back on." />;
  }
  if (access.pending) {
    return <NoticeBar tone="green" art="receipt" title="Thanks — payment received" text={`We’re confirming your ₹${Number(access.pendingAmount || 0).toLocaleString('en-IN')} payment. Keep working as usual.`} testId="notice-pending" />;
  }
  if (access.readOnly) {
    return <NoticeBar tone="rose" art="lock" title="Read-only" text={`${what} ended on ${fmt(access.until)}. You can still view, download and share.${ask}`} {...ownerAction('Renew')} testId="notice-readonly" />;
  }
  if (access.phase === 'grace') {
    return (
      <NoticeBar tone="amber" art="wallet" title={access.kind === 'pilot' ? 'Free pilot ended' : 'Payment due'}
        text={`${access.graceLeft} day${access.graceLeft === 1 ? '' : 's'} left before the app turns read-only.${ask}`}
        {...ownerAction(access.kind === 'pilot' ? 'See plans' : 'Pay now')} testId="notice-grace" />
    );
  }
  if (access.phase === 'ending') {
    return (
      <NoticeBar tone="violet" art="hourglass"
        title={`${access.kind === 'pilot' ? 'Free pilot' : `${planName(access.plan)} plan`} · ${access.daysLeft} day${access.daysLeft === 1 ? '' : 's'} left`}
        text={`Ends on ${fmt(access.until)}${access.kind === 'pilot' ? ' — pick a plan to keep going.' : ' — renew to keep going.'}${ask}`}
        {...ownerAction(access.kind === 'pilot' ? 'See plans' : 'Renew')} testId="notice-ending" />
    );
  }
  return null;
}
