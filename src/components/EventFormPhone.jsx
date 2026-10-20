/**
 * EventFormPhone — New event / Edit event on phones, in 3 short steps
 *
 *   1 Client        name, phone ("WhatsApp is the same number"), address,
 *                   or pick a past client
 *   2 Event & date  event type (dropdown), name, date with "Several days"
 *                   right beside it, time, budget, venue (VenueInput), then
 *                   the sub events as rows with ✎ / 🗑 and "Add sub event"
 *   3 Services      one card per event (main + each sub event) with the
 *                   picked services as chips; "Add services" opens a picker
 *                   for that one event, with a "Selected" tray on top
 * Bottom bar: Cancel · Back · Next (Save draft on the last step); "Save
 * draft" / "Save" also sits in the title bar. The page (NewDraft / EditDraft)
 * keeps the data and does the saving; everything comes in through `f`.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, Plus, X, Search, ChevronDown, Check, Users } from 'lucide-react';
import ActionBar from './ActionBar';
import { usePhoneHeader } from './phoneScreens';
import { HeaderTextButton } from './PhoneHeader';
import BottomSheet from './BottomSheet';
import VenueInput from './VenueInput';
import { useConfirm } from './useConfirm';
import { FunctionRow, SectionLabel, SwitchRow, DateField, TextField, IconButton } from './PhoneUI';
import { EVENT_TYPES } from '../constants/data';
import { functionDatesProblem, functionDays } from '../utils/helpers';

// ============================================================
// CONSTANTS
// ============================================================
const STEPS = ['Client', 'Event & date', 'Services'];

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Progress bar + step names, drawn under the purple title bar */
function StepBar({ step }) {
  return (
    <div className="-mx-4 -mt-4 mb-1 bg-bb-sidebar px-5 pt-1 pb-[18px]" data-testid="step-bar">
      <div className="flex gap-1.5">
        {STEPS.map((_, i) => <span key={i} className={`flex-1 h-[5px] rounded-full ${i < step ? 'bg-violet-400' : 'bg-white/20'}`} />)}
      </div>
      <div className="flex justify-between mt-2.5 text-[13px] text-[#cdb8ea]">
        {STEPS.map((t, i) => <span key={t} className={i + 1 === step ? 'text-white font-bold' : ''}>{i + 1} {t}</span>)}
      </div>
    </div>
  );
}

/** Date + "Several days" switch side by side; End date below when on */
function DatesBlock({ fn, onChange, required, error, idPrefix }) {
  const days = fn.multiDay ? functionDays(fn) : 1;
  const shown = error ? functionDatesProblem(fn, required) : '';
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="flex-1 min-w-0">
          <DateField label={fn.multiDay ? 'Start date' : 'Date'} required={required} id={`${idPrefix}-date`} value={fn.date} onChange={v => onChange('date', v)} testId={`${idPrefix}-date`} />
        </div>
        <label className="w-[78px] shrink-0 flex flex-col items-center gap-1 pb-1 cursor-pointer">
          <input type="checkbox" className="sr-only peer" checked={!!fn.multiDay} data-testid={`${idPrefix}-multi`}
            onChange={e => { onChange('multiDay', e.target.checked); if (!e.target.checked) onChange('endDate', ''); }} />
          <span aria-hidden="true" className={`relative w-11 h-[26px] rounded-full ${fn.multiDay ? 'bg-bb-accent' : 'bg-gray-300'}`}>
            <span className={`absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow transition-transform ${fn.multiDay ? 'translate-x-[18px]' : ''}`} />
          </span>
          <span className="text-[11.5px] leading-tight text-gray-600 text-center">Several days</span>
        </label>
      </div>
      {fn.multiDay && (
        <DateField label="End date" required id={`${idPrefix}-end`} value={fn.endDate} min={fn.date || undefined} onChange={v => onChange('endDate', v)} testId={`${idPrefix}-end`} />
      )}
      {fn.multiDay && days > 1 && !shown && <span className="inline-block text-[12px] font-bold bg-violet-100 text-bb-accent-hover rounded-full px-2.5 py-0.5" data-testid="function-days">{days} days</span>}
      {shown && <p className="text-[13px] text-red-600">{shown}</p>}
    </div>
  );
}

