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
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Select from '../components/Select';
import LocationInput from '../components/LocationInput';
import { EVENT_TYPES } from '../constants/data';
import { genId } from '../utils/helpers';
import {
  User, Phone, MessageSquare, MapPin, Calendar, Clock,
  IndianRupee, ChevronDown, ChevronUp, X, Plus, Save, StickyNote, ArrowLeft, Layers,
} from 'lucide-react';

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Reusable items selection accordion for an event section */
function ItemsSelector({ selectedItems, onToggle, onRemove, onAddCustom, categories, label }) {
  const [openCat, setOpenCat] = useState(null);
  const [customItem, setCustomItem] = useState('');

  const selectedCountForCat = (cat) =>
    cat.items.filter(i => selectedItems.includes(i)).length;

  const addCustom = () => {
    if (customItem.trim() && !selectedItems.includes(customItem.trim())) {
      onAddCustom(customItem.trim());
      setCustomItem('');
    }
  };

  return (
    <div>
      <p className="text-xs font-semibold text-bb-muted uppercase mb-2">{label}</p>

      {/* Selected Items Tags */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 pb-3 border-b border-bb-border">
          {selectedItems.map(item => (
            <span key={item} className="inline-flex items-center gap-1 px-2 py-1 bg-bb-accent/20 text-bb-accent text-xs rounded-full">
              {item}
              <button onClick={() => onRemove(item)} className="hover:text-white cursor-pointer">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Categories Accordion */}
      <div className="space-y-2">
        {categories.map(cat => {
          const isOpen = openCat === cat.id;
          return (
            <div key={cat.id} className={`rounded-lg overflow-hidden transition-all ${isOpen ? 'border-l-4 border-l-bb-accent border border-bb-accent/30 bg-bb-accent/5 shadow-sm' : 'border border-bb-border'}`}>
              <button
                onClick={() => setOpenCat(isOpen ? null : cat.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors cursor-pointer ${isOpen ? 'bg-bb-accent/10' : 'bg-bb-input hover:bg-bb-card-hover'}`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-bb-text">
                  <span>{cat.icon}</span>
                  {cat.name}
                  {selectedCountForCat(cat) > 0 && (
                    <span className="text-xs bg-bb-accent text-white px-1.5 py-0.5 rounded-full">
                      {selectedCountForCat(cat)}
                    </span>
                  )}
                </span>
                {isOpen ? <ChevronUp size={18} className="text-bb-accent" /> : <ChevronDown size={18} className="text-bb-muted" />}
              </button>

              {isOpen && (
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {cat.items.map(item => (
                    <button
                      key={item}
                      onClick={() => onToggle(item)}
                      className={`text-left text-sm px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                        selectedItems.includes(item)
                          ? 'bg-bb-accent/20 border-bb-accent text-bb-accent font-medium'
                          : 'bg-white border-bb-border text-bb-text hover:border-bb-accent/50'
                      }`}
                    >
                      {selectedItems.includes(item) && '✓ '}{item}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom Item */}
      <div className="flex gap-2 mt-4">
        <Input placeholder="Custom item..." value={customItem} onChange={e => setCustomItem(e.target.value)}
          className="flex-1"
          onKeyDown={e => e.key === 'Enter' && addCustom()}
        />
        <Button icon={Plus} variant="secondary" onClick={addCustom}>Add</Button>
      </div>
    </div>
  );
}

// ============================================================
// EditDraft — MAIN COMPONENT
// ============================================================

/** Form page for editing an existing event draft */
export default function EditDraft() {
  const { eventId } = useParams();
  const { events, categories, updateEvent, showToast } = useApp();
  const navigate = useNavigate();

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
    name: '', date: '', time: '', location: '', items: [],
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
          time: event.mainEvent.time || '',
          location: event.mainEvent.location || '',
          items: event.mainEvent.items || [],
        });
        setSubEvents((event.subEvents || []).map(s => ({
          id: s.id || genId(),
          name: s.name || '',
          date: s.date || '',
          time: s.time || '',
          location: s.location || '',
          items: s.items || [],
        })));
      } else {
        // Backward compatibility: old format without mainEvent
        setMainEvent({
          name: event.eventType || '',
          date: event.date || '',
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
    setSubEvents(p => [...p, { id: genId(), name: '', date: '', time: '', location: '', items: [] }]);
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
    if (!mainEvent.date) errs.mainDate = 'Required';
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
          date: mainEvent.date,
          time: mainEvent.time,
          location: mainEvent.location.trim(),
          items: mainEvent.items,
        },
        subEvents: subEvents.map(s => ({
          id: s.id,
          name: s.name.trim() || 'Sub Event',
          date: s.date,
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

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-bb-card text-bb-muted hover:text-bb-text transition-colors cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-bb-text">Edit Draft</h1>
      </div>

      {/* Client Info */}
      <Card>
        <h3 className="text-sm font-semibold text-bb-muted uppercase mb-3">Client Info</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Client Name" placeholder="Full name" icon={User} required
            value={form.clientName} onChange={e => set('clientName', e.target.value)} error={errors.clientName} />
          <Input label="Phone" placeholder="Mobile number" icon={Phone} required
            value={form.clientPhone} onChange={e => set('clientPhone', e.target.value)} error={errors.clientPhone} />
          <Input label="WhatsApp" placeholder="WhatsApp number" icon={MessageSquare}
            value={form.clientWhatsapp} onChange={e => set('clientWhatsapp', e.target.value)} />
          <Input label="Address" placeholder="Client address" icon={MapPin}
            value={form.clientAddress} onChange={e => set('clientAddress', e.target.value)} />
        </div>
      </Card>

      {/* Event Type & Budget */}
      <Card>
        <h3 className="text-sm font-semibold text-bb-muted uppercase mb-3">Event Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select label="Event Type" required options={EVENT_TYPES}
            value={eventTypeSelectValue} onChange={e => handleEventTypeSelect(e.target.value)} error={errors.eventType} />
          <Input label="Budget" placeholder="Approx budget" icon={IndianRupee} type="number"
            value={form.budget} onChange={e => set('budget', e.target.value)} />
        </div>
        {/* "Other" picked — let the user type a type not on the preset list
            (a local ceremony name, etc.) instead of forcing a fixed set. */}
        {isCustomEventType && (
          <div className="mt-3">
            <Input label="Specify Event Type" required placeholder="e.g., Madhuramveppu, Funeral, Election Event..."
              value={form.eventType} onChange={e => set('eventType', e.target.value)} error={errors.eventType} />
          </div>
        )}
      </Card>

      {/* Main Event */}
      <Card>
        <h3 className="text-sm font-semibold text-bb-muted uppercase mb-3">🎯 Main Event</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <Input label="Event Name" placeholder={form.eventType || 'e.g., Wedding Ceremony'}
            value={mainEvent.name} onChange={e => setMainField('name', e.target.value)} />
          <Input label="Date" type="date" required icon={Calendar}
            value={mainEvent.date} onChange={e => setMainField('date', e.target.value)} error={errors.mainDate} />
          <Input label="Time" type="time" icon={Clock}
            value={mainEvent.time} onChange={e => setMainField('time', e.target.value)} />
          <LocationInput label="Event Location" placeholder="Search venue location..."
            value={mainEvent.location} onChange={val => setMainField('location', val)} />
        </div>

        {/* Main Event Items */}
        <ItemsSelector
          selectedItems={mainEvent.items}
          onToggle={toggleMainItem}
          onRemove={removeMainItem}
          onAddCustom={addCustomMainItem}
          categories={categories}
          label="Main Event Services"
        />
      </Card>

      {/* Sub-Events */}
      {subEvents.map((sub, idx) => (
        <Card key={sub.id}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-bb-muted uppercase">
              <Layers size={14} className="inline mr-1" />
              Sub-Event {idx + 1}
            </h3>
            <button
              onClick={() => removeSubEvent(sub.id)}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
              title="Remove sub-event"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <Input label="Sub-Event Name" placeholder="e.g., Home Function, Reception..."
              value={sub.name} onChange={e => setSubField(sub.id, 'name', e.target.value)} />
            <Input label="Date" type="date" icon={Calendar}
              value={sub.date} onChange={e => setSubField(sub.id, 'date', e.target.value)} />
            <Input label="Time" type="time" icon={Clock}
              value={sub.time} onChange={e => setSubField(sub.id, 'time', e.target.value)} />
            <LocationInput label="Location" placeholder="Search location..."
              value={sub.location} onChange={val => setSubField(sub.id, 'location', val)} />
          </div>

          {/* Sub-Event Items */}
          <ItemsSelector
            selectedItems={sub.items}
            onToggle={(item) => toggleSubItem(sub.id, item)}
            onRemove={(item) => removeSubItem(sub.id, item)}
            onAddCustom={(item) => addCustomSubItem(sub.id, item)}
            categories={categories}
            label={`${sub.name || 'Sub-Event'} Services`}
          />
        </Card>
      ))}

      {/* Add Sub-Event Button */}
      <Button icon={Plus} variant="secondary" fullWidth onClick={addSubEvent}>
        Add Sub-Event
      </Button>

      {/* Notes */}
      <Card>
        <Input label="Notes" type="textarea" placeholder="Any additional notes..." icon={StickyNote}
          value={form.notes} onChange={e => set('notes', e.target.value)} />
      </Card>

      {/* Submit */}
      <Button icon={Save} fullWidth size="lg" onClick={handleSubmit} disabled={saving}>
        {saving ? 'Saving...' : 'Update Draft'}
      </Button>
    </div>
  );
}
