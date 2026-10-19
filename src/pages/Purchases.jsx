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
 * Data: tenants/{id}/purchases (see utils/purchases.js).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useMemo, useState } from 'react';
import { Plus, Download, Edit2, Edit3, Trash2, ChevronDown, ChevronUp, Lock, ShoppingBag } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Button from '../components/Button';
import PurchaseDialog from '../components/PurchaseDialog';
import { useConfirm } from '../components/useConfirm';
import { formatCurrency, formatDateReadable } from '../utils/helpers';
import {
  fyStart, fyLabel, fyRange, purchaseYears, purchasesBetween, summarizePurchases,
  sortPurchases, eventProfitBetween, exportPurchasesToExcel,
} from '../utils/purchases';
import UpgradeCard from '../components/UpgradeCard';

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
      <p className={`text-lg sm:text-xl font-bold truncate ${cls}`}>{value}</p>
      {sub && <p className="text-[10px] text-bb-muted">{sub}</p>}
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* === HEADER === */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-bb-text">Purchases</h1>
        <select value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Financial year"
          className="bg-white border border-bb-border rounded-lg px-3 py-1.5 text-sm text-bb-text cursor-pointer">
          {years.map(y => <option key={y} value={y}>{fyLabel(y).replace('FY ', '')} (Apr–Mar)</option>)}
        </select>
        <span className="flex-1" />
        <Button variant="secondary" icon={Download} onClick={handleDownload} disabled={busy || !list.length}>
          {busy ? 'Preparing…' : 'Download Excel'}
        </Button>
        <Button icon={Plus} onClick={() => setDialog({ editing: null })}>Add purchase</Button>
      </div>
      <p className="text-sm text-bb-muted -mt-1">
        Things you buy for the business and use across many events — chairs, lights, a generator. Not part of any one event’s costs in the Job Log.
      </p>

      {/* === SUMMARY CARDS === */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stat('Spent this year', formatCurrency(sum.total))}
        {stat('Entries', sum.count)}
        {stat('Biggest category', sum.biggestCategory ? sum.biggestCategory.name : '—', 'text-bb-text', sum.biggestCategory ? rupees(sum.biggestCategory.amount) : '')}
        {profit.completed > 0 && profit.profitEvents / profit.completed >= 0.8
          ? stat('Profit after purchases', formatCurrency(afterPurchases), afterPurchases >= 0 ? 'text-emerald-500' : 'text-rose-600', `Event profit ${rupees(profit.profit)} − purchases`)
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
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer ${on ? 'bg-bb-accent/10' : 'hover:bg-bb-card-hover'}`}>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-bb-text truncate">{titleOf(p)}</span>
                      <span className="block text-xs text-bb-muted">{formatDateReadable(p.date)}</span>
                    </span>
                    <b className="text-sm">{rupees(p.amount)}</b>
                    {on ? <ChevronUp size={18} className="text-bb-accent" /> : <ChevronDown size={18} className="text-bb-muted" />}
                  </button>
                  {on && (
                    <div className="p-3 space-y-3">
                      <div className="text-sm text-bb-text space-y-1">
                        <div className="flex items-center gap-2"><CategoryTag p={p} />{p.mode !== 'total' && <span>Qty {p.qty || 1}</span>}</div>
                        {p.mode !== 'total' && p.note && <div className="text-bb-muted">{p.note}</div>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" icon={Edit3} onClick={() => setDialog({ editing: p })}>Edit</Button>
                        <Button size="sm" variant="outline" icon={Trash2} className="border-red-500 text-red-500 hover:bg-red-50" onClick={() => askDelete(p)}>Delete</Button>
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
                    <th key={i} className={`py-2 px-2 ${i === 5 ? 'text-right' : 'text-left'} text-bb-muted font-medium`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(p => (
                  <tr key={p.id} className="border-b border-bb-border/50">
                    <td className="py-2.5 px-2 whitespace-nowrap">{formatDateReadable(p.date)}</td>
                    <td className="py-2.5 px-2 font-medium text-bb-text">{p.mode === 'total' ? 'Purchases (total)' : p.name}</td>
                    <td className="py-2.5 px-2"><CategoryTag p={p} /></td>
                    <td className="py-2.5 px-2">{p.mode === 'total' ? '—' : p.qty || 1}</td>
                    <td className="py-2.5 px-2 text-bb-muted">{p.note}</td>
                    <td className="py-2.5 px-2 text-right font-semibold whitespace-nowrap">{rupees(p.amount)}</td>
                    <td className="py-2.5 px-2 text-right whitespace-nowrap">
                      <button onClick={() => setDialog({ editing: p })} className="p-1.5 rounded text-bb-muted hover:text-bb-accent cursor-pointer" title="Edit" aria-label="Edit purchase">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => askDelete(p)} className="p-1.5 rounded text-bb-muted hover:text-red-500 cursor-pointer" title="Delete" aria-label="Delete purchase">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan="5" className="py-2.5 px-2 font-semibold">Total · {list.length} {list.length === 1 ? 'entry' : 'entries'}</td>
                  <td className="py-2.5 px-2 text-right font-bold">{rupees(sum.total)}</td>
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
