/**
 * ImportCompanyDialog — Admin: create a company from an old app's backup file
 *
 * Steps: pick the .json backup → see a preview (nothing saved yet) → fill in
 * company name/id, plan, owner and staff emails → Import. The file is read
 * in the browser and saved straight to the database; it never goes to GitHub.
 * Saving is adminImportCompany() in AppContext; parsing is utils/tenantImport.js.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { Upload, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Modal from './Modal';
import { PLANS } from '../constants/data';
import { parseBackup, parseEmails, slugify } from '../utils/tenantImport';

// ============================================================
// CONSTANTS
// ============================================================
const STATUS_LABELS = { completed: 'completed', confirmed: 'confirmed', draft: 'drafts' };
const field = 'w-full border border-bb-border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-bb-accent';

// ============================================================
// ImportCompanyDialog — MAIN COMPONENT
// ============================================================

export default function ImportCompanyDialog({ isOpen, onClose }) {
  const { adminImportCompany, showPendingInvite, showToast, user } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [backup, setBackup] = useState(null);      // parseBackup() result
  const [fileName, setFileName] = useState('');
  const [name, setName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [plan, setPlan] = useState('trial');
  const [ownersText, setOwnersText] = useState('');
  const [staffText, setStaffText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);          // { invited, selfInvite } after success

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------
  const owners = parseEmails(ownersText);
  const staff = parseEmails(staffText);
  const badEmails = [...owners.invalid, ...staff.invalid];
  const canImport = backup?.ok && name.trim() && tenantId && owners.valid.length > 0 && badEmails.length === 0 && !busy;

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------

  /** Reads the chosen file and shows the preview */
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setFileName(file.name);
    const result = parseBackup(await file.text());
    setBackup(result);
    if (result.ok) {
      setName(result.companyName);
      setTenantId(slugify(result.companyName));
      if (!ownersText && user?.email) setOwnersText(user.email.toLowerCase());
    }
  };

  const onImport = async () => {
    if (!canImport) return;
    setBusy(true);
    setError('');
    const result = await adminImportCompany({
      tenantId, name: name.trim(), plan, backup, owners: owners.valid, staff: staff.valid,
    });
    setBusy(false);
    if (!result.success) { setError(result.error); return; }
    setDone({ invited: result.invited, selfInvite: result.selfInvite });
    showToast(`${name.trim()} imported`, 'success');
  };

  /** Clears everything (the file contents stay only in this browser tab) */
  const close = () => {
    if (busy) return;
    const selfInvite = done?.selfInvite;
    setBackup(null); setFileName(''); setName(''); setTenantId(''); setPlan('trial');
    setOwnersText(''); setStaffText(''); setError(''); setDone(null);
    onClose();
    if (selfInvite) showPendingInvite(selfInvite); // you invited yourself → Join screen
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  return (
    <Modal isOpen={isOpen} onClose={close} title="Import company from backup" size="lg">
      {done ? (
        <div className="text-center py-4">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
          <p className="font-semibold text-bb-text mb-1">{name} is in.</p>
          <p className="text-sm text-bb-muted mb-5">
            {backup.counts.events} events, settings and categories saved. {done.invited} {done.invited === 1 ? 'person was' : 'people were'} invited —
            they’ll see a Join screen the next time they sign in with that Google account.
            {done.selfInvite && ' You’re one of them — click Done to join now.'}
          </p>
          <button onClick={close} className="px-5 py-2.5 bg-bb-accent text-white rounded-lg text-sm font-semibold cursor-pointer">Done</button>
        </div>
      ) : (
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 1. File */}
          <label className="flex items-center gap-3 border-2 border-dashed border-bb-border rounded-xl px-4 py-4 cursor-pointer hover:border-bb-accent">
            <Upload size={20} className="text-bb-accent shrink-0" />
            <span className="text-sm text-bb-text">{fileName || 'Choose backup file (.json)'}</span>
            <input type="file" accept=".json,application/json" onChange={onFile} className="hidden" />
          </label>

          {backup && !backup.ok && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{backup.error}</p>}

          {backup?.ok && (
            <>
              {/* 2. Preview — nothing saved yet */}
              <div className="bg-violet-50 rounded-xl px-4 py-3 text-sm text-bb-text">
                <p className="font-semibold mb-1">{backup.companyName || 'Unnamed company'}</p>
                <p className="text-bb-muted">
                  {backup.counts.events} events
                  {' ('}{Object.entries(backup.counts.byStatus).map(([s, n]) => `${n} ${STATUS_LABELS[s] || s}`).join(', ')}{')'}
                  {' · '}{backup.counts.bills} bills · {backup.counts.categories} categories · settings ✓
                </p>
                <p className="text-xs text-bb-muted mt-1">Preview only — nothing is saved until you click Import.</p>
              </div>

              {/* 3. Company details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs text-bb-muted">Company name
                  <input value={name} onChange={e => setName(e.target.value)} className={`${field} mt-1`} />
                </label>
                <label className="text-xs text-bb-muted">Company id (can’t change later)
                  <input value={tenantId} onChange={e => setTenantId(slugify(e.target.value))} className={`${field} mt-1 font-mono`} />
                </label>
                <label className="text-xs text-bb-muted">Plan
                  <select value={plan} onChange={e => setPlan(e.target.value)} className={`${field} mt-1`}>
                    {PLANS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
              </div>

              {/* 4. People */}
              <label className="block text-xs text-bb-muted">Owner Google emails (one per line) — full access
                <textarea value={ownersText} onChange={e => setOwnersText(e.target.value)} rows={2} className={`${field} mt-1`} placeholder="you@gmail.com" />
              </label>
              <label className="block text-xs text-bb-muted">Staff Google emails (optional) — events, quotes, bills; no reports or profit
                <textarea value={staffText} onChange={e => setStaffText(e.target.value)} rows={2} className={`${field} mt-1`} />
              </label>
              {badEmails.length > 0 && <p className="text-sm text-amber-700">Check these emails: {badEmails.join(', ')}</p>}

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={close} disabled={busy} className="px-4 py-2.5 border border-bb-border rounded-lg text-sm cursor-pointer">Cancel</button>
                <button onClick={onImport} disabled={!canImport}
                  className="px-5 py-2.5 bg-bb-accent text-white rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50">
                  {busy ? 'Importing…' : 'Import'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
