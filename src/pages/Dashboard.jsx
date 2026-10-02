/**
 * Dashboard — Home page with overview statistics
 *
 * Displays key metrics (drafts, confirmed, completed, revenue),
 * quick action buttons, and a list of upcoming confirmed events
 * sorted by proximity to their event date.
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
import Button from '../components/Button';
import Badge from '../components/Badge';
import { formatCurrency, formatDateReadable, daysUntil, telLink, sortByActiveDate, getActiveDate } from '../utils/helpers';
import {
  FileText, CheckCircle, PartyPopper, IndianRupee,
  Plus, List, Settings, Phone, CalendarDays, MapPin, BarChart3,
} from 'lucide-react';

// ============================================================
// Dashboard — MAIN COMPONENT
// ============================================================

/** Main dashboard view with stats, quick actions, and upcoming events */
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

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button icon={Plus} onClick={() => navigate('/new')}>New Draft</Button>
        <Button icon={List} variant="secondary" onClick={() => navigate('/drafts')}>Drafts</Button>
        <Button icon={CheckCircle} variant="secondary" onClick={() => navigate('/confirmed')}>Confirmed</Button>
        <Button icon={BarChart3} variant="secondary" onClick={() => navigate('/reports')}>Reports</Button>
        <Button icon={Settings} variant="ghost" onClick={() => navigate('/settings')}>Settings</Button>
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
            {displayEvents.map(ev => {
              const activeDateStr = getActiveDate(ev);
              const days = daysUntil(activeDateStr);
              const location = ev.mainEvent?.location || ev.eventLocation || '';
              return (
                <Card key={ev.id} hover onClick={() => navigate(`/confirmed`)}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-bb-text truncate">{ev.clientName}</p>
                        <Badge>{ev.eventType}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-bb-muted">
                        <span className="flex items-center gap-1">
                          <CalendarDays size={14} />
                          {formatDateReadable(activeDateStr)}
                        </span>
                        {location && (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin size={14} />
                            {location}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-2">
                      {/* Color-coded urgency badge */}
                      {days !== null && (
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                          days < 0 ? 'bg-gray-100 text-gray-600' :
                          days <= 3 ? 'bg-red-100 text-red-700' :
                          days <= 7 ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                        </span>
                      )}
                      {/* Quick call button */}
                      {ev.clientPhone && (
                        <a
                          href={telLink(ev.clientPhone)}
                          onClick={e => e.stopPropagation()}
                          className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                        >
                          <Phone size={16} />
                        </a>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
