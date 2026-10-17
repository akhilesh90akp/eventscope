/**
 * Admin — EventScope platform admin console
 *
 * Visible only to logins listed in platformAdmins/{uid} (added by hand in the
 * Firebase console). Lists every company (tenant) with plan, status (pilot,
 * paid, payment due, suspended…), team size, events and money collected.
 * Actions ▾ per company: confirm/record a payment, set/extend the pilot,
 * change plan, suspend, reactivate, history (components/AdminBillingDialog).
 * Also: collections cards, EventScope's UPI payment settings, setting pilot
 * dates for older companies, managing a company's team (support), and
 * importing a company from a backup. firestore.rules enforce all of this server-side; hiding the
 * menu item is just for a clean UI.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import ImportCompanyDialog from '../components/ImportCompanyDialog';
import AdminTeamDialog from '../components/AdminTeamDialog';
import AdminBillingDialog from '../components/AdminBillingDialog';
import Input from '../components/Input';
import Button from '../components/Button';
import { formatDateReadable, resizeImageFile } from '../utils/helpers';
import { Shield, Search, Lock, Upload, ChevronDown, Wallet } from 'lucide-react';
import { useConfirm } from '../components/ConfirmDialog';
import { accessInfo, adminStatus, planName, todayIST, isDate, DEFAULT_PILOT, periodEnd, GRACE_DAYS, addDays } from '../utils/billing';
import { fyStart } from '../utils/purchases';

// ============================================================
// HELPERS
// ============================================================
const DAY = 24 * 60 * 60 * 1000;
const isNew = (t) => t.createdAt && Date.now() - new Date(t.createdAt).getTime() < 7 * DAY;
const rupees = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const fmt = (iso) => (isDate(iso) ? formatDateReadable(`${iso}T00:00:00`) : '');
const TONE = {
  violet: 'bg-violet-100 text-violet-700', emerald: 'bg-emerald-100 text-emerald-700', amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700', gray: 'bg-gray-200 text-gray-700',
};
const FILTERS = [['all', 'All'], ['pilot', 'Pilot'], ['paid', 'Paid'], ['action', 'Needs action'], ['readonly', 'Read-only']];

/** Actions ▾ — a small menu; picking an item opens its pop-up */
function ActionsMenu({ row, onPick }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const t = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', close); };
  }, [open]);
  const items = [
    row.pending && ['payment', '✓ Confirm payment', `${rupees(row.pending.amount)} · ref ${row.pending.ref}`, 'text-emerald-700'],
    !row.pending && ['payment', 'Record payment', 'Paid you some other way', ''],
    ['pilot', row.t.plan === 'trial' && row.t.accessUntil ? 'Extend pilot' : 'Set pilot', 'Days or months, auto-suspend', ''],
    ['plan', 'Change plan', 'Free pilot / Basic / Standard / Premium', ''],
    '-',
    row.info.readOnly || row.info.phase === 'grace' ? ['reactivate', 'Reactivate', 'Switch editing back on', 'text-emerald-700'] : null,
    row.info.phase !== 'suspended' ? ['suspend', 'Suspend', 'Make read-only now', 'text-amber-700'] : null,
    ['history', 'History', 'Everything that happened', ''],
  ].filter(Boolean);
  return (
    <div className="relative inline-block text-left">
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        className="inline-flex items-center gap-1 text-sm font-semibold border border-bb-border rounded-lg px-2.5 py-1.5 bg-white hover:border-bb-accent cursor-pointer">
        Actions <ChevronDown size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1.5 w-60 bg-white border border-bb-border rounded-xl shadow-xl py-1 text-left">
          {items.map((it, i) => (it === '-'
            ? <div key={i} className="border-t border-bb-border my-1" />
            : (
              <button key={it[0] + i} role="menuitem" onClick={() => { setOpen(false); onPick(it[0]); }}
                className="block w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <span className={`block text-sm font-semibold ${it[3] || 'text-bb-text'}`}>{it[1]}</span>
                <span className="block text-[11px] text-bb-muted">{it[2]}</span>
              </button>
            )))}
        </div>
      )}
    </div>
  );
}

