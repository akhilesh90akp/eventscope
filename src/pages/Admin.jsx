/**
 * Admin — EventScope platform admin console
 *
 * Visible only to logins listed in platformAdmins/{uid} (added by hand in the
 * Firebase console). Lists every company (tenant) with plan, status, team
 * size and event count, and lets the admin change plan or suspend /
 * reactivate, or import a company from an old app's backup. firestore.rules enforce all of this server-side; hiding the
 * menu item is just for a clean UI.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import ImportCompanyDialog from '../components/ImportCompanyDialog';
import { PLANS } from '../constants/data';
import { formatDateReadable } from '../utils/helpers';
import { Shield, Search, Lock, Upload } from 'lucide-react';

// ============================================================
// HELPERS
// ============================================================
const DAY = 24 * 60 * 60 * 1000;
const isNew = (t) => t.createdAt && Date.now() - new Date(t.createdAt).getTime() < 7 * DAY;

// ============================================================
// Admin — MAIN COMPONENT
// ============================================================

export default function Admin() {
  const { isPlatformAdmin, subscribeAllTenants, getTenantCounts, adminUpdateTenant, showToast } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [tenants, setTenants] = useState(null);   // null = loading
  const [counts, setCounts] = useState({});       // { [tenantId]: { members, events } }
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  // ------------------------------------------------------------
  // DATA LOADING / EFFECTS
  // ------------------------------------------------------------

  // Live list of all companies
  useEffect(() => {
    if (!isPlatformAdmin) return undefined;
    return subscribeAllTenants(setTenants, () => setTenants([]));
  }, [isPlatformAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch counts once per tenant id
  useEffect(() => {
    (tenants || []).forEach(t => {
      if (counts[t.id]) return;
      getTenantCounts(t.id)
        .then(c => setCounts(prev => ({ ...prev, [t.id]: c })))
        .catch(() => setCounts(prev => ({ ...prev, [t.id]: { members: '—', events: '—' } })));
    });
  }, [tenants]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------
  const list = useMemo(() => (tenants || [])
    .filter(t => statusFilter === 'all' || (t.status || 'active') === statusFilter)
    .filter(t => {
      const q = search.trim().toLowerCase();
      return !q || [t.name, t.ownerEmail, t.id].some(v => (v || '').toLowerCase().includes(q));
    })
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), [tenants, search, statusFilter]);

  const summary = useMemo(() => {
    const all = tenants || [];
    return {
      total: all.length,
      active: all.filter(t => (t.status || 'active') === 'active').length,
      suspended: all.filter(t => t.status === 'suspended').length,
      newThisWeek: all.filter(isNew).length,
    };
  }, [tenants]);

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const update = async (t, patch, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(t.id);
    const result = await adminUpdateTenant(t.id, patch);
    setBusyId(null);
    showToast(result.success ? `${t.name || t.id} updated` : result.error, result.success ? 'success' : 'error');
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  if (!isPlatformAdmin) {
    return (
      <Card>
        <div className="text-center py-10">
          <Lock size={36} className="mx-auto text-bb-muted mb-3" />
          <p className="font-semibold text-bb-text">This page is for EventScope admins</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield size={20} className="text-bb-accent" />
        <h1 className="text-xl font-bold text-bb-text">EventScope Admin</h1>
        <span className="text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 rounded-full px-2 py-0.5">Only you see this</span>
        <button onClick={() => setImportOpen(true)}
          className="ml-auto flex items-center gap-2 px-3 py-2 bg-white border border-bb-border rounded-lg text-sm font-semibold text-bb-text hover:border-bb-accent cursor-pointer">
          <Upload size={16} className="text-bb-accent" /> Import company
        </button>
      </div>
      <ImportCompanyDialog isOpen={importOpen} onClose={() => setImportOpen(false)} />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Companies', summary.total, 'text-bb-text'],
          ['Active', summary.active, 'text-emerald-600'],
          ['Suspended', summary.suspended, 'text-amber-600'],
          ['New this week', summary.newThisWeek, 'text-bb-accent'],
        ].map(([label, value, cls]) => (
          <Card key={label}>
            <p className="text-xs text-bb-muted">{label}</p>
            <p className={`text-2xl font-bold ${cls}`}>{tenants ? value : '…'}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 bg-white border border-bb-border rounded-lg px-3 py-2 flex-1 min-w-[220px]">
          <Search size={16} className="text-bb-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company or owner email" className="flex-1 outline-none text-sm bg-transparent" />
        </div>
        {['all', 'active', 'suspended'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-2 text-sm rounded-lg capitalize cursor-pointer ${statusFilter === s ? 'bg-bb-accent text-white' : 'bg-white border border-bb-border text-bb-muted'}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Companies table */}
      <Card>
        {tenants === null ? (
          <p className="text-sm text-bb-muted text-center py-8">Loading companies…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-bb-muted text-center py-8">No companies match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bb-border text-left text-xs text-bb-muted uppercase tracking-wide">
                  <th className="py-2 px-2">Company</th>
                  <th className="py-2 px-2">Signed up</th>
                  <th className="py-2 px-2">Plan</th>
                  <th className="py-2 px-2 text-right">Team</th>
                  <th className="py-2 px-2 text-right">Events</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2" />
                </tr>
              </thead>
              <tbody>
                {list.map(t => {
                  const status = t.status || 'active';
                  const c = counts[t.id];
                  return (
                    <tr key={t.id} className="border-b border-bb-border/60 last:border-0">
                      <td className="py-2.5 px-2">
                        <div className="font-semibold text-bb-text flex items-center gap-2">
                          {t.name || t.id}
                          {isNew(t) && <span className="text-[10px] font-bold bg-violet-100 text-violet-700 rounded-full px-1.5">NEW</span>}
                        </div>
                        <div className="text-xs text-bb-muted">{t.ownerEmail || t.id}</div>
                      </td>
                      <td className="py-2.5 px-2 text-bb-muted whitespace-nowrap">{t.createdAt ? formatDateReadable(t.createdAt) : '—'}</td>
                      <td className="py-2.5 px-2">
                        <select
                          value={t.plan || 'trial'}
                          disabled={busyId === t.id}
                          onChange={e => update(t, { plan: e.target.value })}
                          className="text-sm border border-bb-border rounded-lg px-2 py-1 bg-white"
                        >
                          {PLANS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{c ? c.members : '…'}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{c ? c.events : '…'}</td>
                      <td className="py-2.5 px-2">
                        <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {status === 'active' ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        {status === 'active' ? (
                          <button disabled={busyId === t.id} onClick={() => update(t, { status: 'suspended' }, `Suspend ${t.name || t.id}? Their team can still view data but can't make changes.`)}
                            className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer disabled:opacity-40">Suspend</button>
                        ) : (
                          <button disabled={busyId === t.id} onClick={() => update(t, { status: 'active' })}
                            className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer disabled:opacity-40">Reactivate</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
