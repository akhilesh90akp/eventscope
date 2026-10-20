/**
 * ContractGenerator — Event Services Agreement for one event
 *
 * Top: the details that change per client (party details, advance, balance
 * due date, stamp-paper space), prefilled from the event, its quote and bill.
 * Bottom: the agreement itself (components/ContractDocument.jsx), which can be
 * turned into a PDF (preview → share/save) or printed on a laptop.
 *
 * Phones (below 1024px): Details | Preview tabs; the details fold into
 * Client / Payment / Agreement / Stamp paper sections (a closed one shows a
 * one-line summary) and a bar at the bottom holds Save and PDF.
 *
 * Saved per event as event.contract (Save button). The money and the
 * Annexure come from utils/contract.js; the company's own terms (cancellation
 * %, court city, setup hours…) come from Settings → Contract.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useIsPhone } from '../components/useIsPhone';
import { usePhoneHeader } from '../components/phoneScreens';
import ActionBar from '../components/ActionBar';
import DocFit from '../components/DocFit';
import StickyBar from '../components/StickyBar';
import { SegmentedTabs, SwitchRow, DateField, TextField, SectionLabel } from '../components/PhoneUI';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import PdfButton from '../components/PdfButton';
import Card from '../components/Card';
import Input from '../components/Input';
import Select from '../components/Select';
import Toggle from '../components/Toggle';
import ContractDocument from '../components/ContractDocument';
import { buildContract, nextAgreementNo } from '../utils/contract';
import { formatRupees, formatDateReadable } from '../utils/helpers';
import { PAYMENT_MODES } from '../constants/contract';
import { Printer, Save } from 'lucide-react';
import { showsEventScopeMark } from '../utils/billing';
import UpgradeCard from '../components/UpgradeCard';

// ============================================================
// HELPERS
// ============================================================

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Starting values: what was saved, else sensible guesses from the event/quote/bill */
function initialForm(event, settings, events, user) {
  const saved = event?.contract || {};
  const terms = settings.contractTerms || {};
  return {
    agreementNo: saved.agreementNo || nextAgreementNo(settings.invoicePrefix || 'INV', events),
    agreementDate: saved.agreementDate || today(),
    place: saved.place ?? (terms.place || terms.courtCity || ''),
    signatory: saved.signatory ?? (terms.signatory || user?.displayName || ''),
    quoteRef: saved.quoteRef ?? '',
    clientName: saved.clientName ?? (event?.billDetails?.billToName || event?.clientName || ''),
    clientAddress: saved.clientAddress ?? (event?.billDetails?.billToAddress || event?.clientAddress || ''),
    clientPhone: saved.clientPhone ?? (event?.clientPhone || ''),
    amount: saved.amount ?? '',
    advance: saved.advance ?? (event?.billDetails?.advance || ''),
    advanceDate: saved.advanceDate ?? '',
    advanceMode: saved.advanceMode ?? '',
    advanceRef: saved.advanceRef ?? '',
    balanceDueDate: saved.balanceDueDate ?? '',
    stampSpace: saved.stampSpace ?? true,
  };
}

// ============================================================
// ContractGenerator — MAIN COMPONENT
// ============================================================

