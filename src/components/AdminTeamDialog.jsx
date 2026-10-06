/**
 * AdminTeamDialog — Admin: see and fix one company's team (support cases)
 *
 * Lists members (with role) and pending invites, live. The platform admin
 * can make someone owner or staff, remove them, or cancel an invite —
 * things a company's own owners deliberately can't do to each other.
 * Never leaves a company without an owner. Saving is adminTeamAction() in AppContext.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Modal from './Modal';

// ============================================================
// AdminTeamDialog — MAIN COMPONENT
// ============================================================

export default function AdminTeamDialog({ tenant, onClose }) {
  const { subscribeTenantTeam, adminTeamAction, showToast } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [team, setTeam] = useState(null);   // { members, invites } — null while loading
  const [busy, setBusy] = useState(null);   // uid/email being changed

  // ------------------------------------------------------------
  // DATA LOADING / EFFECTS
  // ------------------------------------------------------------
  useEffect(() => {
    if (!tenant) return undefined;
    setTeam(null);
    return subscribeTenantTeam(tenant.id, setTeam);
  }, [tenant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------
  const owners = (team?.members || []).filter(m => m.role === 'owner');
  const isLastOwner = (m) => m.role === 'owner' && owners.length <= 1;
  const sorted = [...(team?.members || [])].sort((a, b) => (a.role === 'owner' ? -1 : 1) - (b.role === 'owner' ? -1 : 1));

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const run = async (key, action, target, confirmText, okText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    const result = await adminTeamAction(action, target);
    setBusy(null);
    showToast(result.success ? okText : result.error, result.success ? 'success' : 'error');
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  const link = 'text-xs font-semibold hover:underline cursor-pointer disabled:opacity-40 disabled:no-underline disabled:cursor-default whitespace-nowrap';

  return (
    <Modal isOpen={!!tenant} onClose={onClose} title={`Team — ${tenant?.name || ''}`} size="lg">
      {!team ? (
        <p className="text-sm text-bb-muted text-center py-6">Loading team…</p>
      ) : (
        <div className="space-y-3 max-h-[65vh] overflow-y-auto">
          <div className="divide-y divide-bb-border border border-bb-border rounded-lg">
            {sorted.length === 0 && team.invites.length === 0 && (
              <p className="text-sm text-bb-muted text-center py-6">No members yet.</p>
            )}
            {sorted.map(m => {
              const name = m.name || m.email || m.uid;
              return (
                <div key={m.uid} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-bb-text truncate">{name}</p>
                    <p className="text-xs text-bb-muted truncate">{m.email || m.uid}</p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.role === 'owner' ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-600'}`}>
                    {m.role === 'owner' ? 'Owner' : 'Staff'}
                  </span>
                  {m.role === 'owner' ? (
                    <button disabled={busy === m.uid || isLastOwner(m)} title={isLastOwner(m) ? 'A company needs at least one owner' : ''}
                      onClick={() => run(m.uid, 'setRole', { uid: m.uid, role: 'staff' }, `Make ${name} staff? They lose settings, team, reports and profit.`, `${name} is now staff`)}
                      className={`${link} text-amber-700`}>Make staff</button>
                  ) : (
                    <button disabled={busy === m.uid}
                      onClick={() => run(m.uid, 'setRole', { uid: m.uid, role: 'owner' }, `Make ${name} an owner?`, `${name} is now an owner`)}
                      className={`${link} text-bb-accent`}>Make owner</button>
                  )}
                  <button disabled={busy === m.uid || isLastOwner(m)} title={isLastOwner(m) ? 'A company needs at least one owner' : ''}
                    onClick={() => run(m.uid, 'remove', { uid: m.uid }, `Remove ${name} from ${tenant.name}? They lose access immediately.`, `${name} removed`)}
                    className={`${link} text-red-600`}>Remove</button>
                </div>
              );
            })}
            {team.invites.map(inv => (
              <div key={inv.email} className="flex items-center gap-3 px-3 py-2.5 bg-amber-50/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-bb-text truncate">{inv.email}</p>
                  <p className="text-xs text-bb-muted">Hasn’t signed in yet</p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">Invited · {inv.role === 'owner' ? 'Owner' : 'Staff'}</span>
                <button disabled={busy === inv.email}
                  onClick={() => run(inv.email, 'cancelInvite', { email: inv.email }, `Cancel the invite for ${inv.email}?`, 'Invite cancelled')}
                  className={`${link} text-bb-muted hover:text-red-600`}>Cancel</button>
              </div>
            ))}
          </div>
          <p className="text-xs text-bb-muted">Owners can promote staff themselves, but can’t downgrade or remove another owner — that’s done here.</p>
        </div>
      )}
    </Modal>
  );
}
