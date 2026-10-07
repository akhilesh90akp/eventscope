/**
 * Dashboard — Home page with overview statistics
 *
 * Displays key metrics (drafts, confirmed, completed, revenue) and the
 * upcoming confirmed events (nearest first), drawn with the same card face
 * as the Confirmed page. Page shortcuts live in the menu / sidebar.
 *
 * Read-only vs. Firestore: only reads `events` from AppContext.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import EventSummary from '../components/EventSummary';
import { formatCurrency, telLink, sortByActiveDate } from '../utils/helpers';
import { FileText, CheckCircle, PartyPopper, IndianRupee, Phone, CalendarDays } from 'lucide-react';

// ============================================================
// Dashboard — MAIN COMPONENT
// ============================================================

/** Main dashboard view with stats and upcoming events */
export default function Dashboard() {
  const { events } = useApp();
  const navigate = useNavigate();

  // ------------------------------------------------------------
  // DERIVED / CALCULATED VALUES
  // ------------------------------------------------------------

  // Categorize events by status
  const drafts = events.filter(e => e.status === 'draft');
  const confirmed = events.filter(e => e.status === 'confirmed');
  const completed = events.filter(e => e.status === 'completed');
  const revenue = completed.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

  // Get confirmed events sorted by active date (nearest first)
  const displayEvents = sortByActiveDate(confirmed);

  // Stats card configuration
  const stats = [
    { label: 'Drafts', value: drafts.length, icon: FileText, color: 'text-amber-400' },
    { label: 'Confirmed', value: confirmed.length, icon: CheckCircle, color: 'text-emerald-400' },
    { label: 'Completed', value: completed.length, icon: PartyPopper, color: 'text-blue-400' },
    { label: 'Revenue', value: formatCurrency(revenue), icon: IndianRupee, color: 'text-bb-gold' },
  ];

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => (
          <Card key={s.label}>
            <div className="flex items-center gap-3">
              <div className={`${s.color}`}>
                <s.icon size={22} />
              </div>
              <div>
                <p className="text-xs text-bb-muted">{s.label}</p>
                <p className="text-lg font-bold text-bb-text">{s.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Confirmed Events */}
      <div>
        <h2 className="text-lg font-semibold text-bb-text mb-3">Confirmed Events</h2>

        {displayEvents.length === 0 ? (
          <Card>
            <div className="text-center py-8">
              <CalendarDays size={40} className="mx-auto text-bb-muted mb-3" />
              <p className="text-bb-muted">No confirmed events</p>
              <p className="text-sm text-bb-muted/60 mt-1">Confirm a draft to see it here</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {displayEvents.map(ev => (
              // Same card face as the Confirmed page; tapping opens that event there
              <Card key={ev.id} hover onClick={() => navigate('/confirmed', { state: { expandId: ev.id } })}>
                <EventSummary
                  ev={ev}
                  right={ev.clientPhone && (
                    <a
                      href={telLink(ev.clientPhone)}
                      onClick={e => e.stopPropagation()}
                      aria-label={`Call ${ev.clientName}`}
                      className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                    >
                      <Phone size={14} />
                    </a>
                  )}
                />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
