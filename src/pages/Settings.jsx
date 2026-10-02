/**
 * Settings — Application configuration page
 *
 * Multi-tab settings interface for managing company details, bank information,
 * invoice preferences, service categories, and team (placeholder).
 * All changes persist to Firestore via AppContext (not localStorage).
 *
 * Save actions await the Firestore result before confirming success —
 * see CODE_STRUCTURE.md §3-4.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Modal from '../components/Modal';
import { Save, Plus, Trash2, Edit2, X, Building2, Landmark, FileText, Layers, Users, RefreshCw } from 'lucide-react';

// ============================================================
// Settings — MAIN COMPONENT
// ============================================================

/** Multi-tab settings page for company, bank, invoice, and service configuration */
export default function Settings() {
  const { settings, categories, updateSettings, addCategory, updateCategory, deleteCategory, addItemToCat, removeItemFromCat, logout, user, showToast } = useApp();

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
    { key: 'sync', label: 'Sheet Sync', icon: RefreshCw },
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
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => set('logo', ev.target.result);
                    reader.readAsDataURL(file);
                  }
                }}
                className="text-sm text-bb-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-bb-accent/20 file:text-bb-accent hover:file:bg-bb-accent/30 file:cursor-pointer"
              />
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
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => set('signature', ev.target.result);
                    reader.readAsDataURL(file);
                  }
                }}
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

      {/* Team Tab - now shows logged-in user + logout */}
      {tab === 'team' && (
        <Card>
          <div className="space-y-4">
            {user && (
              <div className="flex items-center gap-3 p-3 bg-bb-input rounded-lg">
                {user.photoURL && <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full" />}
                <div>
                  <p className="text-sm font-medium text-bb-text">{user.displayName || 'User'}</p>
                  <p className="text-xs text-bb-muted">{user.email}</p>
                </div>
              </div>
            )}
            <div className="text-center py-4">
              <Users size={32} className="mx-auto text-bb-muted mb-2" />
              <p className="text-sm text-bb-muted">Team member management coming soon</p>
            </div>
            <button
              onClick={logout}
              className="w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg text-sm transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </Card>
      )}

      {tab === 'sync' && (
        <Card>
          <div className="space-y-4">
            <p className="text-sm text-bb-muted">
              Connects completed events to your Google Sheet's Job Log tab.
              Paste the values from your Apps Script deployment here — see
              the setup instructions you were given for exact steps.
            </p>
            <Input
              label="Apps Script Web App URL"
              value={form.sheetSyncUrl || ''}
              onChange={e => set('sheetSyncUrl', e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
            />
            <Input
              label="Shared Secret"
              type="password"
              value={form.sheetSyncSecret || ''}
              onChange={e => set('sheetSyncSecret', e.target.value)}
              placeholder="Must match SHARED_SECRET in the Apps Script"
            />
            <Input
              label="Google Sheet Link"
              value={form.sheetViewUrl || ''}
              onChange={e => set('sheetViewUrl', e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </div>
        </Card>
      )}

      {/* Save Button - shown for editable tabs only */}
      {tab !== 'services' && tab !== 'team' && (
        <Button icon={Save} fullWidth size="lg" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      )}
    </div>
  );
}
