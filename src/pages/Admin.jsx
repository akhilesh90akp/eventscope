/**
 * Admin — EventScope platform admin console
 *
 * Visible only to logins listed in platformAdmins/{uid} (added by hand in the
 * Firebase console). Lists every company (tenant) with plan, status (pilot,
 * paid, payment due, suspended…), team size, events and money collected.
 * Actions ▾ per company: confirm/record a payment, set/extend the pilot,
 * change plan, suspend, reactivate, history (components/AdminBillingDialog).
 * Also: collections cards, EventScope's UPI payment settings, setting pilot
 * dates for older companies (automatic: from sign-up), managing a company's team (support), and
 * importing a company from a backup. firestore.rules enforce all of this server-side; hiding the
 * menu item is just for a clean UI.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import StickyBar from '../components/StickyBar';
import ImportCompanyDialog from '../components/ImportCompanyDialog';
import AdminTeamDialog from '../components/AdminTeamDialog';
import AdminBillingDialog from '../components/AdminBillingDialog';
import Input from '../components/Input';
import Button from '../components/Button';
import BottomSheet from '../components/BottomSheet';
import { MenuRow, SectionLabel } from '../components/PhoneUI';
import { HeaderIconButton } from '../components/PhoneHeader';
import { usePhoneHeader } from '../components/phoneScreens';
import { useIsPhone } from '../components/useIsPhone';
import { PageHeader, HeaderText, StatRow, Seg, Field } from '../components/LaptopUI';
import { formatDateReadable, resizeImageFile } from '../utils/helpers';
import { Search, Lock, Upload, ChevronDown, Wallet, IndianRupee, Clock, Repeat2, PauseCircle, History, CheckCircle2, Power } from 'lucide-react';
import { accessInfo, adminStatus, planName, todayIST, isDate, DEFAULT_PILOT } from '../utils/billing';
import { fyStart } from '../utils/purchases';

// ============================================================
// HELPERS
// ============================================================
const DAY = 24 * 60 * 60 * 1000;
const isNew = (t) => t.createdAt && Date.now() - new Date(t.createdAt).getTime() < 7 * DAY;
/** A company still on its free pilot that picked a plan on the website */
const wants = (t) => (t.plan || 'trial') === 'trial' && !!t.interestedPlan;
const rupees = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const fmt = (iso) => (isDate(iso) ? formatDateReadable(`${iso}T00:00:00`) : '');
const TONE = {
  violet: 'bg-violet-100 text-violet-700', emerald: 'bg-emerald-100 text-emerald-700', amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700', gray: 'bg-gray-200 text-gray-700',
};
const FILTERS = [['all', 'All'], ['pilot', 'Pilot'], ['paid', 'Paid'], ['action', 'Needs action'], ['readonly', 'Read-only']];

/** The actions a company offers: [key, title, helper text, colour class, icon, phone tone] — shared by the laptop menu and the phone sheet */
function actionItems(row) {
  return [
    row.pending && ['payment', '✓ Confirm payment', `${rupees(row.pending.amount)} · ref ${row.pending.ref}`, 'text-emerald-700', CheckCircle2, 'green'],
    !row.pending && ['payment', 'Record payment', 'Paid you some other way', '', IndianRupee, 'neutral'],
    ['pilot', row.t.plan === 'trial' && row.t.accessUntil ? 'Extend pilot' : 'Set pilot', 'Days or months, auto-suspend', '', Clock, 'neutral'],
    ['plan', 'Change plan', 'Free pilot / Basic / Standard / Premium', '', Repeat2, 'neutral'],
    '-',
    row.info.readOnly || row.info.phase === 'grace' ? ['reactivate', 'Reactivate', 'Switch editing back on', 'text-emerald-700', Power, 'green'] : null,
    row.info.phase !== 'suspended' ? ['suspend', 'Suspend', 'Make read-only now', 'text-amber-700', PauseCircle, 'amber'] : null,
    ['history', 'History', 'Everything that happened', '', History, 'neutral'],
  ].filter(Boolean);
}

