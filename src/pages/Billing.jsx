/**
 * Billing — "Plan & billing" for company owners.
 *
 * Shows where the company stands (pilot / paid until / read-only), the three
 * plans (Monthly / Yearly — 2 months free), and how to pay: EventScope's UPI
 * ID as a "Pay with UPI" button on phones and a QR code on laptops. After
 * paying, the owner types the UPI reference and taps "I've paid" — that files
 * tenants/{id}/payments/pending, keeps the app working, and EventScope
 * confirms it from Admin. Confirmed payments are listed at the bottom.
 *
 * Plans, prices and dates come from utils/billing.js; EventScope's UPI ID /
 * payee / QR from platform/billing (set in Admin → Payment settings).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { Lock, Clock, Users, Copy, X, MessageCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import { useIsPhone } from '../components/useIsPhone';
import { waLink } from '../utils/helpers';
import {
  PAID_PLANS, planPrice, planName, renewalRange, upiLink, daysBetween, todayIST, isDate,
} from '../utils/billing';

// ============================================================
// HELPERS
// ============================================================
const rupees = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const fmtDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  (isDate(iso) ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', opts) : '');
const INK = '#1f1530';
const MUTED = '#6b6478';

/** Small round tick in a colour */
const Tick = ({ c }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0 mt-px" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill={c} opacity=".16" />
    <path d="M7 12.5l3 3 7-7" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** QR code for a UPI link (qrcode library, loaded only when shown) */
function UpiQr({ link, size = 160 }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    import('qrcode').then(QR => QR.toString(link, { type: 'svg', margin: 1, color: { dark: '#1f1530', light: '#ffffff' } }))
      .then(s => { if (alive) setSvg(s); }).catch(() => {});
    return () => { alive = false; };
  }, [link]);
  return <div style={{ width: size, height: size }} className="[&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** "Your plan" strip at the top */