/** Services picker for ONE event: Selected tray, search, categories, custom item */
function ServicesPicker({ fnName, selected, categories, onToggle, onAddCustom, onClose }) {
  const [query, setQuery] = useState('');
  const [openCat, setOpenCat] = useState(categories[0]?.id || null);
  const [custom, setCustom] = useState('');
  const q = query.trim().toLowerCase();
  const addCustom = () => {
    const v = custom.trim();
    if (!v || selected.includes(v)) return;
    onAddCustom(v);
    setCustom('');
  };
  return (
    <BottomSheet open onClose={onClose} title={`Services for ${fnName}`} testId="services-picker"
      footer={<button onClick={onClose} data-testid="services-done" className="w-full min-h-[48px] rounded-xl bg-bb-accent text-white font-semibold inline-flex items-center justify-center gap-2 cursor-pointer">
        <Check size={18} />{selected.length ? `Done · ${selected.length} service${selected.length === 1 ? '' : 's'}` : 'Done'}
      </button>}>
      {/* Selected tray — everything picked, even inside closed categories */}
      <div className="rounded-2xl bg-violet-50 px-3.5 py-3 mb-3.5" data-testid="selected-tray">
        <div className="flex items-center"><b className="flex-1 text-[14px] text-bb-accent-hover">Selected · {selected.length}</b>{selected.length > 0 && <span className="text-[12.5px] text-gray-600">tap to remove</span>}</div>
        {selected.length === 0
          ? <p className="text-[13px] text-gray-600 mt-1">Nothing yet — tap services below.</p>
          : <div className="flex flex-wrap gap-1.5 mt-2">{selected.map(s => (
            <button key={s} onClick={() => onToggle(s)} className="inline-flex items-center gap-1 text-[13px] font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-bb-accent-hover cursor-pointer">{s}<X size={13} /></button>
          ))}</div>}
      </div>
      <label className="flex items-center gap-2.5 min-h-[48px] rounded-xl border border-bb-border bg-bb-input px-3.5 mb-3">
        <Search size={18} className="text-gray-500" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search services…" className="flex-1 bg-transparent text-[16px] focus:outline-none" />
      </label>
      <div className="space-y-2.5">
        {categories.map(cat => {
          const items = (cat.items || []).filter(i => !q || i.toLowerCase().includes(q));
          if (!items.length) return null;
          const open = q ? true : openCat === cat.id;
          const picked = (cat.items || []).filter(i => selected.includes(i)).length;
          return (
            <div key={cat.id} className={`rounded-xl border ${open ? 'border-violet-200 bg-violet-50/50' : 'border-bb-border bg-white'}`}>
              <button onClick={() => setOpenCat(open && !q ? null : cat.id)} className="w-full flex items-center gap-3 min-h-[54px] px-3.5 text-left cursor-pointer">
                <span className="text-[18px]">{cat.icon}</span>
                <b className="flex-1 text-[15px]">{cat.name}</b>
                {picked > 0 && <span className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-bb-accent-hover">{picked} picked</span>}
                <ChevronDown size={18} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="flex flex-wrap gap-2 px-3.5 pb-3.5">
                  {items.map(i => {
                    const on = selected.includes(i);
                    return (
                      <button key={i} onClick={() => onToggle(i)} aria-pressed={on}
                        className={`min-h-[38px] px-3 rounded-full border text-[13.5px] font-semibold cursor-pointer ${on ? 'bg-bb-accent border-bb-accent text-white' : 'bg-white border-gray-300 text-bb-text'}`}>
                        {on && '✓ '}{i}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-3.5">
        <input value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustom()} placeholder="Custom service…" aria-label="Custom service"
          className="flex-1 min-h-[46px] rounded-xl border border-bb-border bg-bb-input px-3.5 text-[16px] focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
        <IconButton icon={Plus} label="Add custom service" onClick={addCustom} />
      </div>
    </BottomSheet>
  );
}

// ============================================================
// EventFormPhone — MAIN COMPONENT
// ============================================================

export default function EventFormPhone({ f }) {
  const confirm = useConfirm();
  const [step, setStep] = useState(1);
  const [subEdit, setSubEdit] = useState(null);         // id of the sub event being edited (sheet)
  const [picker, setPicker] = useState(null);           // 'main' or a sub event id
  const [clientsOpen, setClientsOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [otherType, setOtherType] = useState(false);   // "Other" picked → type the event's name
  const [waSame, setWaSame] = useState(() => !f.form.clientWhatsapp || f.form.clientWhatsapp === f.form.clientPhone);
  const subCount = useRef(f.subEvents.length);

  // "Add sub event" was tapped → open the new one's sheet (not when an
  // existing event's sub events load in on Edit)
  const adding = useRef(false);
  const addSub = () => { adding.current = true; f.addSubEvent(); };
  useEffect(() => {
    if (adding.current && f.subEvents.length > subCount.current) setSubEdit(f.subEvents[f.subEvents.length - 1].id);
    adding.current = false;
    subCount.current = f.subEvents.length;
  }, [f.subEvents]);

  // An event whose WhatsApp differs from its phone (filled in after loading)
  useEffect(() => {
    if (f.form.clientWhatsapp && f.form.clientWhatsapp !== f.form.clientPhone) setWaSame(false);
  }, [f.form.clientWhatsapp, f.form.clientPhone]);

  // Each step starts at the top
  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  // Past clients (newest first, one per phone number)
  const pastClients = useMemo(() => {
    const seen = new Set();
    return [...(f.events || [])].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .filter(e => e.clientName && e.clientPhone && !seen.has(e.clientPhone) && seen.add(e.clientPhone));
  }, [f.events]);

  // ------------------------------------------------------------
  // VALIDATION (per step)
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
  const next = () => {
    const errs = stepErrors(step);
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    setStep(s => Math.min(3, s + 1));
  };
  /** Save from any step: go to the first step with a problem */
  const save = () => {
    for (const n of [1, 2]) {
      const errs = stepErrors(n);
      if (Object.keys(errs).length) { f.setErrors(errs); setStep(n); return; }
    }
    f.onSave();
  };
  // "Save draft" / "Save" in the title bar (a ref, so it always runs the latest form)
  const saveRef = useRef(save);
  saveRef.current = save;
  const sub = `Step ${step} of 3${f.form.clientName ? ` · ${f.form.clientName}` : ''}`;
  usePhoneHeader({
    sub,
    right: <HeaderTextButton onClick={() => saveRef.current()} data-testid="header-save">{f.mode === 'edit' ? 'Save' : 'Save draft'}</HeaderTextButton>,
  }, [sub, f.mode]);
  const cancel = async () => {
    const touched = f.mode === 'edit' || f.form.clientName || f.form.clientPhone || f.mainEvent.date || f.mainEvent.items.length;
    if (touched && !(await confirm({ title: f.mode === 'edit' ? 'Leave without saving?' : 'Discard this event?', message: f.mode === 'edit' ? 'Your changes won’t be saved.' : 'What you typed won’t be saved.', confirmLabel: f.mode === 'edit' ? 'Leave' : 'Discard', cancelLabel: 'Keep editing', tone: 'danger' }))) return;
    f.onCancel();
  };

  // WhatsApp = phone unless switched off
  const setPhone = (v) => { f.set('clientPhone', v); if (waSame) f.set('clientWhatsapp', ''); };
  const setWaSameOn = (on) => { setWaSame(on); if (on) f.set('clientWhatsapp', ''); };

  const fns = [{ id: 'main', fn: { ...f.mainEvent, name: f.mainEvent.name || f.form.eventType || 'Main event' }, main: true }, ...f.subEvents.map(s => ({ id: s.id, fn: { ...s, name: s.name || 'Sub event' } }))];
  const editing = f.subEvents.find(s => s.id === subEdit);
  const pickerFn = fns.find(x => x.id === picker);

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  return (
    <div className="space-y-5" data-testid="event-form-phone" data-step={step}>
      <StepBar step={step} />

      {/* === STEP 1 · CLIENT === */}
      {step === 1 && <>
        <div className="bg-white border border-bb-border rounded-2xl p-[18px] space-y-4">
          <div>
            <TextField label="Client name" required placeholder="Full name" value={f.form.clientName} onChange={e => f.set('clientName', e.target.value)} data-testid="client-name" />
            {f.errors.clientName && <p className="text-[13px] text-red-600 mt-1">Type the client’s name</p>}
          </div>
          <div>
            <TextField label="Phone" required placeholder="Mobile number" inputMode="tel" value={f.form.clientPhone} onChange={e => setPhone(e.target.value)} data-testid="client-phone" />
            {f.errors.clientPhone && <p className="text-[13px] text-red-600 mt-1">Type a phone number</p>}
          </div>
          <SwitchRow title="WhatsApp is the same number" checked={waSame} onChange={setWaSameOn} testId="wa-same" />
          {!waSame && <TextField label="WhatsApp" placeholder="WhatsApp number" inputMode="tel" value={f.form.clientWhatsapp} onChange={e => f.set('clientWhatsapp', e.target.value)} />}
          <TextField label="Address" placeholder="Client address (optional)" value={f.form.clientAddress} onChange={e => f.set('clientAddress', e.target.value)} />
        </div>
        {f.mode !== 'edit' && pastClients.length > 0 && (
          <p className="text-center text-[14px] text-gray-600">Already a client?{' '}
            <button onClick={() => setClientsOpen(true)} className="font-semibold text-bb-accent-hover min-h-[40px] cursor-pointer" data-testid="past-clients">Pick from past clients</button>
          </p>
        )}
      </>}

      {/* === STEP 2 · EVENT & DATE === */}
      {step === 2 && <>
        <SectionLabel>Main event</SectionLabel>
        <div className="bg-white border border-bb-border rounded-2xl p-[18px] space-y-4">
          <label className="block">
            <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">Event type <span className="text-red-500">*</span></span>
            <select value={otherType || f.isCustomEventType ? 'Other' : f.eventTypeSelectValue} data-testid="event-type"
              onChange={e => { setOtherType(e.target.value === 'Other'); f.handleEventTypeSelect(e.target.value); }}
              className={`w-full min-h-[48px] rounded-xl border bg-bb-input px-3.5 text-[16px] ${f.errors.eventType ? 'border-red-400' : 'border-bb-border'}`}>
              <option value="">Select…</option>
              {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {f.errors.eventType && !f.isCustomEventType && <span className="block text-[13px] text-red-600 mt-1">Pick the event type</span>}
          </label>
          {otherType || f.isCustomEventType ? (
            <TextField label="Which event?" required placeholder="e.g. Madhuramveppu" value={f.form.eventType} onChange={e => f.set('eventType', e.target.value)} />
          ) : null}
          <TextField label="Event name" placeholder={f.form.eventType || 'e.g. Wedding Ceremony'} value={f.mainEvent.name} onChange={e => f.setMainField('name', e.target.value)} />
          <DatesBlock fn={f.mainEvent} onChange={f.setMainField} required error={f.errors.mainDate} idPrefix="main" />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Time" type="time" value={f.mainEvent.time} onChange={e => f.setMainField('time', e.target.value)} />
            <TextField label="Budget ₹" type="number" inputMode="numeric" placeholder="Approx" value={f.form.budget} onChange={e => f.set('budget', e.target.value)} />
          </div>
          <VenueInput value={f.mainEvent.location} onChange={v => f.setMainField('location', v)} events={f.events} testId="main-venue" />
        </div>

        <SectionLabel right={<button onClick={addSub} className="min-h-[40px] px-1 inline-flex items-center gap-1 text-[14px] font-semibold text-bb-accent-hover cursor-pointer" data-testid="add-sub-top"><Plus size={17} />Add</button>}>
          Sub events · {f.subEvents.length}
        </SectionLabel>
        {f.subEvents.length > 0 && (
          <div className="bg-white border border-bb-border rounded-2xl divide-y divide-bb-border" data-testid="sub-list">
            {f.subEvents.map(s => (
              <div key={s.id}>
                <FunctionRow fn={{ ...s, name: s.name || 'Sub event' }} className="px-3.5 py-3"
                  right={<div className="flex gap-1.5">
                    <IconButton icon={Pencil} label={`Edit ${s.name || 'sub event'}`} size={40} onClick={() => setSubEdit(s.id)} />
                    <IconButton icon={Trash2} label={`Remove ${s.name || 'sub event'}`} size={40} onClick={async () => {
                      if (await confirm({ title: 'Remove this sub event?', message: <><b className="text-bb-text">{s.name || 'This sub event'}</b> and its services will be taken off.</>, confirmLabel: 'Remove', tone: 'danger' })) f.removeSubEvent(s.id);
                    }} />
                  </div>} />
                {f.errors[`sub-${s.id}`] && <p className="px-3.5 pb-3 -mt-1 text-[13px] text-red-600">{f.errors[`sub-${s.id}`]}</p>}
              </div>
            ))}
          </div>
        )}
        <button onClick={addSub} data-testid="add-sub"
          className="w-full min-h-[52px] rounded-2xl border-[1.5px] border-dashed border-bb-accent bg-violet-50 text-bb-accent-hover font-bold text-[15.5px] inline-flex items-center justify-center gap-2 cursor-pointer">
          <Plus size={19} />Add sub event
        </button>
        <p className="text-[13px] text-gray-600 -mt-2 text-center">Haldi, Mehendi, Home function, Reception…</p>
      </>}

      {/* === STEP 3 · SERVICES === */}
      {step === 3 && <>
        <p className="text-[14px] text-gray-600">Each event has its own services. Tap ✕ to remove one.</p>
        {fns.map(x => {
          const items = x.id === 'main' ? f.mainEvent.items : (f.subEvents.find(s => s.id === x.id)?.items || []);
          return (
            <div key={x.id} className="bg-white border border-bb-border rounded-2xl p-[18px]" data-testid="services-card" data-fn={x.id}>
              <FunctionRow fn={x.fn} main={x.main && fns.length > 1} detail={`${items.length} service${items.length === 1 ? '' : 's'}`} />
              <div className="flex flex-wrap gap-2 my-3.5">
                {items.length === 0 && <span className="text-[13.5px] text-gray-600">No services yet</span>}
                {items.map(i => (
                  <button key={i} onClick={() => f.removeItem(x.id, i)} aria-label={`Remove ${i}`}
                    className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-violet-100 text-bb-accent-hover text-[13.5px] font-semibold cursor-pointer">
                    {i}<span className="w-5 h-5 rounded-full bg-violet-200 flex items-center justify-center"><X size={12} /></span>
                  </button>
                ))}
              </div>
              <button onClick={() => setPicker(x.id)} data-testid="add-services"
                className={`w-full min-h-[46px] rounded-xl font-semibold inline-flex items-center justify-center gap-2 cursor-pointer ${items.length ? 'border border-gray-300 bg-white' : 'border border-violet-200 bg-violet-50 text-bb-accent-hover'}`}>
                <Plus size={18} />{items.length ? 'Add more services' : 'Add services'}
              </button>
            </div>
          );
        })}
        <div className="bg-white border border-bb-border rounded-2xl p-[18px]">
          <TextField label="Notes" as="textarea" placeholder="Any extra notes…" value={f.form.notes} onChange={e => f.set('notes', e.target.value)} />
        </div>
      </>}

      {/* === BOTTOM BAR: Cancel · Back · Next / Save === */}
      <ActionBar testId="steps-bar">
        {step === 1
          ? <button onClick={cancel} className="flex-1 min-h-[48px] rounded-xl border border-gray-300 bg-white font-semibold cursor-pointer" data-testid="step-cancel">Cancel</button>
          : <>
            <button onClick={cancel} className="min-h-[48px] px-2 font-semibold text-gray-600 cursor-pointer" data-testid="step-cancel">Cancel</button>
            <button onClick={() => setStep(s => s - 1)} className="flex-1 min-h-[48px] rounded-xl border border-gray-300 bg-white font-semibold cursor-pointer" data-testid="step-back">Back</button>
          </>}
        {step < 3
          ? <button onClick={next} className="flex-[1.7] min-h-[48px] rounded-xl bg-bb-accent text-white font-semibold cursor-pointer" data-testid="step-next">Next: {STEPS[step]}</button>
          : <button onClick={save} disabled={f.saving} className="flex-[1.7] min-h-[48px] rounded-xl bg-bb-accent text-white font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50" data-testid="step-save">
            <Check size={18} />{f.saving ? 'Saving…' : f.mode === 'edit' ? 'Save changes' : 'Save as draft'}
          </button>}
      </ActionBar>

      {/* === SHEETS === */}
      {editing && (
        <BottomSheet open onClose={() => setSubEdit(null)} title={editing.name || 'Sub event'} sub="Its own date, time and venue" testId="sub-sheet"
          footer={<button onClick={() => setSubEdit(null)} className="w-full min-h-[48px] rounded-xl bg-bb-accent text-white font-semibold cursor-pointer" data-testid="sub-done">Done</button>}>
          <div className="space-y-4 pb-2">
            <TextField label="Name" placeholder="e.g. Haldi, Home function, Reception" value={editing.name} onChange={e => f.setSubField(editing.id, 'name', e.target.value)} autoFocus data-testid="sub-name" />
            <DatesBlock fn={editing} onChange={(k, v) => f.setSubField(editing.id, k, v)} error={f.errors[`sub-${editing.id}`]} idPrefix="sub" />
            <TextField label="Time" type="time" value={editing.time} onChange={e => f.setSubField(editing.id, 'time', e.target.value)} />
            <VenueInput value={editing.location} onChange={v => f.setSubField(editing.id, 'location', v)} events={f.events} testId="sub-venue" />
          </div>
        </BottomSheet>
      )}
      {pickerFn && (
        <ServicesPicker fnName={pickerFn.fn.name} categories={f.categories}
          selected={pickerFn.id === 'main' ? f.mainEvent.items : (f.subEvents.find(s => s.id === pickerFn.id)?.items || [])}
          onToggle={(i) => f.toggleItem(pickerFn.id, i)} onAddCustom={(i) => f.addCustomItem(pickerFn.id, i)} onClose={() => setPicker(null)} />
      )}
      {clientsOpen && (
        <BottomSheet open onClose={() => setClientsOpen(false)} title="Past clients" testId="clients-sheet">
          <label className="flex items-center gap-2.5 min-h-[48px] rounded-xl border border-bb-border bg-bb-input px-3.5 mb-2">
            <Search size={18} className="text-gray-500" />
            <input value={clientQuery} onChange={e => setClientQuery(e.target.value)} placeholder="Search name or phone" className="flex-1 bg-transparent text-[16px] focus:outline-none" />
          </label>
          {pastClients.filter(c => !clientQuery || `${c.clientName} ${c.clientPhone}`.toLowerCase().includes(clientQuery.toLowerCase())).slice(0, 30).map(c => (
            <button key={c.id} onClick={() => {
              f.set('clientName', c.clientName); f.set('clientPhone', c.clientPhone);
              f.set('clientWhatsapp', c.clientWhatsapp && c.clientWhatsapp !== c.clientPhone ? c.clientWhatsapp : '');
              setWaSame(!c.clientWhatsapp || c.clientWhatsapp === c.clientPhone);
              f.set('clientAddress', c.clientAddress || '');
              setClientsOpen(false);
            }} className="w-full flex items-center gap-3 min-h-[58px] border-b border-bb-border text-left cursor-pointer">
              <Users size={18} className="text-bb-accent shrink-0" />
              <span className="flex-1 min-w-0"><b className="block text-[15px] truncate">{c.clientName}</b><span className="block text-[13px] text-gray-600">{c.clientPhone} · {c.eventType}</span></span>
            </button>
          ))}
        </BottomSheet>
      )}
    </div>
  );
}
