/**
 * DraftsList — Draft events management page
 *
 * Displays all draft events in an expandable card list with search filtering.
 * Each card shows client info, event details, items, and action buttons.
 * Backward compatible with old event format (no mainEvent/subEvents).
 * Phones get EventCardPhone (Confirm · Quote · Call · ⋯); laptops (1024px+)
 * get EventCardLaptop (long cards: Confirm · Quote, contact, ✎, ⋯, ⌄ details).
 *
 * Confirm/Delete actions await the Firestore result before showing a
 * success toast — see CODE_STRUCTURE.md §3-4.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import StickyBar from '../components/StickyBar';
import Button from '../components/Button';
import Input from '../components/Input';
import { sortByActiveDate } from '../utils/helpers';
import { capacityQuestion, DEFAULT_MAX_PER_DAY } from '../utils/calendar';
import { Search, PackageOpen } from 'lucide-react';
import { useConfirm } from '../components/useConfirm';
import EventCardPhone, { EventItemsSheet, EventMoreSheet } from '../components/EventCardPhone';
import EventCardLaptop, { EventDetails } from '../components/EventCardLaptop';
import { PageHeader } from '../components/LaptopUI';
import { useIsPhone } from '../components/useIsPhone';

// ============================================================
// HELPERS
// ============================================================

/**
 * Helper: get event location (backward compatible)
 */
function getEventLocation(ev) {
  if (ev.mainEvent?.location) return ev.mainEvent.location;
  return ev.eventLocation || '';
}

// ============================================================
// DraftsList — MAIN COMPONENT
// ============================================================

/** Lists all draft events with search, expand/collapse, and actions */
export default function DraftsList() {
  const { events, settings, deleteEvent, updateEvent, showToast, isSuspended, askUnlock } = useApp();
  // Read-only (plan ended / paused): these buttons show a lock and explain why
  const guard = (fn) => (...args) => (isSuspended ? askUnlock() : fn(...args));
  const confirm = useConfirm();
  const navigate = useNavigate();
  const isPhone = useIsPhone();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [itemsId, setItemsId] = useState(null); // phone: items sheet
  const [moreId, setMoreId] = useState(null);   // phone: ⋯ sheet

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------

  // Filter drafts by search query (client name, type, or location)
  const drafts = sortByActiveDate(
    events
      .filter(e => e.status === 'draft')
      .filter(e => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          e.clientName?.toLowerCase().includes(q) ||
          e.eventType?.toLowerCase().includes(q) ||
          getEventLocation(e).toLowerCase().includes(q)
        );
      })
  );

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------

  /** Promotes a draft to confirmed status — only toasts success if the write actually succeeded */
  const confirmEvent = async (id) => {
    // Warn when this would push a day past the company's daily limit (see Calendar)
    const ev = events.find(e => e.id === id);
    const max = Number(settings.maxEventsPerDay) || DEFAULT_MAX_PER_DAY;
    const question = ev && capacityQuestion(ev, events, max);
    if (question && !(await confirm({
      title: 'Over your daily limit',
      message: <>Confirming <b className="text-bb-text">{ev.clientName}</b>: {question.replace(/ Confirm anyway\?$/, '')}</>,
      note: 'Check crew and vehicles before you confirm.',
      confirmLabel: 'Confirm anyway', cancelLabel: 'Not now', tone: 'warning',
    }))) return;
    const result = await updateEvent(id, { status: 'confirmed' });
    if (result.success) {
      showToast('Event confirmed');
    } else {
      showToast(result.error || 'Failed to confirm event', 'error');
    }
  };
  /** Asks first (app pop-up), then deletes. Only toasts success if the write actually succeeded. */
  const handleDelete = async (ev) => {
    const ok = await confirm({
      title: 'Delete this draft?',
      message: <><b className="text-bb-text">{ev.clientName || 'This draft'}</b> and its quote will be deleted.</>,
      note: 'This can’t be undone.',
      confirmLabel: 'Delete', tone: 'danger',
    });
    if (!ok) return;
    const result = await deleteEvent(ev.id);
    if (result.success) showToast('Event deleted');
    // On failure, deleteEvent() already shows its own error toast.
  };


  /** Toggles the expanded/collapsed state of a draft card */
  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  return (
    <div className="space-y-4">
      {!isPhone && <PageHeader title="Drafts" count={events.filter(e => e.status === 'draft').length} />}

      {/* Search — stays pinned while scrolling */}
      <StickyBar>
        <Input
          placeholder="Search drafts..."
          icon={Search}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </StickyBar>

      {/* Drafts List */}
      {drafts.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <PackageOpen size={44} className="mx-auto text-bb-muted mb-3" />
            <p className="text-bb-muted font-medium">No drafts found</p>
            <p className="text-sm text-bb-muted/60 mt-1">
              {search ? 'Try a different search' : 'Create a new draft to get started'}
            </p>
            {!search && (
              <Button className="mt-4" onClick={() => navigate('/new')}>Create Draft</Button>
            )}
          </div>
        </Card>
      ) : (
        isPhone ? (
        /* === PHONE: one card per draft === */
        <div className="space-y-4" data-testid="phone-list">
          {drafts.map(ev => (
            <EventCardPhone key={ev.id} ev={ev} variant="draft" locked={isSuspended}
              on={{
                confirm: guard(() => confirmEvent(ev.id)),
                quote: () => navigate(`/quotation/${ev.id}`),
                items: () => setItemsId(ev.id),
                more: () => setMoreId(ev.id),
              }} />
          ))}
          <p className="text-center text-[13px] text-gray-600 pt-1">Drafts move to Confirmed when you tap <b>Confirm</b>.</p>
        </div>
        ) : (
        /* === LAPTOP: long cards, one per row === */
        <div className="space-y-3.5" data-testid="laptop-list">
          {drafts.map(ev => (
            <EventCardLaptop key={ev.id} ev={ev} variant="draft" locked={isSuspended}
              open={expandedId === ev.id} onToggle={() => toggleExpand(ev.id)} details={<EventDetails ev={ev} />}
              on={{
                confirm: guard(() => confirmEvent(ev.id)),
                quote: () => navigate(`/quotation/${ev.id}`),
                items: () => setItemsId(ev.id),
                edit: guard(() => navigate(`/edit/${ev.id}`)),
                delete: guard(() => handleDelete(ev)),
              }} />
          ))}
        </div>
        )
      )}

      {/* === PHONE SHEETS === */}
      {itemsId && <EventItemsSheet ev={events.find(e => e.id === itemsId)} onClose={() => setItemsId(null)} onEdit={() => navigate(`/quotation/${itemsId}`)} />}
      {moreId && (() => {
        const ev = events.find(e => e.id === moreId);
        const close = (fn) => () => { setMoreId(null); fn(); };
        return (
          <EventMoreSheet ev={ev} onClose={() => setMoreId(null)} locked={isSuspended}
            on={{
              edit: close(guard(() => navigate(`/edit/${moreId}`))),
              quote: close(() => navigate(`/quotation/${moreId}`)),
              delete: close(guard(() => handleDelete(ev))),
            }} />
        );
      })()}
    </div>
  );
}