export default function ContractGenerator() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { events, settings, updateEvent, showToast, user, canEditEvents, tenant, canUse } = useApp();
  const event = events.find(e => e.id === eventId);

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [form, setForm] = useState(() => initialForm(event, settings, events, user));
  const [savedStr, setSavedStr] = useState(() => (event?.contract ? JSON.stringify(initialForm(event, settings, events, user)) : null));
  const [saving, setSaving] = useState(false);
  const docRef = useRef(null);

  // Phones: Details | Preview, and which sections are open
  const isPhone = useIsPhone();
  const [tab, setTab] = useState('details');
  const [open, setOpen] = useState({ payment: true });

  // The event can arrive after the first render (live data) — fill the form once it does
  const hydrated = useRef(!!event);
  useEffect(() => {
    if (event && !hydrated.current) {
      hydrated.current = true;
      const f = initialForm(event, settings, events, user);
      setForm(f);
      if (event.contract) setSavedStr(JSON.stringify(f));
    }
  }, [event, settings, events, user]);

  // ------------------------------------------------------------
  // DERIVED / CALCULATED VALUES
  // ------------------------------------------------------------
  const c = useMemo(() => (event ? buildContract(event, settings, form) : null), [event, settings, form]);
  const unsaved = JSON.stringify(form) !== savedStr;

  // Phones: client · event under the title
  const headerSub = event ? [event.clientName, event.eventType].filter(Boolean).join(' · ') : '';
  usePhoneHeader({ sub: headerSub }, [headerSub]);

  if (!canUse('contracts')) {
    return <UpgradeCard feature="contracts" text="A ready event services agreement for every booking — dates, items, advance and terms filled in." />;
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-bb-muted">Event not found</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  /** Saves the per-client details on the event (awaited; real errors shown) */
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const contract = { ...form, updatedAt: new Date().toISOString() };
      const result = await updateEvent(eventId, { contract });
      if (result.success) {
        setSavedStr(JSON.stringify(form));
        showToast('Contract saved');
      } else {
        showToast(result.error || 'Failed to save the contract', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  /** File name for the PDF and laptop printing */
  const docTitle = `Agreement - ${form.clientName || event.clientName || 'Client'} ${form.agreementNo}`;

  const handlePrint = () => {
    document.title = docTitle;
    window.print();
    document.title = 'EventScope';
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  return (
    <div className="space-y-4 pb-8">
      {/* === LAPTOP: controls (hidden in print) === */}
      {!isPhone && <div data-no-print className="space-y-5">
        {/* Title row with the document actions, pinned while you scroll the preview */}
        <PageHeader sticky title="Contract" sub={headerSub} onBack={() => (((window.history.state?.idx ?? 0) > 0) ? navigate(-1) : navigate('/confirmed'))}
          actions={<>
            <Button icon={Printer} variant="secondary" onClick={handlePrint}>Print</Button>
            <PdfButton docRef={docRef} fileName={`${docTitle}.pdf`} variant="secondary" />
            {canEditEvents && (
              <Button icon={Save} variant={unsaved ? 'primary' : 'secondary'} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : unsaved ? 'Save' : '✓ Saved'}
              </Button>
            )}
          </>} />

        <div className="grid grid-cols-2 gap-5 items-start">

        {/* Client */}
        <Card>
          <SectionLabel className="mb-4">Client</SectionLabel>
          <fieldset disabled={!canEditEvents} className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
            <Input label="Client name (as it should appear)" value={form.clientName} onChange={set('clientName')} />
            <Input label="Phone" value={form.clientPhone} onChange={set('clientPhone')} />
            <Input label="Full address" type="textarea" value={form.clientAddress} onChange={set('clientAddress')} className="md:col-span-2" />
          </fieldset>
        </Card>

        {/* Payment */}
        <Card>
          <SectionLabel className="mb-4">Payment</SectionLabel>
          <fieldset disabled={!canEditEvents} className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
            <Input label={`Contract amount (₹) — quote total ${formatRupees(c.quoteTotal)}`} type="number" value={form.amount} placeholder={String(c.quoteTotal)} onChange={set('amount')} />
            <Input label="Advance received (₹)" type="number" value={form.advance} onChange={set('advance')} />
            <Input label="Advance received on" type="date" value={form.advanceDate} onChange={set('advanceDate')} />
            <Select label="Paid by" options={PAYMENT_MODES} value={form.advanceMode} onChange={set('advanceMode')} />
            <Input label="Payment reference (optional)" value={form.advanceRef} onChange={set('advanceRef')} />
            <Input label="Balance due by" type="date" value={form.balanceDueDate || c.balanceDueDate} onChange={set('balanceDueDate')} />
          </fieldset>
          <p className="text-sm text-bb-text mt-3">
            Balance: <b>{formatRupees(c.balance)}</b>
            <span className="text-bb-muted"> = {formatRupees(c.price)} − advance {formatRupees(c.advance)}</span>
          </p>
        </Card>

        {/* Agreement */}
        <Card>
          <SectionLabel className="mb-4">Agreement</SectionLabel>
          <fieldset disabled={!canEditEvents} className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
            <Input label="Agreement no." value={form.agreementNo} onChange={set('agreementNo')} />
            <Input label="Date" type="date" value={form.agreementDate} onChange={set('agreementDate')} />
            <Input label="Place signed" value={form.place} placeholder="e.g. Kochi" onChange={set('place')} />
            <Input label="Signed for the company by" value={form.signatory} onChange={set('signatory')} />
            <Input label="Quotation ref. (optional)" value={form.quoteRef} onChange={set('quoteRef')} />
          </fieldset>
          <div className="mt-4">
            <Toggle
              label="Leave space at the top for stamp paper"
              description="Page 1 starts lower so you can print on stamp paper. The blank area isn’t printed."
              checked={form.stampSpace}
              onChange={set('stampSpace')}
              disabled={!canEditEvents}
            />
          </div>
          {!c.terms.courtCity && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
              Tip: set your court city, cancellation terms and setup hours once in Settings → Contract.
            </p>
          )}
        </Card>

        </div>
        <p className="text-xs text-bb-muted">
          This is a standard agreement. Have your advocate read it once before first use. Stamp paper value depends on the contract amount — ask your stamp vendor.
        </p>
      </div>}

      {/* === PHONE: Details (folding sections) | Preview === */}
      {isPhone && (
        <div data-no-print className="space-y-4">
          <StickyBar className="!py-3">
            <SegmentedTabs value={tab} onChange={(t) => { setTab(t); window.scrollTo(0, 0); }} testId="contract-tabs"
              options={[{ value: 'details', label: 'Details' }, { value: 'preview', label: 'Preview' }]} />
          </StickyBar>
          {tab === 'details' && (
            <fieldset disabled={!canEditEvents} className="space-y-4 min-w-0" data-testid="contract-phone">
              {[
                { id: 'client', title: 'Client', sum: [form.clientName, form.clientPhone].filter(Boolean).join(' · ') || 'Name, phone, address',
                  body: <>
                    <TextField label="Client name (as it should appear)" value={form.clientName} onChange={set('clientName')} />
                    <TextField label="Phone" value={form.clientPhone} onChange={set('clientPhone')} inputMode="tel" />
                    <TextField label="Full address" as="textarea" value={form.clientAddress} onChange={set('clientAddress')} />
                  </> },
                { id: 'payment', title: 'Payment', sum: `Contract ${formatRupees(c.price)} · ${c.advance ? `advance ${formatRupees(c.advance)}` : 'advance not added'}`,
                  body: <>
                    <TextField label="Contract amount ₹" type="number" inputMode="decimal" value={form.amount} placeholder={String(c.quoteTotal)} onChange={set('amount')} hint={`Quote total ${formatRupees(c.quoteTotal)}`} />
                    <div className="grid grid-cols-2 gap-3">
                      <TextField label="Advance ₹" type="number" inputMode="decimal" value={form.advance} onChange={set('advance')} placeholder="0" />
                      <DateField label="Received on" id="adv-date" value={form.advanceDate} onChange={set('advanceDate')} placeholder="Pick date" />
                    </div>
                    <label className="block">
                      <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">Paid by</span>
                      <select value={form.advanceMode} onChange={set('advanceMode')} className="w-full min-h-[48px] rounded-xl border border-bb-border bg-bb-input px-3.5 text-[16px]">
                        <option value="">Select…</option>
                        {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </label>
                    <TextField label="Payment reference (optional)" value={form.advanceRef} onChange={set('advanceRef')} />
                    <DateField label="Balance due by" id="bal-date" value={form.balanceDueDate || c.balanceDueDate} onChange={set('balanceDueDate')} />
                    <p className="text-[14px]">Balance <b>{formatRupees(c.balance)}</b> <span className="text-gray-600">= {formatRupees(c.price)} − advance {formatRupees(c.advance)}</span></p>
                  </> },
                { id: 'agreement', title: 'Agreement', sum: [form.agreementNo, form.agreementDate && formatDateReadable(form.agreementDate), form.signatory].filter(Boolean).join(' · '),
                  body: <>
                    <TextField label="Agreement no." value={form.agreementNo} onChange={set('agreementNo')} />
                    <DateField label="Date" id="agr-date" value={form.agreementDate} onChange={set('agreementDate')} />
                    <TextField label="Place signed" value={form.place} placeholder="e.g. Kochi" onChange={set('place')} />
                    <TextField label="Signed for the company by" value={form.signatory} onChange={set('signatory')} />
                    <TextField label="Quotation ref. (optional)" value={form.quoteRef} onChange={set('quoteRef')} />
                  </> },
                { id: 'stamp', title: 'Stamp paper', sum: form.stampSpace ? 'Space at the top of page 1 · on' : 'No space at the top',
                  body: <>
                    <SwitchRow title="Leave space at the top for stamp paper" sub="Page 1 starts lower so you can print on stamp paper." checked={form.stampSpace} onChange={v => setForm(f => ({ ...f, stampSpace: v }))} />
                    {!c.terms.courtCity && <p className="text-[13px] text-amber-800 bg-amber-50 rounded-xl px-3 py-2.5">Tip: set your court city, cancellation terms and setup hours once in Settings → Contract.</p>}
                    <p className="text-[13px] text-gray-600">This is a standard agreement. Have your advocate read it once before first use.</p>
                  </> },
              ].map(sec => (
                <div key={sec.id} className="bg-white border border-bb-border rounded-2xl" data-testid={`contract-sec-${sec.id}`}>
                  <button type="button" onClick={() => setOpen(o => ({ ...o, [sec.id]: !o[sec.id] }))} aria-expanded={!!open[sec.id]}
                    className="w-full flex items-center gap-3 px-[18px] py-4 text-left cursor-pointer">
                    <span className="flex-1 min-w-0">
                      <span className="block text-[16px] font-bold">{sec.title}</span>
                      <span className="block text-[13px] text-gray-600 truncate">{sec.sum}</span>
                    </span>
                    <ChevronDown size={20} className={`text-gray-400 transition-transform ${open[sec.id] ? 'rotate-180' : ''}`} />
                  </button>
                  {open[sec.id] && <div className="px-[18px] pb-[18px] space-y-4">{sec.body}</div>}
                </div>
              ))}
            </fieldset>
          )}
          <ActionBar label={saving ? 'Contract · saving…' : unsaved && canEditEvents ? 'Contract · not saved yet' : 'Contract'} status={!saving && (!unsaved || !canEditEvents) ? '✓ Saved' : null} value={formatRupees(c.price)}>
            {canEditEvents && unsaved && <Button icon={Save} onClick={handleSave} disabled={saving}>Save</Button>}
            <PdfButton docRef={docRef} fileName={`${docTitle}.pdf`} variant={canEditEvents && unsaved ? 'secondary' : 'primary'} />
          </ActionBar>
        </div>
      )}

      {/* The agreement — fitted on phones (Preview tab), prints as A4 */}
      <DocFit hidden={isPhone && tab === 'details'}>
        <ContractDocument ref={docRef} settings={settings} details={form} c={c} showMark={showsEventScopeMark(tenant?.plan)} />
      </DocFit>
    </div>
  );
}
