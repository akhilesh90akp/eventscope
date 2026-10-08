/**
 * BillGenerator — Invoice/bill document builder
 *
 * Generates a professional GST-compliant invoice for completed events.
 * Groups items by main event and sub-events. Supports configurable invoice
 * number, discount, GST (intra/inter-state), and round-off.
 * Includes print and WhatsApp sharing capabilities.
 *
 * Bill details (invoice no/date, bill-to, discount, advance, GST settings)
 * auto-save to the event 1s after the user stops editing, and a manual
 * Save button is also available — see CODE_STRUCTURE.md §3-4.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BackButton from '../components/BackButton';
import Button from '../components/Button';
import Input from '../components/Input';
import Select from '../components/Select';
import Toggle from '../components/Toggle';
import Card from '../components/Card';
import { formatCurrency, formatDateReadable, calcGST, roundOff, nextInvoiceNo, waLink, buildLineEntries, computeSectionTotal } from '../utils/helpers';
import { DEFAULT_SAC_CODE } from '../constants/data';
import { Printer, MessageSquare, Save } from 'lucide-react';

// ============================================================
// HELPERS
// ============================================================

/**
 * Helper: get all items and event groups from an event (both old and new format).
 */
function getEventItemsData(event) {
  if (event.mainEvent) {
    const mainItems = event.mainEvent.items || [];
    const subEvents = event.subEvents || [];
    const allItems = [...mainItems];
    subEvents.forEach(s => {
      (s.items || []).forEach(item => {
        if (!allItems.includes(item)) allItems.push(item);
      });
    });

    const eventGroups = [];
    if (mainItems.length > 0) {
      eventGroups.push({
        id: 'main',
        name: event.mainEvent.name || event.eventType || 'Main Event',
        date: event.mainEvent.date || '',
        location: event.mainEvent.location || '',
        items: mainItems,
      });
    }
    subEvents.forEach(s => {
      if ((s.items || []).length > 0) {
        eventGroups.push({
          id: s.id || s.name,
          name: s.name || 'Sub Event',
          date: s.date || '',
          location: s.location || '',
          items: s.items,
        });
      }
    });

    // If no groups but there are items (items added via quotation that aren't in mainEvent)
    if (eventGroups.length === 0 && allItems.length > 0) {
      eventGroups.push({
        id: 'main',
        name: event.mainEvent.name || event.eventType || 'Event',
        date: event.mainEvent.date || '',
        location: event.mainEvent.location || '',
        items: allItems,
      });
    }

    return { allItems, eventGroups };
  }

  // Old format (flat items array)
  const items = event.items || [];
  const eventGroups = [{
    id: 'main',
    name: event.eventType || 'Event',
    date: event.date || '',
    location: event.eventLocation || '',
    items: items,
  }];
  return { allItems: items, eventGroups };
}

// ============================================================
// BillGenerator — MAIN COMPONENT
// ============================================================

