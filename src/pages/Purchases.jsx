/**
 * Purchases — things bought for the business and used across many events
 * (chairs, lights, a generator…), by financial year (April–March).
 *
 * Owner only, like Reports (staff don't see it in the menu; the rules refuse
 * them too). Laptops get a table with edit/delete icons; phones get fold-open
 * rows. Add / Edit happen in components/PurchaseDialog.jsx; Download Excel
 * saves the selected year. Purchases never change an event's profit in the
 * Job Log — Reports shows "Profit after purchases" separately.
 *
 * Phones: ‹ year › switcher and "Add purchase" pinned at the top (a long list never
 * pushes it down), Excel in the title bar, ✎ / 🗑 as icons in an open row.
 *
 * Data: tenants/{id}/purchases (see utils/purchases.js).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useMemo, useState } from 'react';
import { Plus, Download, Edit3, Trash2, ChevronDown, ChevronUp, Lock, ShoppingBag } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import StickyBar from '../components/StickyBar';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import PurchaseDialog from '../components/PurchaseDialog';
import { useConfirm } from '../components/useConfirm';
import { formatRupees, formatDateReadable } from '../utils/helpers';
import {
  fyStart, fyLabel, fyRange, purchaseYears, purchasesBetween, summarizePurchases,
  sortPurchases, eventProfitBetween, exportPurchasesToExcel,
} from '../utils/purchases';
import UpgradeCard from '../components/UpgradeCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useIsPhone } from '../components/useIsPhone';
import { usePhoneHeader } from '../components/phoneScreens';
import { HeaderIconButton } from '../components/PhoneHeader';
import { IconButton } from '../components/PhoneUI';

// ============================================================
// HELPERS
// ============================================================
const rupees = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const titleOf = (p) => (p.mode === 'total' ? (p.note || 'Purchases (total)') : p.name);

/** Grey "Total only" tag, or the category in purple */
function CategoryTag({ p }) {
  return p.mode === 'total'
    ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 whitespace-nowrap">Total only</span>
    : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 whitespace-nowrap">{p.category || 'Other'}</span>;
}

