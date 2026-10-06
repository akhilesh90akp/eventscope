/**
 * Settings — Application configuration page
 *
 * Multi-tab settings interface for managing company details, bank information,
 * invoice preferences, service categories, and team (placeholder).
 * Settings belong to the tenant (company). Only the owner can change them;
 * staff see them read-only (firestore.rules enforces the same).
 * All changes persist to Firestore via AppContext (not localStorage).
 *
 * Save actions await the Firestore result before confirming success —
 * see CODE_STRUCTURE.md §3-4.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Modal from '../components/Modal';
import JobLogColumnsEditor from '../components/JobLogColumnsEditor';
import { resizeImageFile } from '../utils/helpers';
import { Save, Plus, Trash2, Edit2, X, Building2, Landmark, FileText, Layers, Users, Table2, UserPlus } from 'lucide-react';

// ============================================================
// Settings — MAIN COMPONENT
// ============================================================

/** Multi-tab settings page for company, bank, invoice, and service configuration */
export default function Settings() {
  const { settings, categories, updateSettings, addCategory, updateCategory, deleteCategory, addItemToCat, removeItemFromCat, logout, user, showToast, canEditSettings, isOwner, isSuspended, team, invites, inviteTeammate, cancelInvite, removeTeammate } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [tab, setTab] = useState('company');
  const [form, setForm] = useState({ ...settings, bankDetails: { ...settings.bankDetails } });
  const [catModal, setCatModal] = useState(null); // category id for item management modal
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📦');
  const [newItemInput, setNewItemInput] = useState('');
  const [newTerm, setNewTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Settings load asynchronously after sign-in; re-sync the form when they
  // arrive (or change) so it never shows — and then saves — stale blanks.
  useEffect(() => {
    setForm({ ...settings, bankDetails: { ...settings.bankDetails } });
  }, [settings]);

  /** Resizes an uploaded image and stores it on the given form field */
  const handleImageUpload = async (key, file) => {
    if (!file) return;
    try {
      set(key, await resizeImageFile(file, 400));
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ------------------------------------------------------------
  // EVENT HANDLERS — FORM FIELDS
  // ------------------------------------------------------------

  /** Updates a top-level form field */
  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  /** Updates a nested bank details field */
  const setBank = (key, val) => setForm(p => ({ ...p, bankDetails: { ...p.bankDetails, [key]: val } }));

  // ------------------------------------------------------------
  // EVENT HANDLERS — SAVE / CATEGORIES
  // ------------------------------------------------------------

  /** Invites a teammate by email (owner only) */
  const handleInvite = async () => {
    if (inviting || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const result = await inviteTeammate(inviteEmail);
      if (result.success) {
        showToast(`Invite added — ask them to sign in with ${inviteEmail.trim()}`);
        setInviteEmail('');
      } else {
        showToast(result.error, 'error');
      }
    } finally {
      setInviting(false);
    }
  };

  /** Cancels a pending invite */
  const handleCancelInvite = async (email) => {
    const result = await cancelInvite(email);
    showToast(result.success ? 'Invite cancelled' : result.error, result.success ? 'success' : 'error');
  };

  /** Removes a staff member after confirmation */
  const handleRemove = async (member) => {
    if (!window.confirm(`Remove ${member.name || member.email} from your company? They will lose access immediately.`)) return;
    const result = await removeTeammate(member.uid);
    showToast(result.success ? 'Teammate removed' : result.error, result.success ? 'success' : 'error');
  };

  /** Saves the current form state to global settings. Awaits the write; uses the app's toast, not a blocking alert(). */
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await updateSettings(form);
      if (result.success) {
        showToast('Settings saved!');
      } else {
        showToast(result.error || 'Failed to save settings', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  /** Creates a new service category */
  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    addCategory({ name: newCatName.trim(), icon: newCatIcon || '📦', items: [] });
    setNewCatName('');
    setNewCatIcon('📦');
  };

  /** Adds a new item to the currently open category */
  const handleAddItemToCat = (catId) => {
    if (!newItemInput.trim()) return;
    addItemToCat(catId, newItemInput.trim());
    setNewItemInput('');
  };

  /** Appends a new term to the terms & conditions list */
  const handleAddTerm = () => {
    if (!newTerm.trim()) return;
    const terms = [...(form.termsAndConditions || []), newTerm.trim()];
    setForm(p => ({ ...p, termsAndConditions: terms }));
    setNewTerm('');
  };

  /** Removes a term from the terms & conditions list by index */
  const handleRemoveTerm = (idx) => {
    const terms = (form.termsAndConditions || []).filter((_, i) => i !== idx);
    setForm(p => ({ ...p, termsAndConditions: terms }));
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  // Tab configuration
  const tabs = [
    { key: 'company', label: 'Company', icon: Building2 },
    { key: 'bank', label: 'Bank', icon: Landmark },
    { key: 'invoice', label: 'Invoice', icon: FileText },
    { key: 'services', label: 'Services', icon: Layers },
    { key: 'team', label: 'Team', icon: Users },
    { key: 'joblog', label: 'Job Log columns', icon: Table2 },
  ];

  const openCat = categories.find(c => c.id === catModal);

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-xl font-bold text-bb-text">Settings</h1>

      {/* Tab Buttons */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
              tab === t.key
                ? 'bg-bb-accent text-white'
                : 'bg-bb-card border border-bb-border text-bb-muted hover:text-bb-text'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Read-only notice for staff / suspended accounts */}
      {!canEditSettings && tab !== 'team' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          {isSuspended
            ? 'This account is suspended, so settings can’t be changed.'
            : 'Only the account owner can change settings. You’re viewing them read-only.'}
        </div>
      )}

      {/* Editable tabs — disabled as a block when the user can't edit settings */}
      <fieldset disabled={!canEditSettings} className="space-y-4 min-w-0">

      {/* Company Tab */}
      {tab === 'company' && (
        <Card>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Company Name" value={form.companyName || ''} onChange={e => set('companyName', e.target.value)} />
              <Input label="Tagline" value={form.tagline || ''} onChange={e => set('tagline', e.target.value)} />
              <Input label="GSTIN" value={form.gstin || ''} onChange={e => set('gstin', e.target.value)} />
              <Input label="PAN" value={form.pan || ''} onChange={e => set('pan', e.target.value)} />
              <Input label="Phone" value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
              <Input label="WhatsApp" value={form.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} />
              <Input label="Email" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} className="sm:col-span-2" />
            </div>
            <Input label="Address" type="textarea" value={form.address || ''} onChange={e => set('address', e.target.value)} />
            {/* Logo upload with preview */}
            <div>
              <label className="block text-sm font-medium text-bb-text mb-1.5">Logo</label>
              <input
                type="file"
                accept="image/*"
                onChange={e => handleImageUpload('logo', e.target.files?.[0])}
                className="text-sm text-bb-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-bb-accent/20 file:text-bb-accent hover:file:bg-bb-accent/30 file:cursor-pointer"
              />
              <p className="text-xs text-bb-muted mt-1">Shown on your quotations and bills. Resized automatically.</p>
              {form.logo && <img src={form.logo} alt="Logo" className="mt-2 h-16 rounded" />}
            </div>
          </div>
        </Card>
      )}

      {/* Bank Tab */}
      {tab === 'bank' && (
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Account Name" value={form.bankDetails?.accountName || ''} onChange={e => setBank('accountName', e.target.value)} />
            <Input label="Account No" value={form.bankDetails?.accountNo || ''} onChange={e => setBank('accountNo', e.target.value)} />
            <Input label="Bank Name" value={form.bankDetails?.bankName || ''} onChange={e => setBank('bankName', e.target.value)} />
            <Input label="Branch" value={form.bankDetails?.branch || ''} onChange={e => setBank('branch', e.target.value)} />
            <Input label="IFSC Code" value={form.bankDetails?.ifscCode || ''} onChange={e => setBank('ifscCode', e.target.value)} />
            <Input label="UPI ID" value={form.bankDetails?.upiId || ''} onChange={e => setBank('upiId', e.target.value)} />
          </div>
        </Card>
      )}

      {/* Invoice Tab */}
      {tab === 'invoice' && (
        <Card>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Invoice Prefix" value={form.invoicePrefix || ''} onChange={e => set('invoicePrefix', e.target.value)} />
              <Input label="Default GST Rate (%)" type="number" value={form.defaultGstRate || ''} onChange={e => set('defaultGstRate', Number(e.target.value))} />
            </div>
            <Input label="Thank You Message" value={form.thankYouMessage || ''} onChange={e => set('thankYouMessage', e.target.value)} />

            {/* Terms & Conditions management */}
            <div>
              <label className="block text-sm font-medium text-bb-text mb-2">Terms & Conditions</label>
              <div className="space-y-1.5 mb-3">
                {(form.termsAndConditions || []).map((t, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-bb-input rounded-lg">
                    <span className="flex-1 text-sm text-bb-text">{t}</span>
                    <button onClick={() => handleRemoveTerm(i)} className="text-red-400 hover:text-red-300 cursor-pointer">
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Add new term..." value={newTerm} onChange={e => setNewTerm(e.target.value)} className="flex-1"
                  onKeyDown={e => e.key === 'Enter' && handleAddTerm()}
                />
                <Button size="sm" icon={Plus} onClick={handleAddTerm}>Add</Button>
              </div>
            </div>

            {/* Signature Upload */}
            <div>
              <label className="block text-sm font-medium text-bb-text mb-1.5">Signature</label>
              <input
                type="file"
                accept="image/*"
                onChange={e => handleImageUpload('signature', e.target.files?.[0])}
                className="text-sm text-bb-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-bb-accent/20 file:text-bb-accent hover:file:bg-bb-accent/30 file:cursor-pointer"
              />
              {form.signature && <img src={form.signature} alt="Signature" className="mt-2 h-12" />}
            </div>
          </div>
        </Card>
      )}

      {/* Services Tab */}
      {tab === 'services' && (
        <div className="space-y-3">
          {/* Category List */}
          {categories.map(cat => (
            <Card key={cat.id} hover>
              <div className="flex items-center justify-between">
                <button onClick={() => { setCatModal(cat.id); setNewItemInput(''); }} className="flex items-center gap-2 text-sm font-medium text-bb-text cursor-pointer">
                  <span className="text-lg">{cat.icon}</span>
                  {cat.name}
                  <span className="text-xs text-bb-muted">({cat.items.length} items)</span>
                </button>
                <div className="flex gap-1">
                  <button onClick={() => { setCatModal(cat.id); setNewItemInput(''); }} className="p-1.5 rounded text-bb-muted hover:text-bb-accent cursor-pointer">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => deleteCategory(cat.id)} className="p-1.5 rounded text-bb-muted hover:text-red-400 cursor-pointer">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))}

          {/* Add Category */}
          <Card>
            <h3 className="text-sm font-semibold text-bb-muted uppercase mb-3">Add Category</h3>
            <div className="flex gap-2">
              <Input placeholder="Icon (emoji)" value={newCatIcon} onChange={e => setNewCatIcon(e.target.value)} className="w-20" />
              <Input placeholder="Category name" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="flex-1"
                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              />
              <Button icon={Plus} onClick={handleAddCategory}>Add</Button>
            </div>
          </Card>

          {/* Category Items Modal - manage items within a category */}
          <Modal isOpen={!!catModal} onClose={() => setCatModal(null)} title={openCat ? `${openCat.icon} ${openCat.name}` : ''} size="md">
            {openCat && (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {openCat.items.map(item => (
                  <div key={item} className="flex items-center justify-between p-2 bg-bb-input rounded-lg">
                    <span className="text-sm text-bb-text">{item}</span>
                    <button onClick={() => removeItemFromCat(openCat.id, item)} className="text-red-400 hover:text-red-300 cursor-pointer">
                      <X size={16} />
                    </button>
                  </div>
                ))}

                <div className="flex gap-2 pt-2 border-t border-bb-border">
                  <Input placeholder="New item..." value={newItemInput} onChange={e => setNewItemInput(e.target.value)} className="flex-1"
                    onKeyDown={e => e.key === 'Enter' && handleAddItemToCat(openCat.id)}
                  />
                  <Button size="sm" icon={Plus} onClick={() => handleAddItemToCat(openCat.id)}>Add</Button>
                </div>
              </div>
            )}
          </Modal>
        </div>
      )}

      </fieldset>

      {/* Team Tab - logged-in user, role + logout (always usable) */}
      {tab === 'team' && (
        <Card>
          <div className="space-y-4">
            {user && (
              <div className="flex items-center gap-3 p-3 bg-bb-input rounded-lg">
                {user.photoURL && <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full" />}
                <div>
                  <p className="text-sm font-medium text-bb-text">{user.displayName || 'User'}</p>
                  <p className="text-xs text-bb-muted">{user.email}</p>
                  <p className="text-xs text-bb-accent font-medium mt-0.5">{isOwner ? 'Owner · full access' : 'Staff · can manage events, not settings'}</p>
                </div>
              </div>
            )}
            {/* Team management — owner only */}
            {isOwner ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-bb-text mb-1">Add a teammate</p>
                  <p className="text-xs text-bb-muted mb-2">
                    Enter their Gmail address. When they open EventScope and sign in with that Google account, they join your company as staff.
                  </p>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        type="email"
                        placeholder="teammate@gmail.com"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleInvite()}
                      />
                    </div>
                    <Button icon={UserPlus} onClick={handleInvite} disabled={inviting || !canEditSettings}>
                      {inviting ? 'Adding…' : 'Add'}
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-bb-text mb-2">Team ({team.length + invites.length})</p>
                  <div className="divide-y divide-bb-border border border-bb-border rounded-lg">
                    {[...team].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0)).map(m => (
                      <div key={m.uid} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-bb-text truncate">{m.name || m.email}{m.uid === user?.uid ? ' (you)' : ''}</p>
                          <p className="text-xs text-bb-muted truncate">{m.email}</p>
                        </div>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.role === 'owner' ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-600'}`}>
                          {m.role === 'owner' ? 'Owner' : 'Staff'}
                        </span>
                        {m.role !== 'owner' && (
                          <button
                            onClick={() => handleRemove(m)}
                            disabled={!canEditSettings}
                            className="text-xs text-red-600 hover:underline cursor-pointer disabled:opacity-40"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    {invites.map(inv => (
                      <div key={inv.email} className="flex items-center gap-3 px-3 py-2.5 bg-amber-50/50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-bb-text truncate">{inv.email}</p>
                          <p className="text-xs text-bb-muted">Waiting for them to sign in</p>
                        </div>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Invited</span>
                        <button
                          onClick={() => handleCancelInvite(inv.email)}
                          disabled={!canEditSettings}
                          className="text-xs text-bb-muted hover:text-red-600 hover:underline cursor-pointer disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-bb-muted text-center py-2">Your company’s owner manages the team.</p>
            )}
            <button
              onClick={logout}
              className="w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg text-sm transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </Card>
      )}

      <fieldset disabled={!canEditSettings} className="space-y-4 min-w-0">
      {tab === 'joblog' && (
        <Card>
          <JobLogColumnsEditor />
        </Card>
      )}

      </fieldset>

      <p className="text-center text-xs text-bb-muted space-x-3 pt-2">
        <a href="#/privacy" target="_blank" rel="noreferrer" className="hover:text-bb-text">Privacy</a>
        <a href="#/terms" target="_blank" rel="noreferrer" className="hover:text-bb-text">Terms</a>
        <a href="#/data-protection" target="_blank" rel="noreferrer" className="hover:text-bb-text">How we protect your data</a>
      </p>

      {/* Save Button - shown for editable tabs, and only to users who can edit */}
      {canEditSettings && !['services', 'team', 'joblog'].includes(tab) && (
        <Button icon={Save} fullWidth size="lg" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      )}
    </div>
  );
}
