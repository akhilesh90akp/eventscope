/**
 * EventFormLaptop — New event / Edit event on laptops, in 3 steps
 *
 * The same three steps as the phone (EventFormPhone) in the laptop look:
 *   1 Client        name, phone, WhatsApp ("same as phone" ticked), address,
 *                   or pick a past client
 *   2 Event & date  main event (type, name, budget, date with "Several days",
 *                   time, venue) and the sub events as rows
 *   3 Services      one card per event with the picked services as chips, a
 *                   type-and-Add box and the service categories (tick boxes)
 * The title row scrolls away; the three step tabs stay pinned. One white card
 * holds the step; Cancel · Save draft · Back · Next sit at its bottom right.
 * The page (NewDraft / EditDraft) keeps the data and saves; it all comes in
 * through `f` (the same object EventFormPhone takes).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { PageHeader, Field, Switch } from './LaptopUI';
import VenueInput from './VenueInput';
import { useConfirm } from './useConfirm';
import { EVENT_TYPES } from '../constants/data';
import { functionDatesProblem, functionDays, formatDateReadable } from '../utils/helpers';

// ============================================================
// CONSTANTS
// ============================================================
const STEPS = ['Client', 'Event & date', 'Services'];
const LABEL = 'block text-[12.5px] font-semibold text-gray-700 mb-1';
const BOX = 'w-full h-[38px] rounded-xl border border-bb-border bg-bb-input px-3 text-[13.5px] text-bb-text focus:outline-none focus:ring-2 focus:ring-bb-accent/40';

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Date (+ "Several days" switch, End date when on) for one event */
function DatesRow({ fn, onChange, required, error, id }) {
  const days = fn.multiDay ? functionDays(fn) : 1;
  const shown = error ? functionDatesProblem(fn, required) : '';
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12.5px] font-semibold text-gray-700">{fn.multiDay ? 'Start date' : 'Date'}{required && <span className="text-red-500"> *</span>}</span>
        <Switch checked={!!fn.multiDay} label="Several days" testId={`${id}-multi`}
          onChange={on => { onChange('multiDay', on); if (!on) onChange('endDate', ''); }} />
      </div>
      <div className="flex items-center gap-2">
        <input type="date" aria-label={fn.multiDay ? 'Start date' : 'Date'} data-testid={`${id}-date`} value={fn.date || ''} onChange={e => onChange('date', e.target.value)} className={`${BOX} ${shown ? '!border-red-400' : ''}`} />
        {fn.multiDay && <>
          <span className="text-[13px] text-bb-muted">to</span>
          <input type="date" aria-label="End date" data-testid={`${id}-end`} value={fn.endDate || ''} min={fn.date || undefined} onChange={e => onChange('endDate', e.target.value)} className={BOX} />
        </>}
      </div>
      {fn.multiDay && days > 1 && !shown && <span className="inline-block mt-1 text-[12px] font-bold text-bb-accent-hover" data-testid="function-days">{days} days</span>}
      {shown && <p className="text-[12.5px] text-red-600 mt-1">{shown}</p>}
    </div>
  );
}