// ============================================================
// Purchases — MAIN COMPONENT
// ============================================================
export default function Purchases() {
  const { purchases, purchasesLoaded, deletePurchase, events, financials, jobLogColumns, isOwner, settings, showToast, canUse } = useApp();
  const confirm = useConfirm();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const years = useMemo(() => purchaseYears(purchases), [purchases]);
  const [year, setYear] = useState(() => fyStart(new Date().toISOString().slice(0, 10)));
  const [dialog, setDialog] = useState(null);    // null | { editing: purchase|null }
  const [openId, setOpenId] = useState(null);    // phone: which row is open
  const [busy, setBusy] = useState(false);
  const isPhone = useIsPhone();

  // ------------------------------------------------------------
  // DERIVED
  // ------------------------------------------------------------
  const [from, to] = fyRange(year);
  const list = useMemo(() => sortPurchases(purchasesBetween(purchases, from, to)), [purchases, from, to]);
  const sum = useMemo(() => summarizePurchases(list), [list]);
  const profit = useMemo(() => eventProfitBetween(events, financials, jobLogColumns, from, to), [events, financials, jobLogColumns, from, to]);
  const afterPurchases = profit.profit - sum.total;

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const askDelete = async (p) => {
    const ok = await confirm({
      title: 'Delete this purchase?',
      message: `${titleOf(p)} — ${rupees(p.amount)} on ${formatDateReadable(p.date)}.`,
      note: 'This can’t be undone.',
      confirmLabel: 'Delete', tone: 'danger',
    });
    if (ok && (await deletePurchase(p.id)).success) showToast('Purchase deleted');
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      const name = `${settings.companyName ? `${settings.companyName} ` : ''}Purchases ${fyLabel(year)}`;
      // plain hyphen in the file name (some browsers drop names with an en dash)
      await exportPurchasesToExcel(list, { title: `${name} (Apr–Mar)`, fileName: `${name.replace(/–/g, '-')}.xlsx` });
    } catch (err) {
      console.error('Purchases Excel failed:', err);
      showToast('Couldn’t make the Excel file — please try again.', 'error');
    }
    setBusy(false);
  };

  // Phones: Excel download in the title bar
  usePhoneHeader({
    right: isOwner && canUse('purchases')
      ? <HeaderIconButton icon={Download} label="Download Excel" onClick={handleDownload} disabled={busy || !list.length} data-testid="purchases-excel" />
      : null,
  }, [busy, list.length, year, isOwner]);

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  if (isOwner && !canUse('purchases')) {
    return <UpgradeCard feature="purchases" text="Keep track of chairs, lights and everything else you buy for the business, year by year." />;
  }
  if (!isOwner) {
    return (
      <Card>
        <div className="text-center py-10">
          <Lock size={36} className="mx-auto text-bb-muted mb-3" />
          <p className="font-semibold text-bb-text">Purchases are only visible to the account owner</p>
        </div>
      </Card>
    );
  }

  const stat = (label, value, cls = 'text-bb-text', sub = '') => (
    <Card>
      <p className="text-xs text-bb-muted">{label}</p>
      <p className={`text-lg sm:text-xl font-bold truncate tabular-nums mt-0.5 ${cls}`}>{value}</p>
      {sub && <p className="text-[12px] text-bb-muted mt-1 max-lg:text-[12.5px] max-lg:text-gray-600">{sub}</p>}
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* === PHONE: ‹ year ›, then Add purchase (always at the top) === */}
      {isPhone && (
        <StickyBar className="!py-3 space-y-3" testId="purchases-sticky">
          <div className="flex items-center gap-2">
            <IconButton icon={ChevronLeft} label="Previous year" onClick={() => setYear(y => y - 1)} disabled={year <= Math.min(...years)} />
            <span className="flex-1 min-h-[44px] flex items-center justify-center rounded-xl border border-bb-border bg-white font-bold text-[15.5px]" data-testid="fy-label">{fyLabel(year)} (Apr–Mar)</span>
            <IconButton icon={ChevronRight} label="Next year" onClick={() => setYear(y => y + 1)} disabled={year >= Math.max(...years)} />
          </div>
          <Button icon={Plus} fullWidth size="lg" onClick={() => setDialog({ editing: null })}>Add purchase</Button>
        </StickyBar>
      )}

      {/* === HEADER (laptop) === */}
      {!isPhone && (
        <PageHeader title="Purchases"
          actions={<>
            <select value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Financial year"
              className="min-h-[40px] bg-white border border-bb-border rounded-lg px-3 text-sm font-semibold text-bb-text cursor-pointer">
              {years.map(y => <option key={y} value={y}>{fyLabel(y).replace('FY ', '')} (Apr–Mar)</option>)}
            </select>
            <Button variant="secondary" icon={Download} onClick={handleDownload} disabled={busy || !list.length}>
              {busy ? 'Preparing…' : 'Download Excel'}
            </Button>
            <Button icon={Plus} onClick={() => setDialog({ editing: null })}>Add purchase</Button>
          </>} />
      )}
      <p className="text-sm text-bb-muted -mt-1 max-lg:text-[13.5px] max-lg:text-gray-600 max-lg:mt-0">
        Things you buy for the business and use across many events — chairs, lights, a generator. Not part of any one event’s costs in the Job Log.
      </p>

      {/* === SUMMARY CARDS === */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stat('Spent this year', formatRupees(sum.total))}
        {stat('Entries', sum.count)}
        {stat('Biggest category', sum.biggestCategory ? sum.biggestCategory.name : '—', 'text-bb-text', sum.biggestCategory ? rupees(sum.biggestCategory.amount) : '')}
        {profit.completed > 0 && profit.profitEvents / profit.completed >= 0.8
          ? stat('Profit after purchases', formatRupees(afterPurchases), afterPurchases >= 0 ? 'text-emerald-500' : 'text-rose-600', `Event profit ${rupees(profit.profit)} − purchases`)
          : stat('Profit after purchases', '—', 'text-bb-muted', `Shows once most events have expenses added (${profit.profitEvents} of ${profit.completed} now)`)}
      </div>

      {!purchasesLoaded ? (
        <p className="text-sm text-bb-muted">Loading…</p>
      ) : list.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <ShoppingBag size={40} className="mx-auto text-bb-muted mb-3" />
            <p className="text-bb-muted">No purchases in {fyLabel(year)} yet.</p>
          </div>
        </Card>
      ) : (
        <>
          {/* === PHONE: fold-open rows === */}
          <div className="md:hidden space-y-2" data-testid="purchases-phone">
            {list.map(p => {
              const on = openId === p.id;
              return (
                <div key={p.id} className={`rounded-lg overflow-hidden transition-all ${on ? 'border-l-4 border-l-bb-accent border border-bb-accent/30 bg-bb-accent/5 shadow-sm' : 'border border-bb-border bg-white'}`}>
                  <button onClick={() => setOpenId(on ? null : p.id)}
                    className={`w-full flex items-center gap-2 px-4 py-3.5 text-left cursor-pointer ${on ? 'bg-bb-accent/10' : 'hover:bg-bb-card-hover'}`}>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-semibold text-bb-text truncate">{titleOf(p)}</span>
                      <span className="block text-[13px] text-gray-600 mt-0.5">{formatDateReadable(p.date)}{p.mode !== 'total' && p.category ? ` · ${p.category}` : ''}</span>
                    </span>
                    <b className="text-[15px] tabular-nums">{rupees(p.amount)}</b>
                    {on ? <ChevronUp size={18} className="text-bb-accent" /> : <ChevronDown size={18} className="text-bb-muted" />}
                  </button>
                  {on && (
                    <div className="p-3 space-y-3">
                      <div className="text-sm text-bb-text space-y-1">
                        <div className="flex items-center gap-2"><CategoryTag p={p} />{p.mode !== 'total' && <span>Qty {p.qty || 1}</span>}</div>
                        {p.mode !== 'total' && p.note && <div className="text-bb-muted">{p.note}</div>}
                      </div>
                      <div className="flex gap-2 justify-end">
                        <IconButton icon={Edit3} label="Edit purchase" onClick={() => setDialog({ editing: p })} />
                        <IconButton icon={Trash2} label="Delete purchase" onClick={() => askDelete(p)} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex justify-between px-1 pt-1 text-sm font-bold">
              <span>Total · {list.length} {list.length === 1 ? 'entry' : 'entries'}</span><span>{rupees(sum.total)}</span>
            </div>
          </div>

          {/* === LAPTOP: table === */}
          <Card className="hidden md:block">
            <table className="w-full text-sm" data-testid="purchases-table">
              <thead>
                <tr className="border-b border-bb-border">
                  {['Date', 'Item', 'Category', 'Qty', 'Note', 'Amount', ''].map((h, i) => (
                    <th key={i} className={`py-3 px-3 ${i === 5 ? 'text-right' : 'text-left'} text-[11.5px] uppercase tracking-wider text-bb-muted font-semibold`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(p => (
                  <tr key={p.id} className="border-b border-bb-border/50">
                    <td className="py-3 px-3 whitespace-nowrap">{formatDateReadable(p.date)}</td>
                    <td className="py-3 px-3 font-medium text-bb-text">{p.mode === 'total' ? 'Purchases (total)' : p.name}</td>
                    <td className="py-3 px-3"><CategoryTag p={p} /></td>
                    <td className="py-3 px-3">{p.mode === 'total' ? '—' : p.qty || 1}</td>
                    <td className="py-3 px-3 text-bb-muted">{p.note}</td>
                    <td className="py-3 px-3 text-right font-semibold whitespace-nowrap">{rupees(p.amount)}</td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <span className="inline-flex gap-1.5">
                        <IconButton icon={Edit3} label="Edit purchase" tone="quiet" size={34} iconSize={16} onClick={() => setDialog({ editing: p })} />
                        <IconButton icon={Trash2} label="Delete purchase" tone="quiet" size={34} iconSize={16} onClick={() => askDelete(p)} />
                      </span>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan="5" className="py-3 px-3 font-semibold">Total · {list.length} {list.length === 1 ? 'entry' : 'entries'}</td>
                  <td className="py-3 px-3 text-right font-bold">{rupees(sum.total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-bb-muted">Owners only — your team doesn’t see this page.</p>
        </>
      )}

      <PurchaseDialog isOpen={!!dialog} editing={dialog?.editing || null} onClose={() => setDialog(null)} />
    </div>
  );
}
