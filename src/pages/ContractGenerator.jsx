/**
 * ContractGenerator — Event Services Agreement for one event
 *
 * Top: the details that change per client (party details, advance, balance
 * due date, stamp-paper space), prefilled from the event, its quote and bill.
 * Bottom: the agreement itself (components/ContractDocument.jsx), which can be
 * turned into a PDF (preview → share/save) or printed on a laptop.
 *
 * Saved per event as event.contract (Save button). The money and the
 * Annexure come from utils/contract.js; the company's own terms (cancellation
 * %, court city, setup hours…) come from Settings → Contract.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BackButton from '../components/BackButton';
import Button from '../components/Button';
import PdfButton from '../components/PdfButton';
import Card from '../components/Card';
import Input from '../components/Input';
import Select from '../components/Select';
import Toggle from '../components/Toggle';
import ContractDocument from '../components/ContractDocument';
import { buildContract, nextAgreementNo } from '../utils/contract';
import { formatCurrency } from '../utils/helpers';
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
      {/* Controls — hidden in print */}
      <div data-no-print className="space-y-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-xl font-bold text-bb-text">Contract</h1>
        </div>

        {/* Client */}
        <Card>
          <h2 className="text-sm font-semibold text-bb-text mb-3">Client</h2>
          <fieldset disabled={!canEditEvents} className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
            <Input label="Client name (as it should appear)" value={form.clientName} onChange={set('clientName')} />
            <Input label="Phone" value={form.clientPhone} onChange={set('clientPhone')} />
            <Input label="Full address" type="textarea" value={form.clientAddress} onChange={set('clientAddress')} className="md:col-span-2" />
          </fieldset>
        </Card>

        {/* Payment */}
        <Card>
          <h2 className="text-sm font-semibold text-bb-text mb-3">Payment</h2>
          <fieldset disabled={!canEditEvents} className="grid grid-cols-1 md:grid-cols-3 gap-3 min-w-0">
            <Input label={`Contract amount (₹) — quote total ${formatCurrency(c.quoteTotal)}`} type="number" value={form.amount} placeholder={String(c.quoteTotal)} onChange={set('amount')} />
            <Input label="Advance received (₹)" type="number" value={form.advance} onChange={set('advance')} />
            <Input label="Advance received on" type="date" value={form.advanceDate} onChange={set('advanceDate')} />
            <Select label="Paid by" options={PAYMENT_MODES} value={form.advanceMode} onChange={set('advanceMode')} />
            <Input label="Payment reference (optional)" value={form.advanceRef} onChange={set('advanceRef')} />
            <Input label="Balance due by" type="date" value={form.balanceDueDate || c.balanceDueDate} onChange={set('balanceDueDate')} />
          </fieldset>
          <p className="text-sm text-bb-text mt-3">
            Balance: <b>{formatCurrency(c.balance)}</b>
            <span className="text-bb-muted"> = {formatCurrency(c.price)} − advance {formatCurrency(c.advance)}</span>
          </p>
        </Card>

        {/* Agreement */}
        <Card>
          <h2 className="text-sm font-semibold text-bb-text mb-3">Agreement</h2>
          <fieldset disabled={!canEditEvents} className="grid grid-cols-1 md:grid-cols-3 gap-3 min-w-0">
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

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          {canEditEvents && (
            <Button icon={Save} variant={unsaved ? 'primary' : 'outline'} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : unsaved ? 'Save' : 'Saved'}
            </Button>
          )}
          <PdfButton docRef={docRef} fileName={`${docTitle}.pdf`} variant="secondary" />
          <span className="hidden md:contents"><Button icon={Printer} variant="secondary" onClick={handlePrint}>Print</Button></span>
          <Button variant="secondary" onClick={() => navigate(-1)}>Back</Button>
        </div>
        <p className="text-xs text-bb-muted">
          This is a standard agreement. Have your advocate read it once before first use. Stamp paper value depends on the contract amount — ask your stamp vendor.
        </p>
      </div>

      {/* The agreement — scrolls sideways on phones, prints as A4 */}
      <div className="doc-scroll">
        <ContractDocument ref={docRef} settings={settings} details={form} c={c} showMark={showsEventScopeMark(tenant?.plan)} />
      </div>
    </div>
  );
}