/** Builds and previews a printable invoice document for an event */
export default function BillGenerator() {
  const { eventId } = useParams();
  const { events, settings, updateEvent, showToast } = useApp();
  const navigate = useNavigate();
  const event = events.find(e => e.id === eventId);

  // Count existing invoices for sequential numbering

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------

  // Invoice configuration state — seeded from event.billDetails when a
  // bill was already saved for this event, so re-opening the page
  // doesn't lose previous edits.
  const bd = event?.billDetails || {};
  const [invoiceNo, setInvoiceNo] = useState(() => bd.invoiceNo ?? nextInvoiceNo(settings.invoicePrefix, events));
  const [invoiceDate, setInvoiceDate] = useState(() => bd.invoiceDate ?? new Date().toISOString().split('T')[0]);
  const [billToName, setBillToName] = useState(() => bd.billToName ?? event?.clientName ?? '');
  const [billToAddress, setBillToAddress] = useState(() => bd.billToAddress ?? event?.clientAddress ?? '');
  const [discount, setDiscount] = useState(() => bd.discount ?? 0);
  const [advance, setAdvance] = useState(() => bd.advance ?? 0);
  // A new bill starts with the GST choice made on the quote (if any)
  const qd = event?.quoteDetails || {};
  const [gstEnabled, setGstEnabled] = useState(() => bd.gstEnabled ?? qd.gstEnabled ?? true);
  const [gstRate, setGstRate] = useState(() => bd.gstRate ?? qd.gstRate ?? String(settings.defaultGstRate || 18));
  const [interState, setInterState] = useState(() => bd.interState ?? false);

  // `hasUnsavedChanges` drives the manual Save button's "already saved"
  // vs. "save now" behavior. `autoSaving` shows a brief "Saving..." state.
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);

  // Holds the JSON of the last successfully-saved bill details, so the
  // auto-save effect can tell a real edit apart from the initial
  // hydration-from-Firestore (which shouldn't itself trigger a save).
  // null until that hydration has happened once.
  const lastSavedRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  // Ref for printable section
  const pdfRef = useRef(null);

  // ------------------------------------------------------------
  // DATA LOADING / EFFECTS — BILL DETAILS AUTO-SAVE
  // ------------------------------------------------------------

  // Hydrate from event.billDetails once the event loads (handles the
  // async Firestore listener — event may not be ready on first render),
  // and record this as the "last saved" snapshot. Comparing against this
  // snapshot (rather than a first-render flag) is what lets the auto-save
  // effect below tell a genuine user edit apart from this hydration step.
  useEffect(() => {
    if (!event) return;
    const loaded = event.billDetails || {};
    const hydrated = {
      invoiceNo: loaded.invoiceNo ?? invoiceNo,
      invoiceDate: loaded.invoiceDate ?? invoiceDate,
      billToName: loaded.billToName ?? billToName,
      billToAddress: loaded.billToAddress ?? billToAddress,
      discount: loaded.discount ?? discount,
      advance: loaded.advance ?? advance,
      gstEnabled: loaded.gstEnabled ?? event.quoteDetails?.gstEnabled ?? gstEnabled,
      gstRate: loaded.gstRate ?? event.quoteDetails?.gstRate ?? gstRate,
      interState: loaded.interState ?? interState,
    };
    setInvoiceNo(hydrated.invoiceNo);
    setInvoiceDate(hydrated.invoiceDate);
    setBillToName(hydrated.billToName);
    setBillToAddress(hydrated.billToAddress);
    setDiscount(hydrated.discount);
    setAdvance(hydrated.advance);
    setGstEnabled(hydrated.gstEnabled);
    setGstRate(hydrated.gstRate);
    setInterState(hydrated.interState);
    lastSavedRef.current = JSON.stringify(hydrated);
    // Only re-run when a different event loads, not on every field edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  /** Persists the given bill details to the event. Awaits the write and only confirms success once Firestore returns it. */
  const saveBillDetails = async (details, detailsStr) => {
    setAutoSaving(true);
    try {
      const result = await updateEvent(eventId, { billDetails: details });
      if (result.success) {
        lastSavedRef.current = detailsStr;
        setHasUnsavedChanges(false);
        showToast('Bill details saved');
      } else {
        showToast(result.error || 'Failed to save bill details', 'error');
      }
    } finally {
      setAutoSaving(false);
    }
  };

  // Auto-saves 1s after the user stops editing any bill-detail field.
  // Skipped entirely until hydration above has established a baseline
  // (lastSavedRef.current !== null), and skipped again if the current
  // values already match what's saved (e.g. right after hydration, or
  // after an edit is undone back to the saved value).
  useEffect(() => {
    if (lastSavedRef.current === null) return;
    const current = { invoiceNo, invoiceDate, billToName, billToAddress, discount, advance, gstEnabled, gstRate, interState };
    const currentStr = JSON.stringify(current);
    if (currentStr === lastSavedRef.current) {
      setHasUnsavedChanges(false);
      return;
    }
    setHasUnsavedChanges(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveBillDetails(current, currentStr);
    }, 1000);
    return () => clearTimeout(saveTimeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceNo, invoiceDate, billToName, billToAddress, discount, advance, gstEnabled, gstRate, interState]);

  /** Manual Save button — saves immediately if there's a pending edit not yet auto-saved, otherwise just confirms it's already saved. */
  const handleManualSave = () => {
    const current = { invoiceNo, invoiceDate, billToName, billToAddress, discount, advance, gstEnabled, gstRate, interState };
    const currentStr = JSON.stringify(current);
    if (lastSavedRef.current === currentStr) {
      showToast('Already saved');
      return;
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveBillDetails(current, currentStr);
  };

  // ------------------------------------------------------------
  // DERIVED / CALCULATED VALUES
  // ------------------------------------------------------------

  // Get items and groups (backward compatible)
  const { eventGroups } = useMemo(() => event ? getEventItemsData(event) : { allItems: [], eventGroups: [] }, [event]);
  const storedPrices = useMemo(() => event?.itemPrices || {}, [event]);
  const bundles = useMemo(() => event?.bundles || [], [event]);
  const hidePrices = event?.hidePrices || false;
  const finalAmounts = useMemo(() => event?.finalAmounts || {}, [event]);

  // Each section's total (respecting hide-prices/bundles — see utils/helpers.js),
  // and their sum as the bill's subtotal.
  const sectionTotals = useMemo(() => {
    const totals = {};
    eventGroups.forEach(g => {
      totals[g.id] = computeSectionTotal(g.id, g.items, storedPrices, bundles, hidePrices, finalAmounts);
    });
    return totals;
  }, [eventGroups, storedPrices, bundles, hidePrices, finalAmounts]);

  const subtotal = useMemo(
    () => Object.values(sectionTotals).reduce((s, v) => s + v, 0),
    [sectionTotals]
  );

  // Apply discount then calculate GST
  const afterDiscount = subtotal - (Number(discount) || 0);
  const gstData = useMemo(() => calcGST(afterDiscount, gstEnabled ? Number(gstRate) : 0, interState), [afterDiscount, gstEnabled, gstRate, interState]);
  const rounded = useMemo(() => roundOff(gstData.total), [gstData.total]);

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

  /** Triggers the browser print dialog with descriptive PDF filename */
  const handlePrint = () => {
    const dateStr = formatDateReadable(invoiceDate);
    document.title = `Invoice - ${billToName || event.clientName || 'Client'} ${invoiceNo} ${dateStr}`;
    window.print();
    document.title = 'EventScope';
  };

  /** Generates a formatted WhatsApp message with invoice details */
  const generateWhatsAppMsg = () => {
    let msg = `*INVOICE #${invoiceNo}*\n`;
    msg += `Date: ${formatDateReadable(invoiceDate)}\n`;
    msg += `From: ${settings.companyName}\n`;
    msg += `To: ${billToName}\n\n`;
    msg += `*Items:*\n`;
    let idx = 0;
    eventGroups.forEach(group => {
      if (hidePrices) {
        group.items.forEach(name => {
          idx++;
          const key = `${group.id}::${name}`;
          const p = storedPrices[key] || { qty: 1, rate: 0 };
          msg += `${idx}. ${name} (Qty: ${p.qty})\n`;
        });
        msg += `   ${group.name} — Final Amount: ${formatCurrency(sectionTotals[group.id] || 0)}\n`;
      } else {
        buildLineEntries(group.id, group.items, bundles).forEach(entry => {
          idx++;
          if (entry.type === 'bundle') {
            const memberNames = entry.bundle.itemKeys.map(k => k.split('::').slice(1).join('::'));
            msg += `${idx}. ${entry.bundle.name} (${memberNames.join(', ')}) - ₹${(entry.bundle.amount || 0).toLocaleString('en-IN')}\n`;
          } else {
            const p = storedPrices[entry.key] || { qty: 1, rate: 0 };
            msg += `${idx}. ${entry.name} - ₹${(p.qty * p.rate).toLocaleString('en-IN')}\n`;
          }
        });
      }
    });
    msg += `\nSubtotal: ${formatCurrency(subtotal)}`;
    if (discount > 0) msg += `\nDiscount: -${formatCurrency(discount)}`;
    if (advance > 0) msg += `\nAdvance Paid: -${formatCurrency(advance)}`;
    if (gstEnabled) {
      if (interState) {
        msg += `\nIGST (${gstRate}%): ${formatCurrency(gstData.igst)}`;
      } else {
        msg += `\nCGST (${Number(gstRate)/2}%): ${formatCurrency(gstData.cgst)}`;
        msg += `\nSGST (${Number(gstRate)/2}%): ${formatCurrency(gstData.sgst)}`;
      }
    }
    msg += `\n*TOTAL: ${formatCurrency(rounded.rounded)}*\n`;
    msg += `\n${settings.companyName} | ${settings.phone}`;
    return msg;
  };

  /** Opens WhatsApp with the pre-filled invoice message */
  const handleWhatsApp = () => {
    const phone = event.clientWhatsapp || event.clientPhone;
    if (phone) {
      window.open(waLink(phone, generateWhatsAppMsg()), '_blank');
    }
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  return (
    <div className="space-y-4 pb-8">
      {/* Controls - hidden in print */}
      <div data-no-print className="space-y-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-xl font-bold text-bb-text">Invoice</h1>
        </div>

        {/* Invoice configuration form */}
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Invoice No" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} />
            <Input label="Invoice Date" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            <Input label="Bill To (Name)" value={billToName} onChange={e => setBillToName(e.target.value)} />
            <Input label="Bill To (Address)" value={billToAddress} onChange={e => setBillToAddress(e.target.value)} />
            <Input label="Discount (₹)" type="number" value={discount} onChange={e => setDiscount(e.target.value)} />
            <Input label="Advance Paid (₹)" type="number" value={advance} onChange={e => setAdvance(e.target.value)} />
            <Select label="GST Rate" options={['5', '12', '18', '28']} value={gstRate} onChange={e => setGstRate(e.target.value)} />
          </div>
          <div className="flex items-center gap-6 mt-4">
            <Toggle label="GST" checked={gstEnabled} onChange={e => setGstEnabled(e.target.checked)} />
            <Toggle label="Inter-State (IGST)" checked={interState} onChange={e => setInterState(e.target.checked)} />
          </div>
        </Card>

        {/* Action buttons */}
        <div data-no-print className="flex gap-2 flex-wrap">
          <Button icon={Save} variant={hasUnsavedChanges ? 'secondary' : 'outline'} onClick={handleManualSave} disabled={autoSaving}>
            {autoSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button icon={Printer} onClick={handlePrint}>Print / Save PDF</Button>
          <Button icon={MessageSquare} variant="success" onClick={handleWhatsApp}>Share via WhatsApp</Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>Back</Button>
        </div>
      </div>

      {/* === Invoice Preview - printable document === */}
      <div className="doc-scroll">{/* scrolls sideways on phones */}
      <div ref={pdfRef} className="print-doc" style={{backgroundColor: 'white', color: '#1f2937', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', maxWidth: '800px', margin: '0 auto', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}>
        <table style={{width: '100%', borderCollapse: 'collapse', padding: '0', margin: '0'}}>
          <tbody>
            {/* Row 1: Title */}
            <tr>
              <td colSpan="6" style={{textAlign: 'center', padding: '24px 24px 12px'}}>
                <span style={{fontSize: '20px', fontWeight: '800', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#652D90'}}>INVOICE</span>
                <div style={{height: '3px', width: '80px', margin: '8px auto 0', backgroundColor: '#652D90', borderRadius: '2px'}} />
              </td>
            </tr>

            {/* Row 2: Company address left, Logo + Bill Date + Invoice # right */}
            <tr>
              <td colSpan="3" style={{verticalAlign: 'top', padding: '12px 24px', fontSize: '11px', color: '#4b5563', lineHeight: '1.7'}}>
                {/* Company block — from the tenant's own settings */}
                <span style={{fontWeight: '700', fontSize: '13px', color: '#1f2937'}}>{settings.companyName}</span>
                {settings.tagline && <span style={{color: '#4b5563'}}> — {settings.tagline}</span>}<br/>
                {(settings.address || '').split('\n').filter(Boolean).map((line, i) => (
                  <React.Fragment key={i}>{line}<br/></React.Fragment>
                ))}
                {[settings.phone && `Ph: ${settings.phone}`, settings.gstin && `GSTIN: ${settings.gstin}`].filter(Boolean).join(' | ')}
              </td>
              <td colSpan="3" style={{verticalAlign: 'top', textAlign: 'right', padding: '12px 24px'}}>
                {settings.logo && <img src={settings.logo} alt={settings.companyName || 'Logo'} style={{height: '40px', width: 'auto', marginLeft: 'auto', display: 'block'}} />}<br/>
                <span style={{fontSize: '11px', color: '#4b5563', lineHeight: '2'}}>Bill Date: {formatDateReadable(invoiceDate)}</span><br/>
                <span style={{fontSize: '11px', color: '#4b5563'}}>Invoice #: {invoiceNo}</span>
              </td>
            </tr>

            {/* Row 3: Thin gray separator */}
            <tr>
              <td colSpan="6" style={{padding: '0 24px'}}>
                <div style={{height: '1px', backgroundColor: '#e5e7eb'}} />
              </td>
            </tr>

            {/* Row 4: Two boxes with purple top border */}
            <tr>
              <td style={{verticalAlign: 'top', padding: '16px 24px 12px', width: '60%'}} colSpan="3">
                <div style={{borderTop: '3px solid #652D90', padding: '12px 0 0'}}>
                  <span style={{fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#652D90'}}>BILL TO/ CLIENT</span><br/>
                  <span style={{fontSize: '14px', fontWeight: '700', color: '#1f2937', lineHeight: '2'}}>{billToName}</span><br/>
                  {event.clientPhone && <span style={{fontSize: '11px', color: '#6b7280'}}>Phone: {event.clientPhone}</span>}
                  {billToAddress && <><br/><span style={{fontSize: '11px', color: '#6b7280'}}>{billToAddress}</span></>}
                </div>
              </td>
              <td style={{verticalAlign: 'top', padding: '16px 24px 12px', width: '40%'}} colSpan="3">
                <div style={{borderTop: '3px solid #652D90', padding: '12px 0 0', fontSize: '11px', color: '#4b5563', lineHeight: '1.9'}}>
                  <span style={{fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#652D90'}}>EVENT DETAILS</span><br/>
                  {event.eventType && <>Event: {event.eventType}<br/></>}
                  {(event.mainEvent?.date || event.date) && <>Date: {formatDateReadable(event.mainEvent?.date || event.date)}<br/></>}
                  {(event.mainEvent?.location || event.eventLocation) && <>Venue: {event.mainEvent?.location || event.eventLocation}</>}
                </div>
              </td>
            </tr>

            {/* Row 5: Spacer */}
            <tr><td colSpan="6" style={{padding: '6px 0'}} /></tr>

            {/* Items grouped by Event — sections with no items are skipped (empty sections aren't shown to the client) */}
            {eventGroups.filter(g => g.items.length > 0).map((group) => {
              let slNo = 0;

              return (
                <React.Fragment key={group.id}>
                  {/* Event group header — always shown, not just when there are multiple groups, so each event date is clearly labeled */}
                  <tr>
                    <td colSpan="6" style={{padding: '12px 24px 6px'}}>
                      <span style={{fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#652D90'}}>
                        {group.name}{group.date ? ` — ${formatDateReadable(group.date)}` : ''}{group.location ? `, ${group.location}` : ''}
                      </span>
                      <div style={{height: '2px', marginTop: '6px', backgroundColor: '#652D90', opacity: 0.3, borderRadius: '1px'}} />
                    </td>
                  </tr>

                  {/* Row 6: Table headers.
                      Hide-prices mode uses the same 6 logical columns but
                      redistributes them: DESCRIPTION stretches across its
                      own + the old PRICE slot, and QTY moves to sit at the
                      true right edge (its own + the old AMOUNT slot)
                      instead of leaving two empty columns after it. SAC
                      CODE stays visible since it's a regulatory code, not
                      a price. */}
                  {hidePrices ? (
                    <tr style={{backgroundColor: '#f5f0fa'}}>
                      <th colSpan="1" style={{padding: '8px 8px 8px 24px', textAlign: 'left', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '40px'}}>No.</th>
                      <th colSpan="1" style={{padding: '8px 8px', textAlign: 'left', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '90px'}}>SAC CODE</th>
                      <th colSpan="2" style={{padding: '8px 8px', textAlign: 'left', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>DESCRIPTION</th>
                      <th colSpan="2" style={{padding: '8px 8px 8px 8px', textAlign: 'right', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '150px', paddingRight: '24px'}}>QTY</th>
                    </tr>
                  ) : (
                    <tr style={{backgroundColor: '#f5f0fa'}}>
                      <th style={{padding: '8px 8px 8px 24px', textAlign: 'left', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '40px'}}>No.</th>
                      <th style={{padding: '8px 8px', textAlign: 'left', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '90px'}}>SAC CODE</th>
                      <th style={{padding: '8px 8px', textAlign: 'left', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>DESCRIPTION</th>
                      <th style={{padding: '8px 8px', textAlign: 'center', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '50px'}}>QTY</th>
                      <th style={{padding: '8px 8px', textAlign: 'right', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '90px'}}>PRICE</th>
                      <th style={{padding: '8px 8px 8px 8px', textAlign: 'right', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '100px', paddingRight: '24px'}}>AMOUNT</th>
                    </tr>
                  )}

                  {hidePrices ? (
                    // ---- Hide-prices mode: bundle-aware, item name + quantity only, redistributed across the same 6 columns (see header comment above) ----
                    buildLineEntries(group.id, group.items, bundles).map((entry) => {
                      if (entry.type === 'bundle') {
                        const b = entry.bundle;
                        const memberNames = b.itemKeys.map(k => k.split('::').slice(1).join('::'));
                        slNo++;
                        return (
                          <tr key={`bundle:${b.id}`} style={{borderBottom: '1px solid #f0f0f0'}}>
                            <td colSpan="1" style={{padding: '10px 8px 10px 24px', color: '#6b7280', fontSize: '12px'}}>{slNo}</td>
                            <td colSpan="1" style={{padding: '10px 8px', color: '#6b7280', fontFamily: 'monospace', fontSize: '11px'}}>{DEFAULT_SAC_CODE}</td>
                            <td colSpan="2" style={{padding: '10px 8px', color: '#1f2937', fontSize: '12px'}}>
                              <span style={{fontWeight: '600'}}>{b.name}</span>
                              {memberNames.map((mn, i) => (
                                <div key={i} style={{fontSize: '12px', color: '#1f2937', marginTop: '2px'}}>{mn}</div>
                              ))}
                            </td>
                            <td colSpan="2" style={{padding: '10px 8px 10px 8px', textAlign: 'right', color: '#4b5563', fontSize: '12px', paddingRight: '24px'}}>
                              <div style={{visibility: 'hidden', fontWeight: '600'}}>&nbsp;</div>
                              {b.itemKeys.map((k, i) => (
                                <div key={i} style={{marginTop: i === 0 ? 0 : '2px'}}>{(storedPrices[k] || { qty: 1 }).qty}</div>
                              ))}
                            </td>
                          </tr>
                        );
                      }
                      slNo++;
                      const { key, name } = entry;
                      const p = storedPrices[key] || { qty: 1, rate: 0 };
                      return (
                        <tr key={key} style={{borderBottom: '1px solid #f0f0f0'}}>
                          <td colSpan="1" style={{padding: '10px 8px 10px 24px', color: '#6b7280', fontSize: '12px'}}>{slNo}</td>
                          <td colSpan="1" style={{padding: '10px 8px', color: '#6b7280', fontFamily: 'monospace', fontSize: '11px'}}>{DEFAULT_SAC_CODE}</td>
                          <td colSpan="2" style={{padding: '10px 8px', color: '#1f2937', fontSize: '12px'}}>{name}</td>
                          <td colSpan="2" style={{padding: '10px 8px 10px 8px', textAlign: 'right', color: '#4b5563', fontSize: '12px', paddingRight: '24px'}}>{p.qty}</td>
                        </tr>
                      );
                    })
                  ) : (
                    // ---- Normal mode: standalone items priced individually, bundles as one grouped row ----
                    buildLineEntries(group.id, group.items, bundles).map((entry) => {
                      if (entry.type === 'bundle') {
                        const b = entry.bundle;
                        const memberNames = b.itemKeys.map(k => k.split('::').slice(1).join('::'));
                        slNo++;
                        return (
                          <tr key={`bundle:${b.id}`} style={{borderBottom: '1px solid #f0f0f0'}}>
                            <td style={{padding: '10px 8px 10px 24px', color: '#6b7280', fontSize: '12px'}}>{slNo}</td>
                            <td style={{padding: '10px 8px', color: '#6b7280', fontFamily: 'monospace', fontSize: '11px'}}>{DEFAULT_SAC_CODE}</td>
                            <td style={{padding: '10px 8px', color: '#1f2937', fontSize: '12px'}}>
                              <span style={{fontWeight: '600'}}>{b.name}</span>
                              {memberNames.map((mn, i) => (
                                <div key={i} style={{fontSize: '12px', color: '#1f2937', marginTop: '2px'}}>{mn}</div>
                              ))}
                            </td>
                            <td style={{padding: '10px 8px', textAlign: 'center', color: '#4b5563', fontSize: '12px'}}>
                              <div style={{visibility: 'hidden'}}>&nbsp;</div>
                              {b.itemKeys.map((k, i) => (
                                <div key={i} style={{marginTop: i === 0 ? 0 : '2px'}}>{(storedPrices[k] || { qty: 1 }).qty}</div>
                              ))}
                            </td>
                            <td style={{padding: '10px 8px', textAlign: 'right', color: '#4b5563', fontSize: '12px'}}>
                              <div style={{visibility: 'hidden'}}>&nbsp;</div>
                              {b.itemKeys.map((k, i) => {
                                const rate = (storedPrices[k] || { rate: 0 }).rate;
                                return <div key={i} style={{marginTop: i === 0 ? 0 : '2px'}}>{rate > 0 ? formatCurrency(rate) : '—'}</div>;
                              })}
                            </td>
                            <td style={{padding: '10px 8px', textAlign: 'right', fontWeight: '600', color: '#1f2937', fontSize: '12px', paddingRight: '24px'}}>
                              <div style={{visibility: 'hidden'}}>&nbsp;</div>
                              {formatCurrency(b.amount)}
                            </td>
                          </tr>
                        );
                      }
                      slNo++;
                      const { key, name } = entry;
                      const p = storedPrices[key] || { qty: 1, rate: 0 };
                      return (
                        <tr key={key} style={{borderBottom: '1px solid #f0f0f0'}}>
                          <td style={{padding: '10px 8px 10px 24px', color: '#6b7280', fontSize: '12px'}}>{slNo}</td>
                          <td style={{padding: '10px 8px', color: '#6b7280', fontFamily: 'monospace', fontSize: '11px'}}>{DEFAULT_SAC_CODE}</td>
                          <td style={{padding: '10px 8px', color: '#1f2937', fontSize: '12px'}}>{name}</td>
                          <td style={{padding: '10px 8px', textAlign: 'center', color: '#4b5563', fontSize: '12px'}}>{p.qty}</td>
                          <td style={{padding: '10px 8px', textAlign: 'right', color: '#4b5563', fontSize: '12px'}}>{formatCurrency(p.rate)}</td>
                          <td style={{padding: '10px 8px', textAlign: 'right', fontWeight: '600', color: '#1f2937', fontSize: '12px', paddingRight: '24px'}}>{formatCurrency(p.qty * p.rate)}</td>
                        </tr>
                      );
                    })
                  )}

                  {/* Group subtotal — always shown now (for hide-prices mode, this IS the manually-entered final amount) */}
                  <tr>
                    <td colSpan="6" style={{textAlign: 'right', padding: '10px 24px 16px'}}>
                      <span style={{fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginRight: '16px'}}>
                        {hidePrices ? 'Final Amount' : 'Subtotal'}
                      </span>
                      <span style={{fontSize: '14px', fontWeight: '700', color: '#1f2937'}}>{formatCurrency(sectionTotals[group.id] || 0)}</span>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}

            {/* Spacer before summary */}
            <tr><td colSpan="6" style={{padding: '8px 0'}} /></tr>

            {/* Summary Box */}
            <tr>
              <td colSpan="6" style={{padding: '0 24px'}}>
                <table style={{width: '100%', borderCollapse: 'collapse', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden'}}>
                  <tbody>
                    <tr style={{backgroundColor: '#f5f0fa'}}>
                      <td colSpan="2" style={{padding: '8px 16px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#652D90'}}>SUMMARY</td>
                    </tr>
                    {eventGroups.filter(g => g.items.length > 0).map((group) => (
                      <tr key={group.id} style={{borderBottom: '1px solid #f3f4f6'}}>
                        <td style={{fontSize: '12px', color: '#4b5563', padding: '8px 16px'}}>{group.name}</td>
                        <td style={{fontSize: '12px', color: '#1f2937', fontWeight: '500', textAlign: 'right', padding: '8px 16px'}}>{formatCurrency(sectionTotals[group.id] || 0)}</td>
                      </tr>
                    ))}
                    <tr style={{borderTop: '1px solid #e5e7eb'}}>
                      <td style={{fontSize: '12px', color: '#6b7280', padding: '8px 16px'}}>Sub Total</td>
                      <td style={{fontSize: '12px', color: '#1f2937', fontWeight: '500', textAlign: 'right', padding: '8px 16px'}}>{formatCurrency(subtotal)}</td>
                    </tr>
                    {Number(discount) > 0 && (
                      <tr style={{borderTop: '1px solid #f3f4f6'}}>
                        <td style={{fontSize: '12px', color: '#6b7280', padding: '6px 16px'}}>Discount</td>
                        <td style={{fontSize: '12px', color: '#dc2626', textAlign: 'right', padding: '6px 16px'}}>-{formatCurrency(discount)}</td>
                      </tr>
                    )}
                    {gstEnabled && !interState && (
                      <>
                        <tr style={{borderTop: '1px solid #f3f4f6'}}>
                          <td style={{fontSize: '12px', color: '#6b7280', padding: '6px 16px'}}>CGST ({Number(gstRate)/2}%)</td>
                          <td style={{fontSize: '12px', color: '#1f2937', textAlign: 'right', padding: '6px 16px'}}>{formatCurrency(gstData.cgst)}</td>
                        </tr>
                        <tr style={{borderTop: '1px solid #f3f4f6'}}>
                          <td style={{fontSize: '12px', color: '#6b7280', padding: '6px 16px'}}>SGST ({Number(gstRate)/2}%)</td>
                          <td style={{fontSize: '12px', color: '#1f2937', textAlign: 'right', padding: '6px 16px'}}>{formatCurrency(gstData.sgst)}</td>
                        </tr>
                      </>
                    )}
                    {gstEnabled && interState && (
                      <tr style={{borderTop: '1px solid #f3f4f6'}}>
                        <td style={{fontSize: '12px', color: '#6b7280', padding: '6px 16px'}}>IGST ({gstRate}%)</td>
                        <td style={{fontSize: '12px', color: '#1f2937', textAlign: 'right', padding: '6px 16px'}}>{formatCurrency(gstData.igst)}</td>
                      </tr>
                    )}
                    <tr style={{borderTop: '2px solid #652D90'}}>
                      <td style={{fontSize: '16px', fontWeight: '700', color: '#1f2937', padding: '12px 16px'}}>GRAND TOTAL</td>
                      <td style={{fontSize: '16px', fontWeight: '700', color: '#652D90', textAlign: 'right', padding: '12px 16px'}}>{formatCurrency(rounded.rounded)}</td>
                    </tr>
                    {Number(advance) > 0 && (
                      <>
                        <tr style={{borderTop: '1px solid #e5e7eb'}}>
                          <td style={{fontSize: '12px', color: '#6b7280', padding: '8px 16px'}}>Advance Paid</td>
                          <td style={{fontSize: '12px', color: '#059669', textAlign: 'right', padding: '8px 16px'}}>-{formatCurrency(advance)}</td>
                        </tr>
                        <tr style={{borderTop: '1px solid #e5e7eb', backgroundColor: '#f5f0fa'}}>
                          <td style={{fontSize: '14px', fontWeight: '700', color: '#1f2937', padding: '10px 16px'}}>BALANCE DUE</td>
                          <td style={{fontSize: '14px', fontWeight: '700', color: '#652D90', textAlign: 'right', padding: '10px 16px'}}>{formatCurrency(rounded.rounded - Number(advance))}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </td>
            </tr>

            {/* Spacer */}
            <tr><td colSpan="6" style={{padding: '8px 0'}} /></tr>

            {/* Bank + Terms side by side */}
            <tr>
              <td colSpan="3" style={{verticalAlign: 'top', padding: '0 12px 0 24px', width: '50%'}}>
                <div style={{backgroundColor: '#f3f4f6', borderRadius: '4px', overflow: 'hidden'}}>
                  <div style={{padding: '6px 12px', backgroundColor: '#e5e7eb'}}>
                    <span style={{fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4b5563'}}>BANK ACCOUNT DETAILS</span>
                  </div>
                  <div style={{padding: '10px 12px', fontSize: '11px', color: '#4b5563', lineHeight: '1.9'}}>
                    Account Name: <strong>{settings.bankDetails?.accountName}</strong><br/>
                    A/C No: <strong style={{fontFamily: 'monospace'}}>{settings.bankDetails?.accountNo}</strong><br/>
                    Bank: {settings.bankDetails?.bankName}<br/>
                    Branch: {settings.bankDetails?.branch}<br/>
                    IFSC: <strong style={{fontFamily: 'monospace'}}>{settings.bankDetails?.ifscCode}</strong>
                  </div>
                </div>
              </td>
              <td colSpan="3" style={{verticalAlign: 'top', padding: '0 24px 0 12px', width: '50%'}}>
                <div style={{backgroundColor: '#f3f4f6', borderRadius: '4px', overflow: 'hidden'}}>
                  <div style={{padding: '6px 12px', backgroundColor: '#e5e7eb'}}>
                    <span style={{fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4b5563'}}>TERMS & CONDITIONS</span>
                  </div>
                  <div style={{padding: '10px 12px', fontSize: '11px', color: '#4b5563', lineHeight: '1.6'}}>
                    {settings.termsAndConditions?.map((t, i) => (
                      <div key={i} style={{padding: '2px 0'}}>{i + 1}. {t}</div>
                    ))}
                  </div>
                </div>
              </td>
            </tr>

            {/* Spacer */}
            <tr><td colSpan="6" style={{padding: '8px 0'}} /></tr>

            {/* Make checks payable */}
            <tr>
              <td colSpan="6" style={{padding: '12px 24px 2px', fontSize: '11px', color: '#6b7280', borderTop: '1px solid #e5e7eb', textAlign: 'center'}}>
                Make all checks payable to "<span style={{fontWeight: '600', color: '#1f2937'}}>{settings.companyName}</span>"
              </td>
            </tr>

            {/* Contact line */}
            <tr>
              <td colSpan="6" style={{padding: '2px 24px 12px', textAlign: 'center'}}>
                <span style={{fontSize: '11px', color: '#6b7280'}}>
                  If you have any questions about this invoice, please contact{' '}
                  <span style={{color: '#4b5563'}}>{settings.companyName}</span>,{' '}
                  <span style={{color: '#4b5563'}}>{settings.phone}</span>
                </span>
              </td>
            </tr>

            {/* Thank You Footer */}
            <tr>
              <td colSpan="6" style={{textAlign: 'center', padding: '16px 24px 24px', borderTop: '1px solid #e5e7eb'}}>
                <span style={{fontSize: '14px', fontWeight: '700', color: '#1f2937', letterSpacing: '0.05em'}}>
                  {settings.thankYouMessage || 'Thank You For Your Business!'}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
