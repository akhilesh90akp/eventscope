/**
 * ContractDocument — the Event Services Agreement as it prints / goes to PDF.
 *
 * Purely presentational: the Contract page passes in the company settings,
 * the client/party details and the numbers worked out by utils/contract.js.
 * Inline styles (like the quotation and bill) so the printout and the in-app
 * PDF look the same on every device. The wording is fixed; only the blanks
 * (names, dates, amounts, the company's own terms) change.
 *
 * Legal note: a standard agreement under the Indian Contract Act, 1872.
 * Companies should have their advocate review it once before first use.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { forwardRef } from 'react';
import { formatCurrency, formatDateReadable } from '../utils/helpers';

// ============================================================
// CONSTANTS — shared inline styles
// ============================================================
const S = {
  doc: { backgroundColor: 'white', color: '#111', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '13px', lineHeight: 1.55, maxWidth: '800px', margin: '0 auto', padding: '40px 44px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' },
  h1: { fontSize: '19px', textAlign: 'center', letterSpacing: '0.06em', margin: '0 0 4px', fontWeight: 700 },
  sub: { textAlign: 'center', fontSize: '11.5px', color: '#444', margin: '0 0 18px' },
  h2: { fontSize: '13px', margin: '18px 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 },
  p: { margin: '0 0 7px', textAlign: 'justify' },
  ol: { margin: '0 0 7px', paddingLeft: '22px' },
  li: { marginBottom: '4px', textAlign: 'justify' },
  table: { width: '100%', borderCollapse: 'collapse', margin: '6px 0 10px', fontSize: '12px' },
  th: { border: '1px solid #999', padding: '6px 8px', textAlign: 'left', backgroundColor: '#f2eef7', verticalAlign: 'top' },
  td: { border: '1px solid #999', padding: '6px 8px', textAlign: 'left', verticalAlign: 'top' },
  num: { textAlign: 'right', whiteSpace: 'nowrap' },
  box: { border: '1px solid #999', padding: '8px 10px', margin: '6px 0 10px' },
  sigRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', marginTop: '52px', fontSize: '12px' },
  sigLine: { borderTop: '1px solid #111', paddingTop: '6px' },
};

const money = (n) => formatCurrency(n || 0);
const day = (d) => (d ? formatDateReadable(d) : '—');
/** "18:00" → "6:00 pm" */
const time12 = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};

// ============================================================
// ContractDocument — MAIN COMPONENT
// ============================================================

/**
 * @param {object} props.settings  company settings (name, address, gstin, logo)
 * @param {object} props.details   event.contract-like values: agreementNo, agreementDate,
 *        place, clientName, clientAddress, clientPhone, advanceDate, advanceMode,
 *        advanceRef, stampSpace, signatory, quoteRef
 * @param {object} props.c         result of buildContract()
 */
