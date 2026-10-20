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
 * Laptops: title row (Excel · Add purchase), a ‹ FY › strip, four quiet
 * number cards (StatRow) and a table with a title and a Total row.
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
import { Plus, Download, Edit2, Edit3, Trash2, ChevronDown, ChevronUp, Lock, ShoppingBag } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import StickyBar from '../components/StickyBar';
import Button from '../components/Button';
import PurchaseDialog from '../components/PurchaseDialog';
import { useConfirm } from '../components/useConfirm';
import { formatDateReadable, formatRupees } from '../utils/helpers';
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
import { PageHeader, HeaderText, StatRow } from '../components/LaptopUI';

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
  const enoughCosts = profit.completed > 0 && profit.profitEvents / profit.completed >= 0.8;
  const thisMonth = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7);
    return list.filter(p => String(p.date || '').startsWith(ym)).reduce((n, p) => n + (Number(p.amount) || 0), 0);
  }, [list]);

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
      <p className={`text-lg sm:text-xl font-bold truncate ${cls}`}>{value}</p>
      {sub && <p className="text-[10px] text-bb-muted max-lg:text-[12.5px] max-lg:text-gray-600">{sub}</p>}
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

      {/* === LAPTOP: title row and the ‹ year › strip === */}
      {!isPhone && <>
        <PageHeader title="Purchases" sub="Things you buy for the business and use across many events"
          actions={<>
            <HeaderText icon={Download} onClick={handleDownload} disabled={busy || !list.length} data-testid="purchases-excel">{busy ? 'Preparing…' : 'Excel'}</HeaderText>
            <HeaderText icon={Plus} primary onClick={() => setDialog({ editing: null })} data-testid="add-purchase">Add purchase</HeaderText>
          </>} />
        <div className="flex items-center gap-3 bg-white border border-bb-border rounded-2xl px-4 py-2" data-testid="fy-strip">
          <span className="text-[12px] font-bold tracking-[0.06em] uppercase text-bb-muted">Financial year</span>
          <span className="flex items-center gap-1">
            <IconButton icon={ChevronLeft} label="Previous year" tone="quiet" size={32} iconSize={17} onClick={() => setYear(y => y - 1)} disabled={year <= Math.min(...years)} />
            <b className="min-w-[110px] text-center text-[14px]" data-testid="fy-label">{fyLabel(year)}</b>
            <IconButton icon={ChevronRight} label="Next year" tone="quiet" size={32} iconSize={17} onClick={() => setYear(y => y + 1)} disabled={year >= Math.max(...years)} />
          </span>
          <span className="text-[13px] text-bb-muted">{formatDateReadable(from)} – {formatDateReadable(to)}</span>
        </div>
      </>}
      {isPhone && <p className="text-sm text-bb-muted -mt-1 max-lg:text-[13.5px] max-lg:text-gray-600 max-lg:mt-0">
        Things you buy for the business and use across many events — chairs, lights, a generator. Not part of any one event’s costs in the Job Log.
      </p>}

      {/* === SUMMARY CARDS === */}
      {isPhone ? (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stat('Spent this year', formatRupees(sum.total))}
        {stat('Entries', sum.count)}
        {stat('Biggest category', sum.biggestCategory ? sum.biggestCategory.name : '—', 'text-bb-text', sum.biggestCategory ? rupees(sum.biggestCategory.amount) : '')}
        {enoughCosts
          ? stat('Profit after purchases', formatRupees(afterPurchases), afterPurchases >= 0 ? 'text-emerald-500' : 'text-rose-600', `Event profit ${rupees(profit.profit)} − purchases`)
          : stat('Profit after purchases', '—', 'text-bb-muted', `Shows once most events have expenses added (${profit.profitEvents} of ${profit.completed} now)`)}
      </div>
      ) : (
        <StatRow items={[
          { label: 'Spent this year', value: formatRupees(sum.total), tone: 'red', hint: `${sum.count} ${sum.count === 1 ? 'purchase' : 'purchases'}` },
          { label: 'Biggest category', value: sum.biggestCategory ? sum.biggestCategory.name : '—', hint: sum.biggestCategory ? formatRupees(sum.biggestCategory.amount) : 'Nothing yet' },
          enoughCosts
            ? { label: 'Profit after purchases', value: formatRupees(afterPurchases), tone: afterPurchases >= 0 ? 'green' : 'red', hint: `Event profit ${formatRupees(profit.profit)} − purchases` }
            : { label: 'Profit after purchases', value: '—', tone: 'muted', hint: `Shows once most events have expenses (${profit.profitEvents} of ${profit.completed} now)` },
          { label: 'This month', value: formatRupees(thisMonth), hint: new Date().toLocaleDateString('en-IN', { month: 'long' }) },
        ]} />
      )}

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
          {isPhone ? <>
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
          </> : (
          /* === LAPTOP: table with a title, ✎ / bin icons and a Total row === */
          <div className="bg-white border border-bb-border rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5">
              <h2 className="text-[15px] font-bold text-bb-text">Purchases in {fyLabel(year)}</h2>
              <span className="inline-flex items-center justify-center min-w-[1.6rem] h-[22px] px-2 rounded-full bg-violet-100 text-violet-700 text-xs font-bold tabular-nums">{list.length}</span>
            </div>
            <table className="w-full text-[13.5px]" data-testid="purchases-table">
              <thead>
                <tr className="bg-bb-bg/70 border-y border-bb-border text-left">
                  {['Date', 'Item', 'Category', 'Qty', 'Note', 'Amount', ''].map((h, i) => (
                    <th key={i} className={`py-2.5 px-3 text-[11px] font-bold uppercase tracking-[0.06em] text-bb-muted ${i === 5 || i === 3 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(p => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 whitespace-nowrap text-gray-600">{formatDateReadable(p.date)}</td>
                    <td className="py-2 px-3 font-semibold text-bb-text">{p.mode === 'total' ? 'Purchases (total)' : p.name}</td>
                    <td className="py-2 px-3"><CategoryTag p={p} /></td>
                    <td className="py-2 px-3 text-right tabular-nums">{p.mode === 'total' ? '—' : p.qty || 1}</td>
                    <td className="py-2 px-3 text-bb-muted">{p.note}</td>
                    <td className="py-2 px-3 text-right font-semibold whitespace-nowrap tabular-nums">{rupees(p.amount)}</td>
                    <td className="py-1 px-2 text-right whitespace-nowrap">
                      <span className="inline-flex gap-1">
                        <IconButton icon={Edit3} label="Edit purchase" tone="quiet" size={32} iconSize={15} onClick={() => setDialog({ editing: p })} />
                        <IconButton icon={Trash2} label="Delete purchase" tone="quiet" size={32} iconSize={15} className="hover:!text-red-600 hover:!bg-red-50" onClick={() => askDelete(p)} />
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="bg-bb-bg/70 font-bold">
                  <td colSpan="5" className="py-3 px-3">Total · {list.length} {list.length === 1 ? 'entry' : 'entries'}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{rupees(sum.total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          )}
          <p className="text-xs text-bb-muted">Owners only — your team doesn’t see this page.</p>
        </>
      )}

      <PurchaseDialog isOpen={!!dialog} editing={dialog?.editing || null} onClose={() => setDialog(null)} />
    </div>
  );
}
