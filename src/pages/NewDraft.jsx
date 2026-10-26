/**
 * NewDraft — Event creation form with sub-events support
 *
 * Multi-section form for creating a new event draft. Includes client info,
 * main event details with items, optional sub-events each with their own
 * items, and notes. Validates required fields before saving.
 *
 * Save flow: handleSubmit awaits AppContext.addEvent() and only shows a
 * success toast / navigates away if the Firestore write actually succeeded.
 * On failure, the real error is shown and the user stays on the page with
 * their data intact. See CODE_STRUCTURE.md §4.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Button from '../components/Button';
import EventFormPhone from '../components/EventFormPhone';
import EventFormLaptop from '../components/EventFormLaptop';
import { useIsPhone } from '../components/useIsPhone';
import { EVENT_TYPES } from '../constants/data';
import { functionDatesProblem, functionDatesToSave, genId } from '../utils/helpers';
import { Lock } from 'lucide-react';

// ============================================================
// NewDraft — MAIN COMPONENT
// ============================================================

/** Form page for creating a new event draft */
export default function NewDraft() {
  const { categories, addEvent, showToast, isSuspended, isOwner, events } = useApp();
  const navigate = useNavigate();
  const isPhone = useIsPhone();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------

  // Form state
  const [form, setForm] = useState({
    clientName: '', clientPhone: '', clientWhatsapp: '', clientAddress: '',
    eventType: '', budget: '', notes: '',
  });

  // Main event state
  const [mainEvent, setMainEvent] = useState({
    name: '', date: '', endDate: '', multiDay: false, time: '', location: '', items: [],
  });

  // Sub-events state
  const [subEvents, setSubEvents] = useState([]);

  const [errors, setErrors] = useState({});

  // `saving` disables the submit button and shows a spinner state while the
  // Firestore write is in flight, preventing duplicate drafts from double-clicks.
  const [saving, setSaving] = useState(false);

  // ------------------------------------------------------------
  // EVENT HANDLERS — FORM FIELDS
  // ------------------------------------------------------------

  /** Shorthand helper to update a single form field */
  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  // Event Type dropdown: form.eventType holds the real value (a preset or
  // free-typed custom text). Show "Other" as selected whenever the current
  // value isn't one of the presets, and reveal a text input to type it.
  const isCustomEventType = form.eventType !== '' && !EVENT_TYPES.includes(form.eventType);
  const eventTypeSelectValue = isCustomEventType ? 'Other' : form.eventType;
  const handleEventTypeSelect = (val) => {
    // Switching to "Other" from a preset clears the field so the user
    // types fresh; switching away from "Other" just applies the preset.
    set('eventType', val === 'Other' ? (isCustomEventType ? form.eventType : '') : val);
  };

  /** Update main event field */
  const setMainField = (key, val) => setMainEvent(p => ({ ...p, [key]: val }));

  /** Toggle item in main event */
  const toggleMainItem = (item) => {
    setMainEvent(p => ({
      ...p,
      items: p.items.includes(item) ? p.items.filter(i => i !== item) : [...p.items, item],
    }));
  };

  /** Remove item from main event */
  const removeMainItem = (item) => {
    setMainEvent(p => ({ ...p, items: p.items.filter(i => i !== item) }));
  };

  /** Add custom item to main event */
  const addCustomMainItem = (item) => {
    setMainEvent(p => ({ ...p, items: [...p.items, item] }));
  };

  // ------------------------------------------------------------
  // EVENT HANDLERS — SUB-EVENTS
  // ------------------------------------------------------------

  /** Add a new sub-event */
  const addSubEvent = () => {
    setSubEvents(p => [...p, { id: genId(), name: '', date: '', endDate: '', multiDay: false, time: '', location: '', items: [] }]);
  };

  /** Remove a sub-event by id */
  const removeSubEvent = (id) => {
    setSubEvents(p => p.filter(s => s.id !== id));
  };

  /** Update a sub-event field */
  const setSubField = (id, key, val) => {
    setSubEvents(p => p.map(s => s.id === id ? { ...s, [key]: val } : s));
  };

  /** Toggle item in a sub-event */
  const toggleSubItem = (subId, item) => {
    setSubEvents(p => p.map(s => {
      if (s.id !== subId) return s;
      return { ...s, items: s.items.includes(item) ? s.items.filter(i => i !== item) : [...s.items, item] };
    }));
  };

  /** Remove item from a sub-event */
  const removeSubItem = (subId, item) => {
    setSubEvents(p => p.map(s => s.id === subId ? { ...s, items: s.items.filter(i => i !== item) } : s));
  };

  /** Add custom item to a sub-event */
  const addCustomSubItem = (subId, item) => {
    setSubEvents(p => p.map(s => s.id === subId ? { ...s, items: [...s.items, item] } : s));
  };

  // ------------------------------------------------------------
  // VALIDATION
  // ------------------------------------------------------------

  /** Validates required fields and returns true if form is valid */
  const validate = () => {
    const errs = {};
    if (!form.clientName.trim()) errs.clientName = 'Required';
    if (!form.clientPhone.trim()) errs.clientPhone = 'Required';
    const mainProblem = functionDatesProblem(mainEvent, true);
    if (mainProblem) errs.mainDate = mainProblem;
    subEvents.forEach(s => { const pr = functionDatesProblem(s); if (pr) errs[`sub-${s.id}`] = pr; });
    if (!form.eventType) errs.eventType = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ------------------------------------------------------------
  // SUBMIT
  // ------------------------------------------------------------

  /**
   * Validates and saves the event as a draft, then navigates to the drafts
   * list — but ONLY after Firestore confirms the write succeeded. Bug fix:
   * previously this fired addEvent() without awaiting it, showed a fake
   * "saved" toast, and navigated away immediately — so real save failures
   * (e.g. permission-denied from Firestore rules) were silently swallowed.
   */
  const handleSubmit = async () => {
    if (!validate()) return;
    if (saving) return; // guard against double-submit

    setSaving(true);
    try {
      const result = await addEvent({
        clientName: form.clientName.trim(),
        clientPhone: form.clientPhone.trim(),
        clientWhatsapp: form.clientWhatsapp.trim(),
        clientAddress: form.clientAddress.trim(),
        eventType: form.eventType,
        budget: form.budget ? Number(form.budget) : null,
        notes: form.notes.trim(),
        mainEvent: {
          name: mainEvent.name.trim() || form.eventType,
          ...functionDatesToSave(mainEvent),
          time: mainEvent.time,
          location: mainEvent.location.trim(),
          items: mainEvent.items,
        },
        subEvents: subEvents.map(s => ({
          id: s.id,
          name: s.name.trim() || 'Sub Event',
          ...functionDatesToSave(s),
          time: s.time,
          location: s.location.trim(),
          items: s.items,
        })),
        itemPrices: {},
      });

      if (result.success) {
        showToast('Draft saved successfully');
        navigate('/drafts', { replace: true });
      } else {
        // Real failure — surfaced to the user, form stays intact so nothing is lost.
        showToast(result.error || 'Failed to save draft', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  // Read-only (plan ended / paused): explain instead of showing the form
  if (isSuspended) {
    return (
      <Card>
        <div className="text-center py-10 px-4" data-testid="new-event-locked">
          <Lock size={36} className="mx-auto text-amber-500 mb-3" />
          <p className="font-semibold text-bb-text">New events are paused</p>
          <p className="text-sm text-bb-muted mt-1 max-w-sm mx-auto">{isOwner ? 'Your plan has ended. Renew to create events again — everything you saved is safe.' : 'Your company’s plan has ended. Ask your owner to renew — everything you saved is safe.'}</p>
          {isOwner && <Button className="mt-4" onClick={() => navigate('/billing')}>See plans & pay</Button>}
        </div>
      </Card>
    );
  }

  // The same 3-step form on both: EventFormPhone on phones, EventFormLaptop on laptops
  const Form = isPhone ? EventFormPhone : EventFormLaptop;
  const onItems = (id, fn) => (id === 'main' ? fn.main : fn.sub);
  return (
    <Form f={{
      mode: 'new', form, set, errors, setErrors, saving, events, categories,
      eventTypeSelectValue, isCustomEventType, handleEventTypeSelect,
      mainEvent, setMainField, subEvents, addSubEvent, removeSubEvent, setSubField,
      toggleItem: (id, item) => onItems(id, { main: () => toggleMainItem(item), sub: () => toggleSubItem(id, item) })(),
      removeItem: (id, item) => onItems(id, { main: () => removeMainItem(item), sub: () => removeSubItem(id, item) })(),
      addCustomItem: (id, item) => onItems(id, { main: () => addCustomMainItem(item), sub: () => addCustomSubItem(id, item) })(),
      onSave: handleSubmit,
      onCancel: () => navigate(((window.history.state?.idx ?? 0) > 0) ? -1 : '/'),
    }} />
  );
}
