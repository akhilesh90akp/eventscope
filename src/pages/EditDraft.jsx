/**
 * EditDraft — Event editing form with sub-events support
 *
 * Loads an existing event by ID from URL params and populates
 * the form with main event + sub-events structure.
 * Backward compatible: handles old events without mainEvent/subEvents.
 *
 * Save flow: handleSubmit awaits AppContext.updateEvent() and only shows a
 * success toast / navigates away if the Firestore write actually succeeded.
 * See CODE_STRUCTURE.md §4.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import EventFormPhone from '../components/EventFormPhone';
import EventFormLaptop from '../components/EventFormLaptop';
import { useIsPhone } from '../components/useIsPhone';
import { EVENT_TYPES } from '../constants/data';
import { functionDatesProblem, functionDatesToSave, genId, functionDays } from '../utils/helpers';

// ============================================================
// EditDraft — MAIN COMPONENT
// ============================================================

/** Form page for editing an existing event draft */
export default function EditDraft() {
  const { eventId } = useParams();
  const { events, categories, updateEvent, showToast } = useApp();
  const navigate = useNavigate();
  const isPhone = useIsPhone();

  const event = events.find(e => e.id === eventId);

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

  // `saving` disables the submit button while the Firestore write is in
  // flight, preventing duplicate/overlapping updates from double-clicks.
  const [saving, setSaving] = useState(false);

  // ------------------------------------------------------------
  // DATA LOADING / EFFECTS
  // ------------------------------------------------------------

  // Populate form with existing event data when loaded
  useEffect(() => {
    if (event) {
      setForm({
        clientName: event.clientName || '',
        clientPhone: event.clientPhone || '',
        clientWhatsapp: event.clientWhatsapp || '',
        clientAddress: event.clientAddress || '',
        eventType: event.eventType || '',
        budget: event.budget ? String(event.budget) : '',
        notes: event.notes || '',
      });

      // Handle new format (mainEvent exists)
      if (event.mainEvent) {
        setMainEvent({
          name: event.mainEvent.name || '',
          date: event.mainEvent.date || '',
          endDate: event.mainEvent.endDate || '',
          multiDay: functionDays(event.mainEvent) > 1,
          time: event.mainEvent.time || '',
          location: event.mainEvent.location || '',
          items: event.mainEvent.items || [],
        });
        setSubEvents((event.subEvents || []).map(s => ({
          id: s.id || genId(),
          name: s.name || '',
          date: s.date || '',
          endDate: s.endDate || '',
          multiDay: functionDays(s) > 1,
          time: s.time || '',
          location: s.location || '',
          items: s.items || [],
        })));
      } else {
        // Backward compatibility: old format without mainEvent
        setMainEvent({
          name: event.eventType || '',
          date: event.date || '',
          endDate: '',
          multiDay: false,
          time: event.time || '',
          location: event.eventLocation || event.houseLocation || '',
          items: event.items || [],
        });
        setSubEvents([]);
      }
    }
  }, [event]);

  // Show fallback if event not found
  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-bb-muted">Event not found</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

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
   * Validates and updates the event, then navigates back — but ONLY after
   * Firestore confirms the write succeeded. Bug fix: previously this fired
   * updateEvent() without awaiting it, showed a fake "saved" toast, and
   * navigated away immediately, so real save failures were silently lost.
   */
  const handleSubmit = async () => {
    if (!validate()) return;
    if (saving) return; // guard against double-submit

    // Migrate itemPrices to new eventId::itemName key format
    const oldPrices = event.itemPrices || {};
    const newPrices = {};
    // Migrate main event items
    mainEvent.items.forEach(item => {
      const key = `main::${item}`;
      if (oldPrices[key]) {
        newPrices[key] = oldPrices[key];
      } else if (oldPrices[item]) {
        // Backward compat: migrate old plain-key to new format
        newPrices[key] = oldPrices[item];
      }
    });
    // Migrate sub-event items
    subEvents.forEach(s => {
      (s.items || []).forEach(item => {
        const key = `${s.id}::${item}`;
        if (oldPrices[key]) {
          newPrices[key] = oldPrices[key];
        } else if (oldPrices[item]) {
          // Backward compat: migrate old plain-key to new format
          newPrices[key] = oldPrices[item];
        }
      });
    });

    setSaving(true);
    try {
      const result = await updateEvent(eventId, {
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
        itemPrices: newPrices,
      });

      if (result.success) {
        showToast('Changes saved');
        // Navigate back to the correct page AND tab based on event status.
        // Uses the actual matching route ('/confirmed' vs '/completed')
        // rather than always going to '/confirmed' with state — state is
        // lost on a browser back-navigation or refresh, which would silently
        // drop back to the wrong tab; the URL itself doesn't have that problem.
        const status = event.status;
        if (status === 'completed') {
          navigate('/completed', { replace: true });
        } else if (status === 'confirmed') {
          navigate('/confirmed', { replace: true });
        } else {
          navigate('/drafts', { replace: true });
        }
      } else {
        // Real failure — surfaced to the user, form stays intact so nothing is lost.
        showToast(result.error || 'Failed to save changes', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  // The same 3-step form on both: EventFormPhone on phones, EventFormLaptop on laptops
  const Form = isPhone ? EventFormPhone : EventFormLaptop;
  const onItems = (id, fn) => (id === 'main' ? fn.main : fn.sub);
  return (
    <Form f={{
      mode: 'edit', form, set, errors, setErrors, saving, events, categories,
      eventTypeSelectValue, isCustomEventType, handleEventTypeSelect,
      mainEvent, setMainField, subEvents, addSubEvent, removeSubEvent, setSubField,
      toggleItem: (id, item) => onItems(id, { main: () => toggleMainItem(item), sub: () => toggleSubItem(id, item) })(),
      removeItem: (id, item) => onItems(id, { main: () => removeMainItem(item), sub: () => removeSubItem(id, item) })(),
      addCustomItem: (id, item) => onItems(id, { main: () => addCustomMainItem(item), sub: () => addCustomSubItem(id, item) })(),
      onSave: handleSubmit,
      onCancel: () => navigate(-1),
    }} />
  );
}