/** EventScope's UPI ID / payee / QR shown on every company's Plan & billing page */
function PaymentSettings() {
  const { platformBilling, savePlatformBilling, showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ upiId: '', payeeName: '', qr: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (platformBilling) setF({ upiId: platformBilling.upiId || '', payeeName: platformBilling.payeeName || '', qr: platformBilling.qr || '' }); }, [platformBilling]);
  const save = async () => {
    if (f.upiId && !/^[\w.-]{2,}@[\w.-]{2,}$/.test(f.upiId.trim())) return showToast('That doesn’t look like a UPI ID (name@bank).', 'error');
    setBusy(true);
    const res = await savePlatformBilling({ upiId: f.upiId.trim(), payeeName: f.payeeName.trim(), qr: f.qr });
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
        <span className="font-semibold text-bb-text flex-1">Payment settings <span className="text-xs font-normal text-bb-muted">· your UPI ID shown on every company’s Plan & billing page</span></span>
        <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${platformBilling?.upiId ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{platformBilling?.upiId ? 'Set' : 'Not set'}</span>
        <ChevronDown size={16} className={`text-bb-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
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
  const confirm = useConfirm();

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
  const [backfilling, setBackfilling] = useState(false);

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
    .filter(({ t, info, pending }) => {
      if (filter === 'pilot') return info.kind === 'pilot' || (t.plan || 'trial') === 'trial';
      if (filter === 'paid') return (t.plan || 'trial') !== 'trial';
      if (filter === 'action') return !!pending || info.phase === 'grace' || info.phase === 'ending';
      if (filter === 'readonly') return info.readOnly;
      return true;
    })
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

  /** Give older pilot companies dates: from their sign-up date, default length */
  const backfillPilots = async () => {
    const plan = undated.map(r => {
      const start = String(r.t.createdAt || '').slice(0, 10) || today;
      const end = periodEnd(isDate(start) ? start : today, DEFAULT_PILOT.length, DEFAULT_PILOT.unit);
      return { r, start: isDate(start) ? start : today, end, blocked: addDays(end, GRACE_DAYS) < today };
    });
    const blocked = plan.filter(p => p.blocked);
    const ok = await confirm({
      title: `Set pilot dates for ${plan.length} compan${plan.length === 1 ? 'y' : 'ies'}?`,
      message: `${DEFAULT_PILOT.length} ${DEFAULT_PILOT.unit} from each sign-up date, auto-suspend on.`,
      note: blocked.length ? `${blocked.map(p => p.r.t.name || p.r.t.id).join(', ')} signed up long ago — they’d turn read-only straight away. You can extend them after.` : undefined,
      confirmLabel: 'Set dates', tone: blocked.length ? 'warning' : 'primary',
    });
    if (!ok) return;
    setBackfilling(true);
    let fails = 0;
    for (const p of plan) {
      const res = await adminSetPilot(p.r.t, { start: p.start, length: DEFAULT_PILOT.length, unit: DEFAULT_PILOT.unit, autoSuspend: true, extended: false });
      if (!res.success) fails++;
    }
    setBackfilling(false);
    showToast(fails ? `${fails} couldn’t be saved — try again` : 'Pilot dates set', fails ? 'error' : 'success');
  };

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
  const stat = (label, value, cls, sub) => (
    <Card key={label}>
      <p className="text-xs text-bb-muted">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold ${cls}`}>{tenants ? value : '…'}</p>
      {sub && <p className="text-[10px] text-bb-muted truncate">{sub}</p>}
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield size={20} className="text-bb-accent" />
        <h1 className="text-xl font-bold text-bb-text">EventScope Admin</h1>
        <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 rounded-full px-2 py-0.5">Only you see this</span>
        <button onClick={() => setImportOpen(true)} aria-label="Import company" title="Import company"
          className="ml-auto flex items-center gap-2 p-2 sm:px-3 bg-white border border-bb-border rounded-lg text-sm font-semibold text-bb-text hover:border-bb-accent cursor-pointer">
          <Upload size={16} className="text-bb-accent" /> <span className="hidden sm:inline">Import company</span>
        </button>
      </div>
      <ImportCompanyDialog isOpen={importOpen} onClose={() => setImportOpen(false)} />
      <AdminTeamDialog tenant={teamFor} onClose={() => setTeamFor(null)} />
      <AdminBillingDialog mode={dialog?.mode} tenant={dialog?.tenant || null} onClose={() => setDialog(null)} />

      {/* Companies + collections */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stat('Companies', summary.total, 'text-bb-text', `${summary.newThisWeek} new this week`)}
        {stat('Active', summary.active, 'text-emerald-600')}
        {stat('Read-only', summary.readOnly, 'text-amber-600')}
        {stat('Payment due', summary.due.length, 'text-rose-600', summary.due.map(r => r.t.name || r.t.id).join(', '))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="collections">
        {stat('Collected this month', rupees(summary.month), 'text-bb-text', `${summary.monthCount} payment${summary.monthCount === 1 ? '' : 's'}`)}
        {stat('Collected this year (FY)', rupees(summary.fy), 'text-bb-text', `${summary.fyCount} payment${summary.fyCount === 1 ? '' : 's'}`)}
        {stat('Waiting to confirm', summary.waiting.length, 'text-violet-700', summary.waiting.map(r => `${r.t.name || r.t.id} · ${rupees(r.pending.amount)}`).join(', '))}
      </div>

      {undated.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900" data-testid="undated-pilots">
          <span className="flex-1 min-w-[200px]"><b>{undated.length} pilot compan{undated.length === 1 ? 'y has' : 'ies have'} no dates yet</b> — they won’t auto-suspend until you set them ({DEFAULT_PILOT.length} {DEFAULT_PILOT.unit} from sign-up).</span>
          <Button size="sm" onClick={backfillPilots} disabled={backfilling}>{backfilling ? 'Setting…' : 'Set dates from sign-up'}</Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 bg-white border border-bb-border rounded-lg px-3 py-2 basis-full sm:basis-auto flex-1 min-w-0 sm:min-w-[220px]">
          <Search size={16} className="text-bb-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company or owner email" className="flex-1 outline-none text-sm bg-transparent" />
        </div>
        {FILTERS.map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-3 py-2 text-sm rounded-lg cursor-pointer ${filter === key ? 'bg-bb-accent text-white' : 'bg-white border border-bb-border text-bb-muted'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Companies — cards on phones (the table is too wide), table from tablet up */}
      {tenants === null || list.length === 0 ? (
        <Card>
          <p className="text-sm text-bb-muted text-center py-8">{tenants === null ? 'Loading companies…' : 'No companies match.'}</p>
        </Card>
      ) : (
      <>
      <div className="md:hidden space-y-3">
        {list.map(row => {
          const { t, status } = row;
          const c = counts[t.id];
          return (
            <Card key={t.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-bb-text flex items-center gap-2 flex-wrap">
                    {t.name || t.id}
                    {isNew(t) && <span className="text-[10px] font-bold bg-violet-100 text-violet-700 rounded-full px-1.5">NEW</span>}
                  </p>
                  <p className="text-xs text-bb-muted truncate">{t.ownerEmail || t.id}</p>
                </div>
                {pill(status)}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-bb-muted my-3">
                <div>Plan<p className="text-sm text-bb-text">{planName(t.plan)}{t.plan && t.plan !== 'trial' && t.cycle ? ` · ${t.cycle}` : ''}</p></div>
                <div>Team · Events<p className="text-sm text-bb-text">{c ? `${c.members} · ${c.events}` : '…'}</p></div>
                <div>Collected<p className="text-sm text-bb-text font-semibold">{rupees(row.collected)}</p></div>
              </div>
              {status.sub && <div className="text-xs text-bb-text bg-gray-50 rounded-lg px-3 py-2 mb-3">{status.sub}</div>}
              <div className="flex items-center gap-2">
                <button onClick={() => setTeamFor(t)} className="text-sm font-semibold text-bb-accent px-1 py-1.5 cursor-pointer">Manage team</button>
                <span className="ml-auto"><ActionsMenu row={row} onPick={(m) => open(m, row)} /></span>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="hidden md:block">
        <div className="overflow-x-auto pb-24 -mb-24">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bb-border text-left text-xs text-bb-muted uppercase tracking-wide">
                <th className="py-2 px-2">Company</th>
                <th className="py-2 px-2">Signed up</th>
                <th className="py-2 px-2">Plan</th>
                <th className="py-2 px-2 text-right">Team</th>
                <th className="py-2 px-2 text-right">Events</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2 text-right">Collected</th>
                <th className="py-2 px-2" />
              </tr>
            </thead>
            <tbody>
              {list.map(row => {
                const { t, status } = row;
                const c = counts[t.id];
                return (
                  <tr key={t.id} className="border-b border-bb-border/60 last:border-0 align-top">
                    <td className="py-2.5 px-2">
                      <div className="font-semibold text-bb-text flex items-center gap-2">
                        {t.name || t.id}
                        {isNew(t) && <span className="text-[10px] font-bold bg-violet-100 text-violet-700 rounded-full px-1.5">NEW</span>}
                      </div>
                      <div className="text-xs text-bb-muted">{t.ownerEmail || t.id}</div>
                    </td>
                    <td className="py-2.5 px-2 text-bb-muted whitespace-nowrap">{t.createdAt ? formatDateReadable(t.createdAt) : '—'}</td>
                    <td className="py-2.5 px-2 whitespace-nowrap">{planName(t.plan)}{t.plan && t.plan !== 'trial' && t.cycle && <span className="text-xs text-bb-muted"> · {t.cycle}</span>}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">
                      <button onClick={() => setTeamFor(t)} title="View / manage team" className="text-bb-accent font-semibold hover:underline cursor-pointer">
                        {c ? c.members : '…'} · Manage
                      </button>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{c ? c.events : '…'}</td>
                    <td className="py-2.5 px-2">{pill(status)}{status.sub && <div className="text-[11px] text-bb-muted mt-1">{status.sub}</div>}</td>
                    <td className="py-2.5 px-2 text-right font-semibold tabular-nums">{rupees(row.collected)}</td>
                    <td className="py-2.5 px-2 text-right whitespace-nowrap"><ActionsMenu row={row} onPick={(m) => open(m, row)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      </>
      )}

      <PaymentSettings />
    </div>
  );
}
