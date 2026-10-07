/**
 * JoinInvite — "You've been invited" screen
 *
 * Shown when someone signs in, has no company yet, and an invite exists for
 * their Google email. They choose: Join (become staff — or owner, if an
 * EventScope admin set the company up for them — of that company) or
 * Decline (the invite is deleted and they can set up their own company).
 * Joining is never automatic, so nobody can be pulled into a company — and
 * end up typing their clients' details into it — without choosing to.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import AuthBackground from '../components/AuthBackground';
import AnimatedLogo from '../components/AnimatedLogo';
import { useApp } from '../context/AppContext';

// ============================================================
// JoinInvite — MAIN COMPONENT
// ============================================================

export default function JoinInvite() {
  const { user, logout, pendingInvite, acceptPendingInvite, declinePendingInvite } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [busy, setBusy] = useState(null);   // 'join' | 'decline' | null
  const [error, setError] = useState('');

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------

  /** Runs Join or Decline and shows any error; success switches screens automatically */
  const run = async (which) => {
    if (busy) return;
    setBusy(which);
    setError('');
    const result = which === 'join' ? await acceptPendingInvite() : await declinePendingInvite();
    if (!result.success) setError(result.error);
    setBusy(null);
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  const company = pendingInvite?.tenantName || 'a company';
  const inviter = pendingInvite?.invitedByName;
  const isOwnerInvite = pendingInvite?.role === 'owner';

  return (
    <div className="relative isolate min-h-[100dvh] bg-bb-sidebar flex flex-col items-center justify-center p-4">
      <AuthBackground />
      <AnimatedLogo className="h-24 w-auto mb-8" />

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-bb-accent mb-2">You’ve been invited</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Join {company}?</h1>
        <p className="text-sm text-gray-500 mb-6">
          {inviter ? <><b className="text-gray-700">{inviter}</b> added you</> : 'You were added'} as {isOwnerInvite ? 'an owner' : 'a team member'}.
          {isOwnerInvite
            ? ' You’ll have full access, including settings, team, reports and profit.'
            : ' You’ll be able to work on their events, quotations and bills.'}
        </p>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}

        <button onClick={() => run('join')} disabled={!!busy}
          className="w-full bg-bb-accent hover:bg-bb-accent-hover text-white font-semibold rounded-xl py-3 mb-2 cursor-pointer disabled:opacity-60">
          {busy === 'join' ? 'Joining…' : `Join ${company}`}
        </button>
        <button onClick={() => run('decline')} disabled={!!busy}
          className="w-full border border-gray-300 text-gray-700 font-medium rounded-xl py-3 cursor-pointer hover:bg-gray-50 disabled:opacity-60">
          {busy === 'decline' ? 'Declining…' : 'Decline — set up my own company'}
        </button>

        <p className="text-xs text-gray-400 mt-6">
          Signed in as {user?.email} · <button type="button" onClick={logout} className="underline cursor-pointer">Sign out</button>
        </p>
      </div>
    </div>
  );
}