const ContractDocument = forwardRef(function ContractDocument({ settings, details, c }, ref) {
  const t = c.terms;
  const court = t.courtCity || '__________';
  const place = details.place || t.place || t.courtCity || '__________';
  const company = settings.companyName || 'the Service Provider';

  return (
    <div ref={ref} className="print-doc" style={S.doc}>
      {/* Optional blank top area so the first page can be printed on stamp paper */}
      {details.stampSpace && (
        <div style={{ height: '360px', position: 'relative' }}>
          <div data-no-pdf className="print:hidden" style={{ position: 'absolute', inset: 0, border: '1.5px dashed #c9b8e0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a74a8', fontFamily: 'Arial, sans-serif', fontSize: '12px', textAlign: 'center' }}>
            Left blank for stamp paper<br />(not printed)
          </div>
        </div>
      )}

      <h1 style={S.h1}>EVENT SERVICES AGREEMENT</h1>
      <p style={S.sub}>
        Agreement No. {details.agreementNo || '—'}
        {details.quoteRef ? ` · Quotation ref. ${details.quoteRef}` : ''}
      </p>

      <p style={S.p}>This Agreement is made at <b>{place}</b> on <b>{day(details.agreementDate)}</b> between:</p>
      <p style={S.p}>
        <b>1. {company.toUpperCase()}</b>
        {settings.tagline ? `, ${settings.tagline}` : ''}
        {settings.address ? `, ${settings.address.replace(/\n+/g, ', ')}` : ''}
        {settings.gstin ? `, GSTIN ${settings.gstin}` : ''}
        {details.signatory ? <>, represented by its proprietor / authorised signatory <b>{details.signatory}</b></> : ''}
        {' '}(the <b>“Service Provider”</b>); and
      </p>
      <p style={S.p}>
        <b>2. {details.clientName || '__________'}</b>
        {details.clientAddress ? `, residing at ${details.clientAddress.replace(/\n+/g, ', ')}` : ''}
        {details.clientPhone ? `, phone ${details.clientPhone}` : ''}
        {' '}(the <b>“Client”</b>).
      </p>
      <p style={S.p}>
        The Service Provider and the Client are together called the “Parties”. The Client wishes to engage the Service
        Provider for the event services described below, and the Service Provider agrees to provide them on the following terms.
      </p>

      {/* 1. Event details */}
      <h2 style={S.h2}>1. Event details</h2>
      <table style={S.table}>
        <thead>
          <tr><th style={S.th}>Function</th><th style={S.th}>Date &amp; time</th><th style={S.th}>Venue</th><th style={{ ...S.th, ...S.num }}>Amount</th></tr>
        </thead>
        <tbody>
          {c.functions.map(f => (
            <tr key={f.id}>
              <td style={S.td}>{f.name}</td>
              <td style={S.td}>{day(f.date)}{f.time ? `, ${time12(f.time)}` : ''}</td>
              <td style={S.td}>{f.location || '—'}</td>
              <td style={{ ...S.td, ...S.num }}>{money(f.total)}</td>
            </tr>
          ))}
          <tr>
            <th style={S.th} colSpan={3}>Total contract price{c.price !== c.quoteTotal ? ' (as agreed)' : ''}</th>
            <th style={{ ...S.th, ...S.num }}>{money(c.price)}</th>
          </tr>
        </tbody>
      </table>

      {/* 2. Scope */}
      <h2 style={S.h2}>2. Scope of services</h2>
      <p style={S.p}>
        The Service Provider will supply, set up, operate and remove the items and services listed in <b>Annexure A</b>
        {details.quoteRef ? <>, as per Quotation <b>{details.quoteRef}</b></> : ''}. Anything not listed in Annexure A is outside
        this Agreement. Any addition or change must be agreed in writing (WhatsApp or email is acceptable) and will be charged
        separately at the rates then agreed.
      </p>

      {/* 3. Price and payment */}
      <h2 style={S.h2}>3. Price and payment</h2>
      <div style={S.box} data-pdf-break>
        <table style={{ ...S.table, margin: 0 }}>
          <tbody>
            <tr><td style={S.td}>Total contract price</td><td style={{ ...S.td, ...S.num }}>{money(c.price)}</td></tr>
            <tr>
              <td style={S.td}>
                Advance received{details.advanceDate ? ` on ${day(details.advanceDate)}` : ''}
                {details.advanceMode ? ` by ${details.advanceMode}` : ''}
                {details.advanceRef ? ` (ref. ${details.advanceRef})` : ''}
              </td>
              <td style={{ ...S.td, ...S.num }}>{money(c.advance)}</td>
            </tr>
            <tr><th style={S.th}>Balance payable on or before {day(c.balanceDueDate)}</th><th style={{ ...S.th, ...S.num }}>{money(c.balance)}</th></tr>
          </tbody>
        </table>
      </div>
      <ol style={S.ol}>
        {c.advance > 0 && <li style={S.li}>The Service Provider acknowledges receipt of the advance stated above.</li>}
        <li style={S.li}>The balance must be paid on or before the date above. The Service Provider may decline to begin setup if the balance is unpaid.</li>
        <li style={S.li}>Payment may be made by bank transfer or UPI to the Service Provider’s account shown on its invoice, or in cash against a written receipt.</li>
        <li style={S.li}>
          {t.gstIncluded
            ? 'The contract price includes GST, where applicable.'
            : 'The contract price does not include GST. If GST applies, it will be charged at the prevailing rate on the invoice.'}
        </li>
        <li style={S.li}>Charges payable to the venue (hall rent, venue electricity, corkage, parking or permission fees) are the Client’s responsibility unless listed in Annexure A.</li>
      </ol>

      {/* 4–5. Responsibilities */}
      <h2 style={S.h2}>4. Responsibilities of the Client</h2>
      <ol style={S.ol}>
        <li style={S.li}>Arrange the venue and all permissions needed for the event, and confirm that décor, sound and lighting are allowed there, including any time limits on sound.</li>
        <li style={S.li}>Give the Service Provider access to the venue at least {t.setupHours} hours before each function for setup, and up to {t.removalHours} hours after it for removal.</li>
        <li style={S.li}>Arrange a safe electricity supply where the venue provides it. Generator and fuel are supplied only if listed in Annexure A.</li>
        <li style={S.li}>Take reasonable care that guests do not damage the Service Provider’s property. The cost of any loss or damage caused by the Client or the Client’s guests will be paid by the Client at actual repair or replacement cost.</li>
      </ol>
      <h2 style={S.h2}>5. Responsibilities of the Service Provider</h2>
      <ol style={S.ol}>
        <li style={S.li}>Complete setup before the start time of each function and provide the services with due care, in a professional manner.</li>
        <li style={S.li}>Ensure its staff behave properly and follow the venue’s rules.</li>
        <li style={S.li}>Remove its materials after the event and leave the venue reasonably clean of its own materials.</li>
        <li style={S.li}>If an item in Annexure A becomes unavailable, provide an item of equal or better quality after informing the Client, or reduce the price by that item’s value.</li>
      </ol>

      {/* 6. Cancellation */}
      <h2 style={S.h2}>6. Cancellation and postponement</h2>
      <table style={S.table}>
        <thead><tr><th style={S.th}>If the Client cancels…</th><th style={S.th}>Amount retained by the Service Provider</th></tr></thead>
        <tbody>
          <tr><td style={S.td}>More than {t.farDays} days before the first function</td><td style={S.td}>The advance is refunded, less {t.adminPct}% of the contract price</td></tr>
          <tr><td style={S.td}>{t.nearDays}–{t.farDays} days before</td><td style={S.td}>The advance is retained; nothing further is payable</td></tr>
          <tr><td style={S.td}>Less than {t.nearDays} days before</td><td style={S.td}>{t.nearPct}% of the contract price (any amount paid above this is refunded)</td></tr>
        </tbody>
      </table>
      <ol style={S.ol}>
        <li style={S.li}>Cancellation must be in writing. Refunds are paid within {t.refundDays} days of the written cancellation.</li>
        <li style={S.li}>The Client may postpone the event <b>once</b>, at no charge, if notice is given at least {t.nearDays} days before and the new date is within 6 months and available. Amounts paid are carried over. Price changes for the new date, if any, will be agreed in writing.</li>
        <li style={S.li}>If the Service Provider cancels for any reason other than Clause 7, it will refund all amounts received from the Client in full within 7 days.</li>
      </ol>

      {/* 7–10. Standard clauses */}
      <h2 style={S.h2}>7. Events beyond control (force majeure)</h2>
      <p style={S.p}>Neither Party is responsible for failure or delay caused by events beyond its reasonable control, such as natural calamity, flood, epidemic, government orders or restrictions, curfew, riot, strike, or an accident or emergency at the venue. In such a case the Parties will first try to fix a new date. If that is not possible, the Service Provider will refund the amounts received less the costs it has already reasonably incurred for this event, with supporting details.</p>
      <h2 style={S.h2}>8. Limit of liability</h2>
      <p style={S.p}>The Service Provider’s total liability under this Agreement is limited to the contract price. It is not liable for indirect losses, or for loss of or damage to guests’ personal belongings, except where caused by its own negligence.</p>
      {t.portfolioPhotos && (
        <>
          <h2 style={S.h2}>9. Photographs</h2>
          <p style={S.p}>The Service Provider may photograph its own décor and setup and use these for its portfolio and social media, without showing the Client’s family or guests in a recognisable way, unless the Client objects in writing.</p>
        </>
      )}
      <h2 style={S.h2}>{t.portfolioPhotos ? '10' : '9'}. General</h2>
      <ol style={S.ol}>
        <li style={S.li}>This Agreement, with Annexure A{details.quoteRef ? ' and the referenced quotation' : ''}, is the entire agreement between the Parties and replaces earlier discussions. Changes are valid only if agreed in writing by both Parties.</li>
        <li style={S.li}>If any part of this Agreement is found invalid, the rest remains in force.</li>
        <li style={S.li}>This Agreement is governed by the laws of India. The Parties will first try to settle any dispute by discussion. Courts at {court} shall alone have jurisdiction.</li>
      </ol>

      {/* Signatures */}
      <div data-pdf-break style={{ breakInside: 'avoid' }}>
        <p style={{ ...S.p, marginTop: '16px' }}>Signed by the Parties on the date and at the place first written above.</p>
        <div style={S.sigRow}>
          <div style={S.sigLine}><b>For {company.toUpperCase()}</b><br />Authorised signatory{details.signatory ? `: ${details.signatory}` : ''}<br />(Seal)</div>
          <div style={S.sigLine}><b>Client</b><br />{details.clientName || ''}</div>
        </div>
        <div style={{ ...S.sigRow, marginTop: '36px', lineHeight: 2.1 }}>
          <div><b>Witness 1</b><br />Name: ______________________<br />Address: ____________________<br />Signature: ___________________</div>
          <div><b>Witness 2</b><br />Name: ______________________<br />Address: ____________________<br />Signature: ___________________</div>
        </div>
      </div>

      {/* Annexure A — items from the quotation */}
      <div style={{ breakBefore: 'page', paddingTop: '28px' }} data-pdf-page-start>
        <h2 style={S.h2}>Annexure A — Items and services{details.quoteRef ? ` (from Quotation ${details.quoteRef})` : ''}</h2>
        {c.functions.map(f => (
          <table key={f.id} style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: '28px' }}>#</th>
                <th style={S.th}>{f.name} — {day(f.date)}{f.location ? `, ${f.location}` : ''}</th>
                <th style={{ ...S.th, width: '40px' }}>Qty</th>
                <th style={{ ...S.th, ...S.num, width: '110px' }}>{c.hidePrices ? '' : 'Amount'}</th>
              </tr>
            </thead>
            <tbody>
              {f.lines.map((l, i) => (
                <tr key={i}>
                  <td style={S.td}>{i + 1}</td>
                  <td style={S.td}>{l.name}</td>
                  <td style={S.td}>{l.qty}</td>
                  <td style={{ ...S.td, ...S.num }}>{l.amount === null ? '' : l.included ? 'Included' : money(l.amount)}</td>
                </tr>
              ))}
              <tr><th style={S.th} colSpan={3}>{f.name} total</th><th style={{ ...S.th, ...S.num }}>{money(f.total)}</th></tr>
            </tbody>
          </table>
        ))}
        <div style={{ ...S.sigRow, marginTop: '40px' }}>
          <div style={S.sigLine}>Service Provider initials</div>
          <div style={S.sigLine}>Client initials</div>
        </div>
      </div>
    </div>
  );
});

export default ContractDocument;
