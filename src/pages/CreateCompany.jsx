/**
 * CreateCompany — public sign-up
 *
 * Shown to anyone who signs in with Google but isn't linked to a company
 * yet (no users/{uid}, no pending invite). They can create their own company
 * (becoming its owner, on the free pilot plan) — or, if they were meant to
 * join an existing company, see which email to give their owner.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import AuthBackground from '../components/AuthBackground';
import AnimatedLogo from '../components/AnimatedLogo';
import { useApp } from '../context/AppContext';

// ============================================================
// CreateCompany — MAIN COMPONENT
// ============================================================

export default function CreateCompany() {
  const { user, logout, createCompany } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [form, setForm] = useState({ name: '', phone: '', city: '', recoveryEmail: '' });
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    const rec = form.recoveryEmail.trim().toLowerCase();
    if (rec && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec)) { setError('Please enter a valid backup email, or leave it empty.'); return; }
    if (rec && rec === (user?.email || '').toLowerCase()) { setError('Your backup email should be different from the Google account you signed in with.'); return; }
    if (!agreed) { setError('Please accept the Terms of Service and Privacy Policy.'); return; }
    setSaving(true);
    const result = await createCompany(form);
    setSaving(false);
    if (!result.success) setError(result.error);
    // on success the app switches to the new company automatically
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  const field = 'w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-bb-accent focus:ring-2 focus:ring-bb-accent/20';

  return (
    <div className="relative isolate min-h-[100dvh] bg-bb-sidebar flex flex-col items-center justify-center p-4 py-10">
      <AuthBackground />
      <AnimatedLogo className="h-24 w-auto mb-8" />

      <form onSubmit={handleSubmit} className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Set up your company</h1>
        <p className="text-sm text-gray-500 mb-6">
          Start free — quotations, bills and your Job Log, all in one place. You can add your team and fill in bank and GST details later.
        </p>

        <label className="block text-sm font-semibold text-gray-700 mb-1">Company name *</label>
        <input className={`${field} mb-4`} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Kochi Wedding Planners" autoFocus />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
            <input className={field} inputMode="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Business number" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">City</label>
            <input className={field} value={form.city} onChange={e => set('city', e.target.value)} placeholder="e.g. Kochi" />
          </div>
        </div>

        <label className="block text-sm font-semibold text-gray-700 mb-1">Backup email</label>
        <input className={`${field} mb-1`} type="email" value={form.recoveryEmail} onChange={e => set('recoveryEmail', e.target.value)} placeholder="Another email we can reach you on" />
        <p className="text-[11px] text-gray-500 mb-4">
          If you ever lose access to <b>{user?.email}</b>, we’ll use this to confirm it’s you and move your company to a new login. Never shown to your team.
        </p>

        <label className="flex items-start gap-2 text-sm text-gray-600 mb-5 cursor-pointer">
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 accent-[#7c3aed]" />
          <span>
            I agree to the <a href="#/terms" target="_blank" rel="noreferrer" className="text-bb-accent underline">Terms of Service</a> and{' '}
            <a href="#/privacy" target="_blank" rel="noreferrer" className="text-bb-accent underline">Privacy Policy</a>.
          </span>
        </label>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}

        <button type="submit" disabled={saving}
          className="w-full bg-bb-accent hover:bg-bb-accent-hover text-white font-semibold rounded-xl py-3 cursor-pointer disabled:opacity-60">
          {saving ? 'Creating your company…' : 'Create company'}
        </button>

        <div className="mt-6 pt-5 border-t border-gray-100 text-xs text-gray-500 space-y-2">
          <p>
            <b className="text-gray-700">Joining your company’s existing account?</b> Ask the owner to add{' '}
            <b className="text-gray-700">{user?.email}</b> in Settings → Team, then sign in again.
          </p>
          <p>
            Wrong account? <button type="button" onClick={logout} className="text-bb-accent underline cursor-pointer">Sign out</button>
          </p>
        </div>
      </form>

      <p className="text-[11px] text-bb-sidebar-muted mt-6 space-x-3">
        <a href="#/privacy" className="hover:text-white">Privacy</a>
        <a href="#/terms" className="hover:text-white">Terms</a>
        <a href="#/data-protection" className="hover:text-white">How we protect your data</a>
      </p>
    </div>
  );
}