/** One event's services: chips, type-and-Add, categories as foldable tick lists */
function ServicesCard({ x, items, categories, f }) {
  const [text, setText] = useState('');
  const [openCat, setOpenCat] = useState(() => (x.main ? categories[0]?.id : null));
  const add = () => { const v = text.trim(); if (v && !items.includes(v)) f.addCustomItem(x.id, v); setText(''); };
  const dateText = x.fn.date ? `${formatDateReadable(x.fn.date)}` : '';
  return (
    <section className="rounded-2xl border border-bb-border overflow-hidden" data-testid="services-card" data-fn={x.id}>
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#f6f3ff] border-b border-violet-100">
        <span className="text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white border border-violet-200 text-bb-accent-hover">{x.main ? 'Main event' : 'Sub event'}</span>
        <b className="text-[14.5px]">{x.fn.name}</b>
        {dateText && <span className="text-[12.5px] text-bb-muted">{dateText}</span>}
        <span className="flex-1" />
        <b className="text-[12.5px] text-bb-accent-hover">{items.length} added</b>
      </div>
      <div className="px-4 py-3.5 space-y-3.5">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-bb-muted mb-2">Added</p>
          <div className="flex flex-wrap gap-2 min-h-[30px]">
            {items.length === 0 && <span className="text-[13px] text-bb-muted">No services yet</span>}
            {items.map(i => (
              <button key={i} onClick={() => f.removeItem(x.id, i)} aria-label={`Remove ${i}`}
                className="inline-flex items-center gap-1.5 pl-3 pr-1.5 min-h-[28px] rounded-full bg-violet-100 text-bb-accent-hover text-[13px] font-semibold cursor-pointer">
                {i}<span className="w-4 h-4 rounded-full bg-violet-200 flex items-center justify-center"><X size={10} /></span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-bb-muted mb-2">Add services</p>
          <div className="flex gap-2.5">
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Type a service and press Enter" aria-label={`Add a service to ${x.fn.name}`} data-testid="svc-text" className={`${BOX} flex-1`} />
            <button onClick={add} disabled={!text.trim()} className="min-h-[38px] px-4 rounded-xl border border-violet-300 bg-violet-50 text-bb-accent-hover font-bold text-[13.5px] cursor-pointer disabled:opacity-40">Add</button>
          </div>
          <p className="text-[12px] text-bb-muted mt-2">or pick from the list</p>
        </div>
        <div className="rounded-xl border border-bb-border overflow-hidden divide-y divide-bb-border">
          {categories.map(cat => {
            const list = cat.items || [];
            const n = list.filter(i => items.includes(i)).length;
            const on = openCat === cat.id;
            return (
              <div key={cat.id}>
                <button onClick={() => setOpenCat(on ? null : cat.id)} aria-expanded={on} className={`w-full flex items-center gap-2 min-h-[40px] px-3.5 text-left cursor-pointer ${on ? 'bg-gray-50' : ''}`}>
                  <span className="flex-1 font-bold text-[13.5px]">{cat.icon} {cat.name}</span>
                  {n > 0 && <span className="text-[12px] font-bold text-bb-accent-hover">{n} added</span>}
                  <ChevronDown size={16} className={`text-bb-muted transition-transform ${on ? 'rotate-180' : ''}`} />
                </button>
                {on && (
                  <div className="grid grid-cols-3 gap-x-2 px-3 py-2">
                    {list.map(item => {
                      const has = items.includes(item);
                      return (
                        <button key={item} onClick={() => f.toggleItem(x.id, item)} aria-pressed={has} className="flex items-center gap-2 min-h-[34px] px-1 text-left text-[13.5px] cursor-pointer">
                          <span className={`w-[18px] h-[18px] shrink-0 rounded-[5px] border flex items-center justify-center ${has ? 'bg-bb-accent border-bb-accent text-white' : 'border-gray-300 bg-white'}`}>{has && <Check size={12} />}</span>
                          <span className={`min-w-0 break-words ${has ? 'font-semibold' : ''}`}>{item}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// EventFormLaptop — MAIN COMPONENT
// ============================================================

export default function EventFormLaptop({ f }) {
  const confirm = useConfirm();
  const [step, setStep] = useState(1);
  const [waSame, setWaSame] = useState(() => !f.form.clientWhatsapp || f.form.clientWhatsapp === f.form.clientPhone);
  const [clientsOpen, setClientsOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [otherType, setOtherType] = useState(false);
  const cardRef = useRef(null);
  const edit = f.mode === 'edit';

  const pastClients = useMemo(() => {
    const seen = new Set();
    return [...(f.events || [])].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .filter(e => e.clientName && e.clientPhone && !seen.has(e.clientPhone) && seen.add(e.clientPhone));
  }, [f.events]);

  // ------------------------------------------------------------
  // VALIDATION (per step, same rules as the phone)
  // ------------------------------------------------------------
  const stepErrors = (n) => {
    const errs = {};
    if (n === 1) {
      if (!f.form.clientName.trim()) errs.clientName = 'Required';
      if (!f.form.clientPhone.trim()) errs.clientPhone = 'Required';
    }
    if (n === 2) {
      if (!f.form.eventType) errs.eventType = 'Required';
      const p = functionDatesProblem(f.mainEvent, true);
      if (p) errs.mainDate = p;
      f.subEvents.forEach(s => { const pr = functionDatesProblem(s); if (pr) errs[`sub-${s.id}`] = pr; });
    }
    return errs;
  };
  const goTo = (target) => {
    if (target > step) {
      for (let n = step; n < target; n++) {
        const errs = stepErrors(n);
        if (Object.keys(errs).length) { f.setErrors(errs); setStep(n); return; }
      }
    }
    f.setErrors({});
    setStep(target);
  };
  const save = () => {
    for (const n of [1, 2]) {
      const errs = stepErrors(n);
      if (Object.keys(errs).length) { f.setErrors(errs); setStep(n); return; }
    }
    f.onSave();
  };
  const cancel = async () => {
    const touched = edit || f.form.clientName || f.form.clientPhone || f.mainEvent.date || f.mainEvent.items.length;
    if (touched && !(await confirm({ title: edit ? 'Leave without saving?' : 'Discard this event?', message: edit ? 'Your changes won’t be saved.' : 'What you typed won’t be saved.', confirmLabel: edit ? 'Leave' : 'Discard', cancelLabel: 'Keep editing', tone: 'danger' }))) return;
    f.onCancel();
  };

  const setPhone = (v) => { f.set('clientPhone', v); if (waSame) f.set('clientWhatsapp', ''); };
  const setWaSameOn = (on) => { setWaSame(on); if (on) f.set('clientWhatsapp', ''); };
  const fns = [{ id: 'main', main: true, fn: { ...f.mainEvent, name: f.mainEvent.name || f.form.eventType || 'Main event' } }, ...f.subEvents.map(s => ({ id: s.id, fn: { ...s, name: s.name || 'Sub event' } }))];
  const customType = otherType || f.isCustomEventType;

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  const btn = 'min-h-[40px] px-4 rounded-xl text-[14px] font-semibold cursor-pointer disabled:opacity-50';
  return (
    <div className="space-y-4 pb-8" data-testid="event-form-laptop" data-step={step}>
      <PageHeader title={edit ? 'Edit event' : 'New event'} sub={f.form.clientName ? f.form.clientName : undefined} onBack={cancel} />

      {/* Pinned step tabs */}
      <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2 bg-bb-bg" data-testid="step-tabs">
        <div className="flex bg-white border border-bb-border rounded-2xl px-2">
          {STEPS.map((t, i) => {
            const n = i + 1;
            const on = step === n;
            return (
              <button key={t} onClick={() => goTo(n)} aria-current={on ? 'step' : undefined} data-testid={`tab-${n}`}
                className={`flex items-center gap-2.5 px-5 py-3 text-[14px] font-semibold border-b-[3px] cursor-pointer ${on ? 'border-bb-accent text-bb-accent-hover' : 'border-transparent text-bb-muted hover:text-bb-text'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold ${n < step ? 'bg-violet-100 text-bb-accent-hover' : on ? 'bg-bb-accent text-white' : 'bg-gray-100 text-bb-muted'}`}>{n < step ? <Check size={13} /> : n}</span>
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={cardRef} className="bg-white border border-bb-border rounded-2xl p-6 space-y-5">
        {/* === 1 · CLIENT === */}
        {step === 1 && <>
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 max-w-[860px]">
            <div>
              <Field label={<>Client name <span className="text-red-500">*</span></>} placeholder="Full name" value={f.form.clientName} onChange={e => f.set('clientName', e.target.value)} data-testid="client-name" autoFocus />
              {f.errors.clientName && <p className="text-[12.5px] text-red-600 mt-1">Type the client’s name</p>}
            </div>
            <div>
              <Field label={<>Phone <span className="text-red-500">*</span></>} placeholder="Mobile number" inputMode="tel" value={f.form.clientPhone} onChange={e => setPhone(e.target.value)} data-testid="client-phone" />
              {f.errors.clientPhone && <p className="text-[12.5px] text-red-600 mt-1">Type a phone number</p>}
            </div>
            <div>
              <Field label="WhatsApp" placeholder={waSame ? 'Same as phone' : 'WhatsApp number'} inputMode="tel" disabled={waSame} value={waSame ? f.form.clientPhone : f.form.clientWhatsapp} onChange={e => f.set('clientWhatsapp', e.target.value)} />
              <label className="inline-flex items-center gap-2 mt-2 text-[13px] text-gray-700 cursor-pointer">
                <input type="checkbox" checked={waSame} onChange={e => setWaSameOn(e.target.checked)} className="w-4 h-4 accent-bb-accent" data-testid="wa-same" />Same as phone
              </label>
            </div>
            <Field label="Address" placeholder="Client address (optional)" value={f.form.clientAddress} onChange={e => f.set('clientAddress', e.target.value)} />
          </div>
          {!edit && pastClients.length > 0 && (
            <div>
              <button onClick={() => setClientsOpen(o => !o)} className="text-[13.5px] font-semibold text-bb-accent-hover cursor-pointer inline-flex items-center gap-1.5" data-testid="past-clients"><Users size={15} />Already a client? Pick from past clients</button>
              {clientsOpen && (
                <div className="mt-2 max-w-[520px] rounded-xl border border-bb-border">
                  <label className="flex items-center gap-2 px-3 border-b border-bb-border"><Search size={15} className="text-bb-muted" /><input value={clientQuery} onChange={e => setClientQuery(e.target.value)} placeholder="Search name or phone" className="flex-1 h-10 bg-transparent text-[13.5px] focus:outline-none" /></label>
                  <div className="max-h-[220px] overflow-y-auto">
                    {pastClients.filter(c => !clientQuery || `${c.clientName} ${c.clientPhone}`.toLowerCase().includes(clientQuery.toLowerCase())).slice(0, 30).map(c => (
                      <button key={c.id} onClick={() => {
                        f.set('clientName', c.clientName); f.set('clientPhone', c.clientPhone);
                        f.set('clientWhatsapp', c.clientWhatsapp && c.clientWhatsapp !== c.clientPhone ? c.clientWhatsapp : '');
                        setWaSame(!c.clientWhatsapp || c.clientWhatsapp === c.clientPhone);
                        f.set('clientAddress', c.clientAddress || '');
                        setClientsOpen(false);
                      }} className="w-full text-left px-3 py-2 border-b border-gray-100 last:border-0 hover:bg-violet-50 cursor-pointer">
                        <b className="block text-[13.5px]">{c.clientName}</b><span className="text-[12.5px] text-gray-600">{c.clientPhone} · {c.eventType}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>}

        {/* === 2 · EVENT & DATE === */}
        {step === 2 && <>
          <h2 className="text-[12px] font-bold tracking-[0.06em] uppercase text-bb-muted">Main event</h2>
          <div className="grid grid-cols-3 gap-x-5 gap-y-4">
            <label className="block min-w-0">
              <span className={LABEL}>Event type <span className="text-red-500">*</span></span>
              <select value={customType ? 'Other' : f.eventTypeSelectValue} data-testid="event-type"
                onChange={e => { setOtherType(e.target.value === 'Other'); f.handleEventTypeSelect(e.target.value); }}
                className={`${BOX} ${f.errors.eventType ? '!border-red-400' : ''}`}>
                <option value="">Select…</option>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {f.errors.eventType && !f.isCustomEventType && <span className="block text-[12.5px] text-red-600 mt-1">Pick the event type</span>}
            </label>
            {customType
              ? <Field label={<>Which event? <span className="text-red-500">*</span></>} placeholder="e.g. Madhuramveppu" value={f.form.eventType} onChange={e => f.set('eventType', e.target.value)} />
              : <Field label="Event name" placeholder={f.form.eventType || 'e.g. Wedding Ceremony'} value={f.mainEvent.name} onChange={e => f.setMainField('name', e.target.value)} />}
            <Field label="Budget ₹" type="number" inputMode="numeric" placeholder="Approx" value={f.form.budget} onChange={e => f.set('budget', e.target.value)} />
            {customType && <Field label="Event name" placeholder="e.g. Wedding Ceremony" value={f.mainEvent.name} onChange={e => f.setMainField('name', e.target.value)} />}
            <div className={f.mainEvent.multiDay ? 'col-span-2' : ''}><DatesRow fn={f.mainEvent} onChange={f.setMainField} required error={f.errors.mainDate} id="main" /></div>
            <Field label="Time" type="time" value={f.mainEvent.time} onChange={e => f.setMainField('time', e.target.value)} />
          </div>
          <VenueInput value={f.mainEvent.location} onChange={v => f.setMainField('location', v)} events={f.events} testId="main-venue" />

          <div className="flex items-center pt-2">
            <h2 className="text-[12px] font-bold tracking-[0.06em] uppercase text-bb-muted flex-1">Sub events <span className="ml-1 text-bb-accent-hover">{f.subEvents.length}</span></h2>
            <button onClick={f.addSubEvent} data-testid="add-sub" className="min-h-[36px] px-3.5 rounded-xl bg-violet-50 border border-violet-200 text-bb-accent-hover text-[13.5px] font-bold inline-flex items-center gap-1.5 cursor-pointer"><Plus size={16} />Add sub event</button>
          </div>
          {f.subEvents.length === 0
            ? <p className="text-[13px] text-bb-muted">Haldi, Mehendi, Home function, Reception…</p>
            : (
              <div className="space-y-3" data-testid="sub-list">
                {f.subEvents.map(s => (
                  <div key={s.id} className="rounded-xl border border-bb-border p-3.5" data-testid="sub-row">
                    <div className="grid grid-cols-[1.1fr_1.6fr_0.8fr_1.6fr_auto] gap-3 items-start">
                      <Field label="Name" placeholder="e.g. Haldi, Reception" value={s.name} onChange={e => f.setSubField(s.id, 'name', e.target.value)} data-testid="sub-name" />
                      <DatesRow fn={s} onChange={(k, v) => f.setSubField(s.id, k, v)} error={f.errors[`sub-${s.id}`]} id={`sub-${s.id}`} />
                      <Field label="Time" type="time" value={s.time} onChange={e => f.setSubField(s.id, 'time', e.target.value)} />
                      <VenueInput label="Venue" value={s.location} onChange={v => f.setSubField(s.id, 'location', v)} events={f.events} testId={`sub-venue-${s.id}`} />
                      <button aria-label={`Remove ${s.name || 'sub event'}`} className="mt-6 w-9 h-9 rounded-xl border border-gray-300 flex items-center justify-center text-bb-muted hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        onClick={async () => { if (await confirm({ title: 'Remove this sub event?', message: <><b className="text-bb-text">{s.name || 'This sub event'}</b> and its services will be taken off.</>, confirmLabel: 'Remove', tone: 'danger' })) f.removeSubEvent(s.id); }}><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </>}

        {/* === 3 · SERVICES === */}
        {step === 3 && <>
          <p className="text-[13.5px] text-gray-600 -mt-1">Each event has its own services. Click ✕ on a chip to remove one.</p>
          {fns.map(x => <ServicesCard key={x.id} x={x} categories={f.categories} f={f} items={x.id === 'main' ? f.mainEvent.items : (f.subEvents.find(s => s.id === x.id)?.items || [])} />)}
          <label className="block">
            <span className={LABEL}>Notes</span>
            <textarea rows={3} placeholder="Anything the team should know" value={f.form.notes} onChange={e => f.set('notes', e.target.value)} className="w-full rounded-xl border border-bb-border bg-bb-input px-3 py-2 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
          </label>
        </>}

        {/* Buttons at the bottom right of the card */}
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-bb-border" data-testid="steps-bar">
          <button onClick={cancel} className={`${btn} text-gray-600 hover:text-bb-text`} data-testid="step-cancel">Cancel</button>
          {step < 3 && <button onClick={save} disabled={f.saving} className={`${btn} border border-gray-300 bg-white hover:bg-gray-50`} data-testid="step-save-draft">{edit ? 'Save' : 'Save draft'}</button>}
          {step > 1 && <button onClick={() => goTo(step - 1)} className={`${btn} border border-gray-300 bg-white hover:bg-gray-50`} data-testid="step-back">Back</button>}
          {step < 3
            ? <button onClick={() => goTo(step + 1)} className={`${btn} bg-bb-accent text-white hover:bg-bb-accent-hover`} data-testid="step-next">Next</button>
            : <button onClick={save} disabled={f.saving} className={`${btn} bg-bb-accent text-white hover:bg-bb-accent-hover inline-flex items-center gap-2`} data-testid="step-save"><Check size={16} />{f.saving ? 'Saving…' : edit ? 'Save changes' : 'Save draft'}</button>}
        </div>
      </div>
    </div>
  );
}