function YourPlan({ access, tenant, pending, onRenew }) {
  const label = access.kind === 'pilot' ? 'Free pilot · all features' : access.kind === 'paid' ? `${planName(access.plan)} · ${tenant.cycle === 'yearly' ? 'yearly' : 'monthly'}` : planName(access.plan);
  const start = access.kind === 'pilot' ? tenant.pilotStart : null;
  const total = start && access.until ? daysBetween(start, access.until) + 1 : null;
  const used = total ? Math.min(1, Math.max(0, (total - Math.max(0, access.daysLeft)) / total)) : null;
  const ended = access.readOnly || access.phase === 'grace';
  return (
    <div className="flex items-center gap-3.5 flex-wrap bg-white border rounded-2xl px-4 sm:px-5 py-3.5" style={{ borderColor: ended ? '#fecdd3' : '#e9e4f0' }} data-testid="your-plan">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: ended ? '#fff1f2' : 'linear-gradient(135deg,#ede9fe,#f5f3ff)' }}>
        {ended ? <Lock size={19} color="#e11d48" /> : <Clock size={19} color="#7c3aed" />}
      </div>
      <div className="flex-1 min-w-[180px]">
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: MUTED }}>Your plan</div>
        <div className="text-base font-bold" style={{ color: INK }}>
          {label}{access.until && <span className="font-medium" style={{ color: MUTED }}> · {start ? `${fmtDate(start, { day: 'numeric', month: 'short' })} → ` : 'until '}{fmtDate(access.until, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
        </div>
        {used !== null && !ended && (
          <div className="mt-2 h-1.5 rounded-full overflow-hidden max-w-[420px]" style={{ background: '#efeaf5' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.round(used * 100)}%`, background: onRenew ? '#7c3aed' : 'linear-gradient(90deg,#a855f7,#6d28d9)' }} />
          </div>
        )}
        {pending && <div className="text-xs mt-1 font-semibold text-emerald-700">Payment of {rupees(pending.amount)} sent — waiting for EventScope to confirm</div>}
      </div>
      {access.until && (
        <div className="text-right">
          {ended
            ? <><div className="text-sm font-bold text-rose-600">{access.readOnly ? 'Read-only' : `${access.graceLeft} grace day${access.graceLeft === 1 ? '' : 's'}`}</div><div className="text-xs" style={{ color: MUTED }}>{access.readOnly ? 'renew to edit' : 'left to pay'}</div></>
            : <><div className="text-2xl font-extrabold leading-none" style={{ color: INK }}>{access.daysLeft}</div><div className="text-xs" style={{ color: MUTED }}>days left</div></>}
        </div>
      )}
      {onRenew && !pending && <button onClick={onRenew} className="min-h-[38px] px-4 rounded-xl bg-bb-accent text-white text-[13.5px] font-bold cursor-pointer hover:bg-bb-accent-hover" data-testid="renew-strip">Renew</button>}
    </div>
  );
}

/** One plan card (Basic white, Standard purple-edged, Premium dark plum + gold) */
function PlanCard({ p, yearly, current, picked, disabled, onChoose, laptop }) {
  const dark = p.premium;
  const fg = dark ? '#fff' : INK;
  const muted = dark ? 'rgba(255,255,255,.68)' : MUTED;
  const accent = dark ? '#f5c451' : '#7c3aed';
  const perMonth = yearly ? Math.round(planPrice(p.id, 'yearly') / 12) : p.monthly;
  const box = dark
    ? { background: 'radial-gradient(120% 80% at 100% 0%, #5b2a86 0%, #2a1240 55%, #1c0c2c 100%)', border: '1px solid #4a2468', boxShadow: '0 24px 48px -20px rgba(28,12,44,.6)' }
    : p.popular
      ? { background: '#fff', border: '2px solid transparent', backgroundImage: 'linear-gradient(#fff,#fff),linear-gradient(135deg,#a855f7,#6d28d9)', backgroundOrigin: 'border-box', backgroundClip: 'padding-box,border-box', boxShadow: '0 24px 48px -24px rgba(109,40,217,.45)' }
      : { background: '#fff', border: '1px solid #e9e4f0' };
  const btn = laptop
    ? (p.popular ? { background: '#7c3aed', color: '#fff' } : dark ? { background: '#f5c451', color: '#2a1240' } : { background: '#fff', color: '#6d28d9', border: '1.5px solid #d8ccf3' })
    : p.popular
    ? { background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', color: '#fff', boxShadow: '0 10px 24px -10px rgba(109,40,217,.7)' }
    : dark ? { background: 'linear-gradient(135deg,#f8d77a,#e0a92e)', color: '#2a1240', boxShadow: '0 10px 24px -10px rgba(224,169,46,.6)' }
      : { background: '#fff', color: '#6d28d9', border: '1.5px solid #d8ccf3' };
  return (
    <div className={`relative rounded-[20px] px-6 pt-7 pb-6 flex flex-col ${p.popular ? 'md:-translate-y-2.5' : ''}`} style={box} data-testid={`plan-${p.id}`}>
      {p.popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wider text-white" style={{ background: 'linear-gradient(135deg,#a855f7,#6d28d9)', boxShadow: '0 6px 16px -6px rgba(109,40,217,.6)' }}>MOST POPULAR</span>
      )}
      {laptop && current && (
        <span className="absolute top-[18px] right-[18px] rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-wider" data-testid="current-chip"
          style={dark ? { color: '#f5c451', border: '1px solid rgba(245,196,81,.45)' } : { background: '#ede9fe', color: '#6d28d9' }}>CURRENT PLAN</span>
      )}
      {dark && !(laptop && current) && (
        <span className="absolute top-[18px] right-[18px] inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wider" style={{ color: '#f5c451', border: '1px solid rgba(245,196,81,.45)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#f5c451"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg> PREMIUM
        </span>
      )}
      <div className="text-xl font-bold tracking-tight" style={{ color: fg }}>{p.name}
        {picked && <span className="ml-2 align-middle rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-wider" data-testid="picked-chip" style={dark ? { color: '#f5c451', border: '1px solid rgba(245,196,81,.45)' } : { background: '#ede9fe', color: '#6d28d9' }}>YOUR PICK</span>}
      </div>
      <div className="text-[13px] mt-0.5" style={{ color: muted }}>{p.tag}</div>
      <div className="flex items-start gap-0.5 mt-5" style={{ color: fg }}>
        <span className="text-xl font-semibold mt-1.5">₹</span>
        <span className="text-[44px] font-extrabold tracking-tight leading-none">{perMonth.toLocaleString('en-IN')}</span>
        <span className="text-[13px] self-end mb-1.5 ml-1.5" style={{ color: muted }}>/ month</span>
      </div>
      <div className="text-[12.5px] mt-1.5 min-h-[18px]" style={{ color: muted }}>
        {yearly
          ? <>{rupees(planPrice(p.id, 'yearly'))} billed yearly · <b style={{ color: dark ? '#f5c451' : '#059669' }}>save {rupees(p.monthly * 2)}</b></>
          : 'Billed monthly'}
      </div>
      <button onClick={onChoose} disabled={disabled}
        className="mt-5 w-full py-3 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" style={btn}>
        {current ? 'Renew' : laptop ? `Switch to ${p.name}` : p.popular ? 'Choose Standard' : dark ? 'Go Premium' : `Choose ${p.name}`}
      </button>
      <div className="h-px my-5" style={{ background: dark ? 'rgba(255,255,255,.12)' : '#efeaf5' }} />
      <div className="flex items-center gap-2 text-[13px] font-semibold mb-3" style={{ color: fg }}>
        <Users size={16} color={accent} />{p.teamLabel}
        {current && !laptop && <span className="ml-auto text-[10.5px] font-bold rounded-full px-2 py-0.5" style={{ background: dark ? 'rgba(245,196,81,.15)' : '#ede9fe', color: dark ? '#f5c451' : '#6d28d9' }}>CURRENT PLAN</span>}
      </div>
      <div className="text-[11.5px] font-bold tracking-wider uppercase mb-2.5" style={{ color: muted }}>{p.lead}</div>
      <div className="flex flex-col gap-2.5">
        {p.items.map(i => <div key={i} className="flex gap-2.5 text-sm leading-snug" style={{ color: fg }}><Tick c={accent} /><span>{i}</span></div>)}
      </div>
    </div>
  );
}

/** Pay pop-up: summary → pay by UPI → "I've paid" → thank you */
function Checkout({ choice, onClose }) {
  const { tenant, settings, platformBilling, submitPaymentClaim, showToast } = useApp();
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const p = PAID_PLANS.find(x => x.id === choice.plan);
  const amount = planPrice(choice.plan, choice.cycle);
  const range = renewalRange(tenant, choice.cycle, todayIST());
  const upiId = platformBilling?.upiId || '';
  const note = `EventScope ${p.name} ${choice.cycle} - ${(settings.companyName || tenant?.name || '').slice(0, 24)}`;
  const link = upiId ? upiLink({ upiId, payeeName: platformBilling?.payeeName, amount, note }) : '';

  const send = async () => {
    const clean = ref.replace(/\s+/g, '');
    if (clean.length < 6) { setError('Type the UPI reference number from your payment (usually 12 digits).'); return; }
    setBusy(true);
    const res = await submitPaymentClaim({ plan: choice.plan, cycle: choice.cycle, amount, ref: clean, start: range.start, end: range.end });
    setBusy(false);
    if (res.success) setDone(true); else setError(res.error);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(upiId); showToast('UPI ID copied'); } catch { showToast(upiId); }
  };

  const row = (l, v, strong) => (
    <div className="flex justify-between gap-3 py-1 text-[13.5px]"><span style={{ color: MUTED }}>{l}</span>
      <span className={strong ? 'text-[17px] font-extrabold' : 'font-semibold text-right'} style={{ color: INK }}>{v}</span></div>
  );
  const step = (n, t) => (
    <div className="flex items-center gap-2.5 mt-5 mb-2.5"><span className="w-6 h-6 rounded-full bg-[#6d28d9] text-white text-xs font-extrabold flex items-center justify-center">{n}</span><span className="font-bold text-[14.5px]" style={{ color: INK }}>{t}</span></div>
  );
  const apps = (
    <div className="flex gap-1.5 flex-wrap">{['Google Pay', 'PhonePe', 'Paytm', 'BHIM'].map(a => <span key={a} className="text-[11.5px] rounded-full px-2.5 py-1" style={{ color: MUTED, background: '#f6f3fb' }}>{a}</span>)}</div>
  );
  const upiBox = (
    <div className="flex items-center gap-2 bg-white rounded-[10px] px-2.5 py-2 text-[13px]" style={{ border: '1px dashed #cfc2f2' }}>
      <span style={{ color: MUTED }}>UPI ID</span><b className="flex-1 truncate" style={{ color: INK }}>{upiId}</b>
      <button onClick={copy} className="inline-flex items-center gap-1 font-bold text-[#6d28d9] cursor-pointer"><Copy size={13} /> Copy</button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center md:p-4" role="dialog" aria-modal="true" data-testid="checkout">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(20,10,35,.55)' }} onClick={onClose} />
      <div className="relative w-full md:max-w-[560px] max-h-[94dvh] overflow-auto bg-white rounded-t-[22px] md:rounded-[22px]" style={{ boxShadow: '0 30px 70px -20px rgba(28,12,44,.55)' }}>
        {done ? (
          <div className="text-center px-5 md:px-8 pt-6 pb-6">
            <svg width="120" height="96" viewBox="0 0 120 96" className="block mx-auto" aria-hidden="true"><circle cx="60" cy="50" r="32" fill="#d1fae5" /><circle cx="60" cy="50" r="22" fill="#10b981" /><path d="M50 50l7 7 13-14" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#f5c451" /><path d="M100 18l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#a78bfa" /><circle cx="102" cy="70" r="3" fill="#f9a8d4" /><circle cx="16" cy="66" r="2.5" fill="#a78bfa" /></svg>
            <div className="text-xl font-extrabold mt-1.5" style={{ color: INK }}>Thank you! 🎉</div>
            <p className="text-sm mx-auto mt-1.5 mb-4 max-w-[340px]" style={{ color: MUTED }}>
              We’ve got your payment of <b style={{ color: INK }}>{rupees(amount)}</b> (ref {ref.replace(/\s+/g, '')}). EventScope will confirm it within a day — keep working as usual. Your receipt will appear here.
            </p>
            <span className="inline-flex rounded-full px-3.5 py-1.5 text-[13px] font-semibold" style={{ background: '#f5f3ff', color: '#5b21b6' }}>{p.name} · {choice.cycle} · until {fmtDate(range.end)}</span>
            <button onClick={onClose} className="block w-full mt-5 py-3 rounded-xl text-white font-bold text-[14.5px] cursor-pointer" style={{ background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' }}>Done</button>
          </div>
        ) : (
          <>
            <div className="relative overflow-hidden px-5 pt-5 pb-4 text-white" style={{ background: 'radial-gradient(120% 140% at 100% 0%,#7c3aed 0%,#4c1d95 55%,#2a1240 100%)' }}>
              <span className="absolute -right-10 -top-10 w-[140px] h-[140px] rounded-full bg-white opacity-[.07]" />
              <div className="relative flex justify-between items-start">
                <div>
                  <div className="text-xs font-bold tracking-[.08em] opacity-75">{tenant?.plan === choice.plan ? 'RENEW' : 'UPGRADE'}</div>
                  <div className="text-[21px] font-extrabold mt-0.5">{p.name} plan</div>
                  <div className="text-[13px] opacity-80 mt-0.5">{p.teamLabel} · {p.items.slice(0, 2).join(' · ')}</div>
                </div>
                <button onClick={onClose} className="p-1 opacity-80 hover:opacity-100 cursor-pointer" aria-label="Close"><X size={20} /></button>
              </div>
            </div>
            <div className="px-4 md:px-5 pt-4 pb-[calc(18px+env(safe-area-inset-bottom))] md:pb-5">
              <div className="rounded-[14px] px-4 py-3" style={{ background: 'linear-gradient(135deg,#faf8ff,#f3eefe)', border: '1px solid #ebe4fb' }}>
                {row('Plan', `${p.name} · ${choice.cycle}`)}
                {row('Covers', `${fmtDate(range.start)} → ${fmtDate(range.end)}`)}
                {choice.cycle === 'yearly' && row('You save', <span className="text-emerald-600">{rupees(p.monthly * 2)} (2 months free)</span>)}
                <div className="h-px my-1.5" style={{ background: '#e7defa' }} />
                {row('Total', rupees(amount), true)}
              </div>

              {!upiId ? (
                <div className="mt-4 rounded-xl px-4 py-3 text-sm bg-amber-50 text-amber-900 border border-amber-200" data-testid="upi-missing">
                  Payment details are coming soon. Please contact EventScope to pay for your plan.
                </div>
              ) : (
                <>
                  {step(1, `Pay ${rupees(amount)}`)}
                  {/* Phone: open the UPI app directly */}
                  <div className="md:hidden">
                    <a href={link} className="block w-full text-center py-3.5 rounded-[14px] text-white font-extrabold text-[15.5px]" style={{ background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', boxShadow: '0 12px 26px -12px rgba(109,40,217,.8)' }}>
                      Pay {rupees(amount)} with UPI
                    </a>
                    <div className="flex justify-center mt-2.5">{apps}</div>
                    <p className="text-xs text-center my-2.5" style={{ color: '#8a839a' }}>Opens your UPI app with the amount and our ID filled in</p>
                    {upiBox}
                  </div>
                  {/* Laptop: scan the QR */}
                  <div className="hidden md:flex gap-4 items-center">
                    <div className="p-2.5 bg-white rounded-2xl shrink-0" style={{ border: '1px solid #ebe4fb', boxShadow: '0 10px 30px -18px rgba(109,40,217,.5)' }}>
                      {platformBilling?.qr ? <img src={platformBilling.qr} alt="UPI QR code" className="w-[160px] h-[160px] object-contain" /> : <UpiQr link={link} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold" style={{ color: INK }}>Scan with any UPI app</div>
                      <div className="text-[12.5px] mt-1 mb-2.5" style={{ color: MUTED }}>{platformBilling?.qr ? `Enter ${rupees(amount)} when your app asks.` : 'The amount and a note are filled in for you.'}</div>
                      <div className="mb-2.5">{apps}</div>
                      {upiBox}
                    </div>
                  </div>

                  {step(2, 'Tell us you’ve paid')}
                  <div className="flex gap-2">
                    <input value={ref} onChange={e => { setRef(e.target.value); setError(''); }} inputMode="numeric" placeholder="UPI reference no. (12 digits)" aria-label="UPI reference number"
                      className="flex-1 min-w-0 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-bb-accent" style={{ border: '1px solid #e3dcef', background: '#fbfaff' }} />
                    <button onClick={send} disabled={busy} className="rounded-xl px-[18px] text-white font-bold text-sm whitespace-nowrap cursor-pointer disabled:opacity-60" style={{ background: INK }}>
                      {busy ? 'Sending…' : 'I’ve paid'}
                    </button>
                  </div>
                  {error && <p className="text-sm text-red-600 mt-2" role="alert">{error}</p>}
                  <p className="text-xs mt-2" style={{ color: '#8a839a' }}>Find it in your UPI app under the payment. We confirm within a day — keep working meanwhile.</p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Billing — MAIN COMPONENT
// ============================================================
export default function Billing() {
  const { tenant, access, isOwner, pendingPayment, payments, platformBilling } = useApp();
  const isPhone = useIsPhone();
  const laptop = !isPhone;
  const [yearly, setYearly] = useState(true);
  const [choice, setChoice] = useState(null);   // { plan, cycle } while the pay pop-up is open

  const history = useMemo(() => [...payments].sort((a, b) => String(b.paidOn || b.confirmedAt).localeCompare(String(a.paidOn || a.confirmedAt))), [payments]);

  if (!isOwner) {
    return (
      <Card>
        <div className="text-center py-10">
          <Lock size={36} className="mx-auto text-bb-muted mb-3" />
          <p className="font-semibold text-bb-text">Plan & billing is only for the account owner</p>
        </div>
      </Card>
    );
  }
  if (!tenant) return null;

  const seg = (on, label, extra) => (
    <button onClick={() => setYearly(label !== 'Monthly')}
      className="px-4 sm:px-[18px] py-2 rounded-full text-[13.5px] font-semibold inline-flex items-center gap-2 cursor-pointer"
      style={on ? { background: '#fff', color: INK, boxShadow: '0 1px 3px rgba(0,0,0,.1)' } : { color: MUTED }}>
      {label}{extra}
    </button>
  );
  const trust = ['No charge per event', 'Pay by UPI', 'Your data stays yours', 'Change plan any time'];

  const renewCurrent = () => setChoice({ plan: tenant.plan, cycle: yearly ? 'yearly' : 'monthly' });
  const canRenew = laptop && PAID_PLANS.some(p => p.id === tenant.plan);
  const toggle = (
    <div className="inline-flex rounded-full p-1 gap-0.5" style={{ background: '#efeaf5' }}>
      {seg(!yearly, 'Monthly')}
      {seg(yearly, 'Yearly', <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700">2 months free</span>)}
    </div>
  );
  const headline = (
    <>
      <h1 className="text-2xl md:text-[32px] font-extrabold tracking-tight" style={{ color: INK }}>Pick the plan that fits your business</h1>
      <p className="text-[15px] mt-2 mb-4" style={{ color: MUTED }}>One simple price — however many events you run.</p>
    </>
  );

  return (
    <div className="max-w-[1080px] mx-auto">
      {isPhone && <YourPlan access={access} tenant={tenant} pending={pendingPayment} />}

      {isPhone ? (
        <div className="text-center mt-7 mb-5 md:mt-10 md:mb-8">{headline}{toggle}</div>
      ) : (
        <>
          {/* Laptop: the headline scrolls away, the toggle stays pinned */}
          <div className="text-center pt-4">{headline}</div>
          <div className="sticky top-0 z-20 bg-bb-bg py-2.5 text-center" data-testid="billing-pinned">{toggle}</div>
          <div className="mt-3 mb-6"><YourPlan access={access} tenant={tenant} pending={pendingPayment} onRenew={canRenew ? renewCurrent : null} /></div>
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-5 items-stretch md:pt-2.5">
        {PAID_PLANS.map(p => (
          <PlanCard key={p.id} p={p} yearly={yearly} current={tenant.plan === p.id} picked={(tenant.plan || 'trial') === 'trial' && tenant.interestedPlan === p.id} laptop={laptop}
            disabled={!!pendingPayment}
            onChoose={() => setChoice({ plan: p.id, cycle: yearly ? 'yearly' : 'monthly' })} />
        ))}
      </div>
      {pendingPayment && <p className="text-center text-sm text-emerald-700 font-semibold mt-4">Your payment is waiting for EventScope to confirm — you can choose again after that.</p>}

      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2.5 mt-7 mb-2 text-[13px]" style={{ color: MUTED }}>
        {trust.map(t => <span key={t} className="inline-flex items-center gap-1.5"><Tick c="#7c3aed" />{t}</span>)}
      </div>
      {laptop && platformBilling?.supportWhatsapp
        ? <p className="text-center text-xs" style={{ color: '#9a93a6' }}>Questions?{' '}<a href={waLink(platformBilling.supportWhatsapp, 'Hi, I have a question about my EventScope plan')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 ml-1 px-3 py-1.5 rounded-full border border-violet-200 bg-white text-[12.5px] font-bold text-bb-accent-hover" data-testid="help-whatsapp"><MessageCircle size={14} />Chat with us on WhatsApp</a></p>
        : <p className="text-center text-xs" style={{ color: '#9a93a6' }}>Questions? WhatsApp EventScope.</p>}

      {/* Payments */}
      <div className="mt-8 bg-white border rounded-2xl px-4 sm:px-5 py-4" style={{ borderColor: '#e9e4f0' }} data-testid="payments">
        <p className="font-bold mb-2" style={{ color: INK }}>Payments</p>
        {pendingPayment && (
          <div className="flex justify-between gap-3 text-sm py-2 border-b border-bb-border/60">
            <span>{fmtDate(String(pendingPayment.createdAt).slice(0, 10))} · {planName(pendingPayment.plan)} {pendingPayment.cycle} · ref {pendingPayment.ref} <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-violet-100 text-violet-700 ml-1">Waiting to confirm</span></span>
            <b>{rupees(pendingPayment.amount)}</b>
          </div>
        )}
        {history.map(h => (
          <div key={h.id} className="flex justify-between gap-3 text-sm py-2 border-b border-bb-border/60">
            <span>{fmtDate(h.paidOn || String(h.confirmedAt).slice(0, 10))} · {planName(h.plan)} {h.cycle} · {fmtDate(h.start)} → {fmtDate(h.end)}{h.ref ? ` · ref ${h.ref}` : ''} <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700 ml-1">Paid</span></span>
            <b>{rupees(h.amount)}</b>
          </div>
        ))}
        {tenant.pilotStart && (
          <div className="flex justify-between gap-3 text-sm py-2"><span>{fmtDate(tenant.pilotStart)} · Free pilot started ({tenant.pilotLength} {tenant.pilotUnit})</span><span style={{ color: MUTED }}>₹0</span></div>
        )}
        {!pendingPayment && !history.length && !tenant.pilotStart && <p className="text-sm" style={{ color: MUTED }}>No payments yet.</p>}
      </div>

      {choice && <Checkout choice={choice} onClose={() => setChoice(null)} />}
    </div>
  );
}