/** Does this company belong under the chosen filter chip? */
function matchesFilter(filter, { t, info, pending }) {
  if (filter === 'pilot') return info.kind === 'pilot' || (t.plan || 'trial') === 'trial';
  if (filter === 'paid') return (t.plan || 'trial') !== 'trial';
  if (filter === 'action') return !!pending || info.phase === 'grace' || info.phase === 'ending';
  if (filter === 'readonly') return info.readOnly;
  return true;
}

/**
 * Actions ▾ — a small menu; picking an item opens its pop-up. Drawn in a
 * portal with fixed position (the table box clips anything inside it), and
 * opens upward when there isn't room below.
 */
function ActionsMenu({ row, onPick }) {
  const [pos, setPos] = useState(null);   // { left, top|bottom } while open
  const btnRef = useRef(null);
  const items = actionItems(row);

  const toggle = () => {
    if (pos) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    const MENU_W = 240;
    const estH = items.length * 50 + 16;
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
    setPos(window.innerHeight - r.bottom < estH + 12 && r.top > estH + 12
      ? { left, bottom: window.innerHeight - r.top + 6 }
      : { left, top: r.bottom + 6 });
  };

  // close on outside click, scroll or resize
  useEffect(() => {
    if (!pos) return undefined;
    const close = () => setPos(null);
    const onDown = (e) => { if (!btnRef.current?.contains(e.target) && !e.target.closest?.('[data-actions-menu]')) close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  return (
    <>
      <button ref={btnRef} onClick={toggle} aria-haspopup="menu" aria-expanded={!!pos}
        className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold border border-gray-300 rounded-xl px-3 min-h-[36px] bg-white hover:bg-gray-50 cursor-pointer">
        Actions <ChevronDown size={14} />
      </button>
      {pos && createPortal(
        <div role="menu" data-actions-menu style={{ position: 'fixed', zIndex: 120, width: 240, ...pos }}
          className="bg-white border border-bb-border rounded-xl shadow-xl py-1 text-left max-h-[80vh] overflow-y-auto">
          {items.map((it, i) => (it === '-'
            ? <div key={i} className="border-t border-bb-border my-1" />
            : (
              <button key={it[0] + i} role="menuitem" onClick={() => { setPos(null); onPick(it[0]); }}
                className="block w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <span className={`block text-sm font-semibold ${it[3] || 'text-bb-text'}`}>{it[1]}</span>
                <span className="block text-[11px] text-bb-muted">{it[2]}</span>
              </button>
            )))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** EventScope's UPI ID / payee / QR shown on every company's Plan & billing page */
function PaymentSettings() {
  const { platformBilling, savePlatformBilling, showToast } = useApp();
  const [open, setOpen] = useState(false);
  const isPhone = useIsPhone();
  const [f, setF] = useState({ upiId: '', payeeName: '', qr: '', supportWhatsapp: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (platformBilling) setF({ upiId: platformBilling.upiId || '', payeeName: platformBilling.payeeName || '', qr: platformBilling.qr || '', supportWhatsapp: platformBilling.supportWhatsapp || '' }); }, [platformBilling]);
  const save = async () => {
    if (f.upiId && !/^[\w.-]{2,}@[\w.-]{2,}$/.test(f.upiId.trim())) return showToast('That doesn’t look like a UPI ID (name@bank).', 'error');
    setBusy(true);
    const res = await savePlatformBilling({ upiId: f.upiId.trim(), payeeName: f.payeeName.trim(), qr: f.qr, supportWhatsapp: f.supportWhatsapp.trim() });
    setBusy(false);
    showToast(res.success ? 'Payment settings saved' : res.error, res.success ? 'success' : 'error');
  };
  const onQr = async (file) => {
    if (!file) return;
    try { setF(v => ({ ...v, qr: '' })); const data = await resizeImageFile(file, 500); setF(v => ({ ...v, qr: data })); }
    catch (e) { showToast(e.message, 'error'); }
  };
  return (
    <Card>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 text-left cursor-pointer">
        <Wallet size={18} className="text-bb-accent" />
        <span className="font-semibold text-bb-text flex-1">Payment settings <span className="hidden md:inline text-xs font-normal text-bb-muted">· your UPI ID shown on every company’s Plan & billing page</span></span>
        <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${platformBilling?.upiId ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{platformBilling?.upiId ? 'Set' : 'Not set'}</span>
        <ChevronDown size={16} className={`text-bb-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && !isPhone && (
        <div className="mt-4 pt-4 border-t border-bb-border" data-testid="payment-settings">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-4 items-end">
            <Field label="UPI ID" value={f.upiId} onChange={e => setF(v => ({ ...v, upiId: e.target.value }))} placeholder="name@bank" />
            <Field label="Payee name (shown in their UPI app)" value={f.payeeName} onChange={e => setF(v => ({ ...v, payeeName: e.target.value }))} placeholder="EventScope" />
            <div>
              <span className="block text-[12.5px] font-semibold text-gray-700 mb-1">QR image (optional)</span>
              <div className="flex items-center gap-2 h-[38px]">
                {f.qr && <img src={f.qr} alt="QR" className="w-9 h-9 object-contain border border-bb-border rounded" />}
                <label className="min-h-[36px] px-3 rounded-xl border border-gray-300 bg-white inline-flex items-center text-[13.5px] font-semibold cursor-pointer hover:bg-gray-50">
                  {f.qr ? 'Change' : 'Upload'}<input type="file" accept="image/*" className="hidden" onChange={e => onQr(e.target.files?.[0])} />
                </label>
                {f.qr && <button onClick={() => setF(v => ({ ...v, qr: '' }))} aria-label="Remove QR" className="text-red-500 hover:text-red-600 text-[13px] font-semibold cursor-pointer">Remove</button>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-4 mt-3">
            <Field label="Support WhatsApp (optional — shows a chat button on Plan & billing)" value={f.supportWhatsapp} onChange={e => setF(v => ({ ...v, supportWhatsapp: e.target.value }))} placeholder="Mobile number" inputMode="tel" />
          </div>
          <div className="flex items-center gap-4 mt-3">
            <p className="flex-1 text-[12.5px] text-bb-muted">Without a QR image, the app makes one from your UPI ID with the amount filled in. Saved in the database only — never in the code.</p>
            <HeaderText primary onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</HeaderText>
          </div>
        </div>
      )}
      {open && isPhone && (
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] items-start" data-testid="payment-settings">
          <Input label="UPI ID" value={f.upiId} onChange={e => setF(v => ({ ...v, upiId: e.target.value }))} placeholder="name@bank" />
          <Input label="Payee name (shown in their UPI app)" value={f.payeeName} onChange={e => setF(v => ({ ...v, payeeName: e.target.value }))} placeholder="EventScope" />
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-bb-text">QR image (optional)</span>
            <div className="flex items-center gap-2">
              {f.qr && <img src={f.qr} alt="QR" className="w-12 h-12 object-contain border border-bb-border rounded" />}
              <label className="text-sm font-semibold text-bb-accent cursor-pointer border border-bb-border rounded-lg px-3 py-2 bg-white">
                {f.qr ? 'Change' : 'Upload'}<input type="file" accept="image/*" className="hidden" onChange={e => onQr(e.target.files?.[0])} />
              </label>
              {f.qr && <button onClick={() => setF(v => ({ ...v, qr: '' }))} className="text-xs text-bb-muted hover:text-red-500 cursor-pointer">Remove</button>}
            </div>
          </div>
          <p className="text-xs text-bb-muted md:col-span-2">Without a QR image, the app makes one from your UPI ID with the amount filled in. Saved in the database only — never in the code.</p>
          <div className="md:text-right"><Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></div>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Admin — MAIN COMPONENT
// ============================================================

export default function Admin() {
  const { isPlatformAdmin, subscribeAllTenants, getTenantCounts, subscribeAllPayments, adminSetPilot, showToast } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [tenants, setTenants] = useState(null);   // null = loading
  const [payments, setPayments] = useState([]);   // every company's payments (incl. 'pending' claims)
  const [counts, setCounts] = useState({});       // { [tenantId]: { members, events } }
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [importOpen, setImportOpen] = useState(false);
  const [teamFor, setTeamFor] = useState(null);       // tenant whose team dialog is open
  const [dialog, setDialog] = useState(null);         // { mode, tenant } for AdminBillingDialog
  const [sheetRow, setSheetRow] = useState(null);     // phone: company whose Actions sheet is open
  const isPhone = useIsPhone();

  // ------------------------------------------------------------
  // DATA LOADING / EFFECTS
  // ------------------------------------------------------------

  // Live list of all companies, and all payments
  useEffect(() => {
    if (!isPlatformAdmin) return undefined;
    const u1 = subscribeAllTenants(setTenants, () => setTenants([]));
    const u2 = subscribeAllPayments(setPayments);
    return () => { u1(); u2(); };
  }, [isPlatformAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch counts once per tenant id
  useEffect(() => {
    (tenants || []).forEach(t => {
      if (counts[t.id]) return;
      getTenantCounts(t.id)
        .then(c => setCounts(prev => ({ ...prev, [t.id]: c })))
        .catch(() => setCounts(prev => ({ ...prev, [t.id]: { members: '—', events: '—' } })));
    });
  }, [tenants]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------
  const today = todayIST();
  const rows = useMemo(() => (tenants || []).map(t => {
    const mine = payments.filter(p => p.tenantId === t.id);
    const pending = mine.find(p => p.id === 'pending') || null;
    const paid = mine.filter(p => p.id !== 'pending');
    const info = accessInfo(t, today, !!pending);
    return {
      t, pending, info,
      status: adminStatus(t, info, fmt, today),
      collected: paid.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    };
  }), [tenants, payments, today]);

  const list = useMemo(() => rows
    .filter(r => matchesFilter(filter, r))
    .filter(({ t }) => {
      const q = search.trim().toLowerCase();
      return !q || [t.name, t.ownerEmail, t.id].some(v => (v || '').toLowerCase().includes(q));
    })
    .sort((a, b) => (b.t.createdAt || '').localeCompare(a.t.createdAt || '')), [rows, search, filter]);

  const summary = useMemo(() => {
    const confirmed = payments.filter(p => p.id !== 'pending' && p.status === 'confirmed');
    const month = today.slice(0, 7);
    const fy = fyStart(today);
    const paidOn = (p) => String(p.paidOn || p.confirmedAt || '').slice(0, 10);
    const monthList = confirmed.filter(p => paidOn(p).startsWith(month));
    const fyList = confirmed.filter(p => fyStart(paidOn(p)) === fy);
    const waiting = rows.filter(r => r.pending);
    const due = rows.filter(r => !r.pending && r.info.phase === 'grace');
    return {
      total: rows.length,
      active: rows.filter(r => !r.info.readOnly).length,
      readOnly: rows.filter(r => r.info.readOnly).length,
      newThisWeek: rows.filter(r => isNew(r.t)).length,
      month: monthList.reduce((s, p) => s + (Number(p.amount) || 0), 0), monthCount: monthList.length,
      fy: fyList.reduce((s, p) => s + (Number(p.amount) || 0), 0), fyCount: fyList.length,
      waiting, due,
    };
  }, [rows, payments, today]);

  // Older pilot companies made before pilot dates existed
  const undated = rows.filter(r => (r.t.plan || 'trial') === 'trial' && !isDate(r.t.accessUntil));

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const open = (mode, row) => setDialog({ mode, tenant: { ...row.t, pending: row.pending } });

  // Older pilot companies (made before pilot dates existed) get their pilot
  // automatically: from their sign-up date, the default length, auto-suspend on.
  const backfilled = useRef(new Set());
  useEffect(() => {
    const todo = undated.filter(r => !backfilled.current.has(r.t.id));
    if (!todo.length) return;
    todo.forEach(r => backfilled.current.add(r.t.id));
    (async () => {
      let done = 0;
      for (const r of todo) {
        const created = String(r.t.createdAt || '').slice(0, 10);
        const res = await adminSetPilot(r.t, { start: isDate(created) ? created : today, length: DEFAULT_PILOT.length, unit: DEFAULT_PILOT.unit, autoSuspend: true, extended: false });
        if (res.success) done++;
      }
      if (done) showToast(`Pilot dates set from sign-up for ${done} compan${done === 1 ? 'y' : 'ies'}`);
    })();
  }, [undated.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phones: "Only you see this" under the title, Import in the bar
  usePhoneHeader({
    sub: <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold bg-white/15 text-[#e6dbf5] rounded-full px-2.5 py-0.5"><Lock size={12} />Only you see this</span>,
    right: isPlatformAdmin ? <HeaderIconButton icon={Upload} label="Import company" onClick={() => setImportOpen(true)} data-testid="admin-import" /> : null,
  }, [isPlatformAdmin]);

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  if (!isPlatformAdmin) {
    return (
      <Card>
        <div className="text-center py-10">
          <Lock size={36} className="mx-auto text-bb-muted mb-3" />
          <p className="font-semibold text-bb-text">This page is for EventScope admins</p>
        </div>
      </Card>
    );
  }

  const pill = (s) => <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${TONE[s.tone]}`}>{s.label}</span>;

  // ------------------------------------------------------------
  // RENDER — PHONE
  // ------------------------------------------------------------
  if (isPhone) {
    const due = (r) => !!r.pending || r.info.phase === 'grace';
    const phoneStat = (label, value, sub, extra) => (
      <div className="bg-white border border-bb-border rounded-2xl px-4 py-3.5" key={label}>
        <p className="text-[13px] text-gray-600">{label}</p>
        <p className="text-[22px] font-extrabold tabular-nums">{tenants ? value : '…'}</p>
        {extra || <p className="text-[12.5px] text-gray-600">{sub}</p>}
      </div>
    );
    return (
      <div data-testid="admin-phone">
        <ImportCompanyDialog isOpen={importOpen} onClose={() => setImportOpen(false)} />
        <AdminTeamDialog tenant={teamFor} onClose={() => setTeamFor(null)} />
        <AdminBillingDialog mode={dialog?.mode} tenant={dialog?.tenant || null} onClose={() => setDialog(null)} />

        {/* Filter chips with counts, and search — pinned */}
        <StickyBar className="!py-3 space-y-2.5">
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1" data-testid="admin-chips">
            {FILTERS.map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}
                className={`shrink-0 whitespace-nowrap min-h-[40px] px-3.5 rounded-full border text-[14px] font-semibold cursor-pointer ${filter === key ? 'bg-bb-accent border-bb-accent text-white' : 'bg-white border-gray-300'}`}>
                {label} <span className={filter === key ? 'text-white/80' : 'text-bb-muted'}>{rows.filter(r => matchesFilter(key, r)).length}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 bg-white border border-gray-300 rounded-xl px-3 min-h-[44px]">
            <Search size={18} className="text-bb-muted shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company or owner email" className="flex-1 min-w-0 outline-none text-[16px] bg-transparent" />
          </label>
        </StickyBar>

        <div className="space-y-4 mt-1">
          <div className="grid grid-cols-2 gap-3" data-testid="collections">
            {phoneStat('Companies', summary.total, `${summary.newThisWeek} new · ${summary.active} active · ${summary.due.length} due`)}
            {phoneStat('This month', rupees(summary.month), `${summary.monthCount} payment${summary.monthCount === 1 ? '' : 's'}`)}
            {phoneStat('This year (FY)', rupees(summary.fy), `${summary.fyCount} payment${summary.fyCount === 1 ? '' : 's'}`)}
            {phoneStat('Waiting to confirm', summary.waiting.length, '', summary.waiting.length
              ? <button onClick={() => open('payment', summary.waiting[0])} className="text-[12.5px] font-semibold text-bb-accent-hover cursor-pointer" data-testid="review-payment">Review payment</button>
              : <p className="text-[12.5px] text-gray-600">Nothing waiting</p>)}
          </div>

          <SectionLabel>Companies · {list.length}</SectionLabel>
          {tenants === null || list.length === 0 ? (
            <div className="bg-white border border-bb-border rounded-2xl text-center py-10 text-gray-600 text-[14px]">{tenants === null ? 'Loading companies…' : 'No companies match.'}</div>
          ) : list.map(row => {
            const { t, status } = row;
            const c = counts[t.id];
            return (
              <div key={t.id} className="bg-white border border-bb-border rounded-2xl p-4" data-testid="admin-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-[16px] flex items-center gap-2 flex-wrap">
                      {t.name || t.id}
                      {isNew(t) && <span className="text-[10px] font-bold bg-violet-100 text-violet-700 rounded-full px-1.5">NEW</span>}
                    </p>
                    <p className="text-[13px] text-gray-600 truncate">{t.ownerEmail || t.id}</p>
                  </div>
                  {pill(status)}
                </div>
                <div className="grid grid-cols-3 gap-2 my-3 text-[12.5px] text-gray-600">
                  <div>Plan<b className="block text-[14.5px] text-bb-text">{planName(t.plan)}{t.plan && t.plan !== 'trial' && t.cycle ? ` · ${t.cycle}` : ''}{wants(t) && <span className="block text-[11.5px] font-semibold text-violet-700">Wants {planName(t.interestedPlan)}</span>}</b></div>
                  <div>Events<b className="block text-[14.5px] text-bb-text tabular-nums">{c ? c.events : '…'}</b></div>
                  <div>Collected<b className="block text-[14.5px] text-bb-text tabular-nums">{rupees(row.collected)}</b></div>
                </div>
                <p className="text-[13px] text-bb-text">
                  {status.sub ? `${status.sub} · ` : ''}
                  <button onClick={() => setTeamFor(t)} className="font-semibold text-bb-accent-hover cursor-pointer" data-testid="admin-team">Team {c ? c.members : '…'}</button>
                </p>
                <div className="flex items-center justify-end gap-2.5 mt-3">
                  {due(row) && (
                    <button onClick={() => open('payment', row)} className="flex-1 min-h-[44px] rounded-xl bg-bb-accent text-white font-bold text-[14.5px] cursor-pointer" data-testid="admin-primary">
                      {row.pending ? 'Confirm payment' : 'Record payment'}
                    </button>
                  )}
                  <button onClick={() => setSheetRow(row)} className="w-[130px] shrink-0 min-h-[44px] rounded-xl border border-gray-300 bg-white font-semibold text-[14.5px] inline-flex items-center justify-center gap-1.5 cursor-pointer" data-testid="admin-actions">
                    Actions <ChevronDown size={16} />
                  </button>
                </div>
              </div>
            );
          })}
          <PaymentSettings />
        </div>

        {sheetRow && (
          <BottomSheet open onClose={() => setSheetRow(null)} title={sheetRow.t.name || sheetRow.t.id}
            sub={`${planName(sheetRow.t.plan)}${sheetRow.t.plan && sheetRow.t.plan !== 'trial' && sheetRow.t.cycle ? ` · ${sheetRow.t.cycle}` : ''} · ${sheetRow.status.label.toLowerCase()}`} testId="admin-actions-sheet">
            {actionItems(sheetRow).filter(it => it !== '-').map(it => (
              <MenuRow key={it[0]} icon={it[4]} title={it[1]} sub={it[2]} tone={it[5]} chevron={false} testId={`admin-act-${it[0]}`}
                onClick={() => { const r = sheetRow; setSheetRow(null); open(it[0], r); }} />
            ))}
          </BottomSheet>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------
  // RENDER — LAPTOP
  // ------------------------------------------------------------
  const countOf = (key) => rows.filter(r => matchesFilter(key, r)).length;
  const th = 'py-2.5 px-3 text-[11px] font-bold uppercase tracking-[0.06em] text-bb-muted bg-[#f6f6f9]';
  return (
    <div className="space-y-4 pb-8" data-testid="admin-laptop">
      <PageHeader title={<span className="inline-flex items-center gap-2.5">EventScope Admin <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-bb-muted bg-white border border-bb-border rounded-full px-2.5 py-0.5"><Lock size={11} />Only you see this</span></span>}
        actions={<HeaderText icon={Upload} onClick={() => setImportOpen(true)} data-testid="admin-import">Import company</HeaderText>} />
      <ImportCompanyDialog isOpen={importOpen} onClose={() => setImportOpen(false)} />
      <AdminTeamDialog tenant={teamFor} onClose={() => setTeamFor(null)} />
      <AdminBillingDialog mode={dialog?.mode} tenant={dialog?.tenant || null} onClose={() => setDialog(null)} />

      {/* Pinned: filters with counts, search on the right */}
      <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2 bg-bb-bg">
        <div className="flex items-center gap-3 bg-white border border-bb-border rounded-2xl px-3 py-2" data-testid="admin-filters">
          <Seg label="Companies" value={filter} onChange={setFilter} testId="admin-filter"
            options={FILTERS.map(([key, label]) => ({ value: key, label: <>{label} <span className="ml-0.5 text-[11.5px] opacity-70 tabular-nums">{tenants ? countOf(key) : ''}</span></> }))} />
          <span className="flex-1" />
          <label className="flex items-center gap-2 border border-bb-border rounded-xl bg-bb-input px-3 h-[38px] w-[300px]">
            <Search size={15} className="text-bb-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company or owner email" aria-label="Search companies" className="flex-1 outline-none text-[13.5px] bg-transparent" />
          </label>
        </div>
      </div>

      {/* One row of four quiet cards */}
      <StatRow items={[
        { label: 'Companies', value: tenants ? summary.total : '…', hint: `${summary.newThisWeek} new this week · ${summary.active} active · ${summary.due.length} payment due` },
        { label: 'Collected this month', value: rupees(summary.month), hint: `${summary.monthCount} payment${summary.monthCount === 1 ? '' : 's'}` },
        { label: 'Collected this year (FY)', value: rupees(summary.fy), hint: `${summary.fyCount} payment${summary.fyCount === 1 ? '' : 's'}` },
        { label: 'Waiting to confirm', value: summary.waiting.length, tone: summary.waiting.length ? 'accent' : undefined,
          hint: summary.waiting.length ? <button onClick={() => setFilter('action')} className="font-semibold text-bb-accent-hover hover:underline cursor-pointer" data-testid="review-payment">Review payment</button> : 'Nothing waiting' },
      ]} />

      {tenants === null || list.length === 0 ? (
        <div className="bg-white border border-bb-border rounded-2xl"><p className="text-[14px] text-bb-muted text-center py-10">{tenants === null ? 'Loading companies…' : 'No companies match.'}</p></div>
      ) : (
        <div className="bg-white border border-bb-border rounded-2xl overflow-x-auto" data-testid="admin-table">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-bb-border text-left">
                <th className={th}>Company</th><th className={th}>Signed up</th><th className={th}>Plan</th><th className={th}>Team</th>
                <th className={`${th} text-right`}>Events</th><th className={th}>Status</th><th className={`${th} text-right`}>Collected</th><th className={th} />
              </tr>
            </thead>
            <tbody>
              {list.map(row => {
                const { t, status } = row;
                const c = counts[t.id];
                return (
                  <tr key={t.id} className="border-b border-gray-100 last:border-0 align-top">
                    <td className="py-3 px-3">
                      <div className="font-bold text-bb-text flex items-center gap-2">{t.name || t.id}{isNew(t) && <span className="text-[10px] font-bold bg-violet-100 text-violet-700 rounded-full px-1.5">NEW</span>}</div>
                      <div className="text-[12px] text-bb-muted">{t.ownerEmail || t.id}</div>
                    </td>
                    <td className="py-3 px-3 text-gray-600 whitespace-nowrap">{t.createdAt ? formatDateReadable(t.createdAt) : '—'}</td>
                    <td className="py-3 px-3 whitespace-nowrap">{planName(t.plan)}{t.plan && t.plan !== 'trial' && t.cycle && <span className="text-[12px] text-bb-muted"> · {t.cycle}</span>}{wants(t) && <span className="block text-[11.5px] font-semibold text-violet-700">Wants {planName(t.interestedPlan)}</span>}</td>
                    <td className="py-3 px-3 whitespace-nowrap tabular-nums">{c ? c.members : '…'} <button onClick={() => setTeamFor(t)} title="View / manage team" className="ml-1 text-bb-accent-hover font-semibold hover:underline cursor-pointer">Manage</button></td>
                    <td className="py-3 px-3 text-right tabular-nums">{c ? c.events : '…'}</td>
                    <td className="py-3 px-3">{pill(status)}{status.sub && <div className="text-[11.5px] text-bb-muted mt-1 max-w-[150px]">{status.sub}</div>}</td>
                    <td className="py-3 px-3 text-right font-bold tabular-nums">{rupees(row.collected)}</td>
                    <td className="py-3 px-3 text-right whitespace-nowrap"><ActionsMenu row={row} onPick={(m) => open(m, row)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PaymentSettings />
    </div>
  );
}
