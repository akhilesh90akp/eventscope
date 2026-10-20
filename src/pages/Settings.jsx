/**
 * Settings — Application configuration page
 *
 * Tabs: Company, Bank, Invoice, Contract, Calendar (daily limit + reminders),
 * Services, Team (invite staff/owners, promote, remove staff), Job Log columns
 * and Backup. Each tab starts with one line saying what it's for (TAB_HELP).
 * Settings belong to the tenant (company). Only the owner can change them;
 * staff see them read-only (firestore.rules enforces the same).
 * All changes persist to Firestore via AppContext (not localStorage).
 *
 * Phones: /settings is a list of sections; each opens as its own screen
 * (/settings/company, /settings/team…) with Save in the title bar and at the
 * bottom. Laptops keep the tabs (the address can also pick the tab).
 *
 * Save actions await the Firestore result before confirming success —
 * see CODE_STRUCTURE.md §3-4.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useIsPhone } from '../components/useIsPhone';
import { usePhoneHeader } from '../components/phoneScreens';
import { HeaderTextButton } from '../components/PhoneHeader';
import ActionBar from '../components/ActionBar';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import StickyBar from '../components/StickyBar';
import Button from '../components/Button';
import Input from '../components/Input';
import Modal from '../components/Modal';
import JobLogColumnsEditor from '../components/JobLogColumnsEditor';
import { resizeImageFile } from '../utils/helpers';
import { lastStartupText } from '../utils/startupTiming';
import { PageHeader, HeaderIcon } from '../components/LaptopUI';
import { Save, Plus, Trash2, Edit2, X, Building2, Landmark, FileText, Layers, Users, Table2, UserPlus, DatabaseBackup, Download, FileSignature, CalendarDays, Bell } from 'lucide-react';
import Toggle from '../components/Toggle';
import ReminderSwitch from '../components/ReminderSwitch';
import { DEFAULT_CONTRACT_TERMS } from '../constants/contract';
import { DEFAULT_MAX_PER_DAY } from '../utils/calendar';
import { useConfirm } from '../components/useConfirm';
import { PlanTag } from '../components/UpgradeCard';
import { teamLimit, planName } from '../utils/billing';

// ============================================================
// CONSTANTS
// ============================================================

/** One line under the tabs: what each tab is for */
const TAB_HELP = {
  company: 'Your business details. They appear at the top of every quotation, bill and contract.',
  bank: 'Where clients pay you. Shown on bills so clients can pay by bank transfer or UPI.',
  invoice: 'How quotations and bills are numbered and worded: GST rate, terms and your signature.',
  contract: 'Your standard terms. They fill in every client agreement (Contract button on a confirmed event). Have your advocate check the agreement once before first use.',
  calendar: 'Helps you avoid overbooking, and reminds you before each event so nothing is missed.',
  services: 'The services and items you offer. They appear as choices when you build a quote, so you don’t type them every time.',
  team: 'Who can use EventScope for your company. Staff handle events; owners also see settings, reports and profit.',
  joblog: 'The cost and income columns in your Job Log. Add what you track, and each event’s profit is worked out for you.',
  backup: 'A copy of all your company’s data that you keep yourself, on top of the automatic daily backup.',
};

// ============================================================
// Settings — MAIN COMPONENT
// ============================================================

/** Multi-tab settings page for company, bank, invoice, and service configuration */
export default function Settings() {
  const { settings, categories, updateSettings, addCategory, deleteCategory, addItemToCat, removeItemFromCat, logout, user, showToast, canEditSettings, isOwner, isSuspended, team, invites, inviteTeammate, cancelInvite, removeTeammate, promoteToOwner, downloadCompanyBackup, tenant, canUse } = useApp();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [backingUp, setBackingUp] = useState(false);
  const [startupText] = useState(lastStartupText);

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const location = useLocation();
  const { section } = useParams();                                   // phones: /settings/<section>
  const isPhone = useIsPhone();
  const [tabState, setTabState] = useState(location.state?.tab || 'company');   // other pages can open a tab (e.g. Calendar → 'calendar')
  const tab = section || tabState;
  const setTab = (key) => (isPhone ? navigate(`/settings/${key}`) : setTabState(key));
  const [form, setForm] = useState({ ...settings, bankDetails: { ...settings.bankDetails } });
  const [catModal, setCatModal] = useState(null); // category id for item management modal
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📦');
  const [newItemInput, setNewItemInput] = useState('');
  const [newTerm, setNewTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');   // 'staff' | 'owner'
  const [inviting, setInviting] = useState(false);

  // ------------------------------------------------------------
  // DATA LOADING / EFFECTS
  // ------------------------------------------------------------

  // Settings load asynchronously after sign-in; re-sync the form when they
  // arrive (or change) so it never shows — and then saves — stale blanks.
  useEffect(() => {
    setForm({ ...settings, bankDetails: { ...settings.bankDetails } });
  }, [settings]);

  // ------------------------------------------------------------
  // EVENT HANDLERS — FORM FIELDS
  // ------------------------------------------------------------

  /** Updates a top-level form field */
  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  /** Updates a nested bank details field */
  const setBank = (key, val) => setForm(p => ({ ...p, bankDetails: { ...p.bankDetails, [key]: val } }));

  /** Updates one of the company's contract terms (Settings → Contract) */
  const setTerm = (key, val) => setForm(p => ({ ...p, contractTerms: { ...DEFAULT_CONTRACT_TERMS, ...p.contractTerms, [key]: val } }));
  const terms = { ...DEFAULT_CONTRACT_TERMS, ...form.contractTerms };
  const num = (key) => (e) => setTerm(key, e.target.value === '' ? '' : Math.max(0, Number(e.target.value)));

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
  // EVENT HANDLERS — SAVE / CATEGORIES / TERMS
  // ------------------------------------------------------------

  /** Saves the current form state to global settings. Awaits the write; uses the app's toast, not a blocking alert(). */
  const handleSave = async () => {
    if (saving) return;
    const maxPerDay = Math.round(Number(form.maxEventsPerDay));
    if (form.maxEventsPerDay !== undefined && !(maxPerDay >= 1 && maxPerDay <= 50)) {
      setTab('calendar');
      showToast('Events a day: enter a number from 1 to 50', 'error');
      return;
    }
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
  // EVENT HANDLERS — TEAM (owner only)
  // ------------------------------------------------------------

  /** Invites a teammate by email (owner only) */
  const handleInvite = async () => {
    if (inviting || !inviteEmail.trim()) return;
    // plan's team size: owners + staff + open invites
    const limit = teamLimit(tenant?.plan);
    if ((team?.length || 0) + (invites?.length || 0) >= limit) {
      if (await confirm({ title: `Your ${planName(tenant?.plan)} plan allows ${limit} people`, message: 'Upgrade to add more people to your team.', confirmLabel: 'See plans', tone: 'primary' })) navigate('/billing');
      return;
    }
    setInviting(true);
    try {
      if (inviteRole === 'owner' && !(await confirm({ title: 'Add as an owner?', message: <><b className="text-bb-text">{inviteEmail.trim()}</b> will get full access: settings, team, reports and profit.</>, note: 'Owners can’t be removed by other owners.', confirmLabel: 'Add owner', tone: 'warning' }))) return;
      const result = await inviteTeammate(inviteEmail, inviteRole);
      if (result.success) {
        showToast(`Invite added — ask them to sign in with ${inviteEmail.trim()}`);
        setInviteEmail('');
        setInviteRole('staff');
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

  /** Makes a staff member an owner, after confirmation (one way for owners) */
  const handlePromote = async (member) => {
    if (!(await confirm({ title: `Make ${member.name || member.email} an owner?`, message: 'They get full access, including settings, team, reports and profit.', note: 'Owners can’t downgrade or remove each other.', confirmLabel: 'Make owner', tone: 'warning' }))) return;
    const result = await promoteToOwner(member.uid);
    showToast(result.success ? `${member.name || member.email} is now an owner` : result.error, result.success ? 'success' : 'error');
  };

  /** Removes a staff member after confirmation */
  const handleRemove = async (member) => {
    if (!(await confirm({ title: 'Remove teammate?', message: <><b className="text-bb-text">{member.name || member.email}</b> will lose access to your company straight away.</>, note: 'You can invite them again later.', confirmLabel: 'Remove', tone: 'danger' }))) return;
    const result = await removeTeammate(member.uid);
    showToast(result.success ? 'Teammate removed' : result.error, result.success ? 'success' : 'error');
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  // Tab configuration
  const tabs = [
    { key: 'company', label: 'Company', icon: Building2 },
    { key: 'bank', label: 'Bank', icon: Landmark },
    { key: 'invoice', label: 'Invoice', icon: FileText },
    { key: 'contract', label: 'Contract', icon: FileSignature },
    { key: 'calendar', label: 'Calendar & reminders', icon: CalendarDays },
    { key: 'services', label: 'Services', icon: Layers },
    { key: 'team', label: 'Team', icon: Users },
    { key: 'joblog', label: 'Job Log columns', icon: Table2 },
    ...(isOwner ? [{ key: 'backup', label: 'Backup', icon: DatabaseBackup }] : []),
  ];

  const openCat = categories.find(c => c.id === catModal);

  // Phones: the section's name in the title bar, Save on the right (editable sections)
  const savable = canEditSettings && !['services', 'team', 'joblog', 'backup'].includes(tab);
  const sectionLabel = tabs.find(t => t.key === tab)?.label || 'Settings';
  usePhoneHeader(isPhone && section ? {
    title: sectionLabel,
    sub: 'Settings',
    right: savable ? <HeaderTextButton onClick={handleSave} disabled={saving} data-testid="header-save">Save</HeaderTextButton> : null,
  } : {}, [isPhone, section, sectionLabel, savable, saving, form]);

  // ------------------------------------------------------------
  // RENDER — PHONE: list of sections
  // ------------------------------------------------------------
  if (isPhone && !section) {
    const subs = {
      company: 'Name, logo, GSTIN, address, colour', bank: 'Shown on bills', invoice: 'Numbering, GST, terms',
      contract: 'Court city, cancellation terms', calendar: 'Daily limit, phone reminders', services: 'Your categories & items',
      team: `${team.length} ${team.length === 1 ? 'person' : 'people'}${invites.length ? ` · ${invites.length} invited` : ''}`, joblog: 'Cost columns', backup: 'Download everything',
    };
    return (
      <div className="space-y-5" data-testid="settings-list">
        <div className="bg-white border border-bb-border rounded-2xl p-4 flex items-center gap-3">
          {settings.logo
            ? <img src={settings.logo} alt="" className="w-12 h-12 rounded-xl object-contain bg-gray-50" />
            : <div className="w-12 h-12 rounded-xl bg-violet-100 text-bb-accent-hover font-extrabold flex items-center justify-center">{(settings.companyName || '?').trim().slice(0, 2).toUpperCase()}</div>}
          <div className="min-w-0">
            <b className="block text-[16px] truncate">{settings.companyName || 'Your company'}</b>
            <span className="block text-[13px] text-gray-600">{planName(tenant?.plan)} plan · {isOwner ? 'Owner' : 'Staff'}</span>
          </div>
        </div>
        <div className="bg-white border border-bb-border rounded-2xl px-4">
          {tabs.map(t => (
            <button key={t.key} onClick={() => navigate(`/settings/${t.key}`)} data-testid={`settings-${t.key}`}
              className="w-full flex items-center gap-3.5 min-h-[64px] border-b border-bb-border last:border-b-0 text-left cursor-pointer">
              <span className="w-9 h-9 rounded-xl bg-violet-50 text-bb-accent-hover flex items-center justify-center shrink-0"><t.icon size={19} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] font-semibold">{t.label}</span>
                <span className="block text-[13px] text-gray-600 truncate">{subs[t.key]}</span>
              </span>
              {t.key === 'joblog' && !canUse('jobLog') && <PlanTag feature="jobLog" />}
              <ChevronRight size={18} className="text-gray-400" />
            </button>
          ))}
        </div>
        <p className="text-center text-[13px] text-gray-600 space-x-3">
          <a href="#/privacy" target="_blank" rel="noreferrer">Privacy</a>
          <a href="#/terms" target="_blank" rel="noreferrer">Terms</a>
          <a href="#/data-protection" target="_blank" rel="noreferrer">How we protect your data</a>
        </p>
        {startupText && <p className="text-center text-[11px] text-bb-muted/70" data-testid="startup-timing">{startupText}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {!isPhone && <PageHeader title="Settings"
        actions={savable && <HeaderIcon icon={Save} label={saving ? 'Saving…' : 'Save settings'} tone="primary" onClick={handleSave} disabled={saving} data-testid="hdr-save" />} />}

      {/* Tab Buttons — stay pinned while scrolling (laptops; phones open one section at a time) */}
      {!isPhone && <StickyBar>
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
      </StickyBar>}

      {/* What this tab is for */}
      <p className="text-sm text-bb-muted -mt-1" data-testid="tab-help">{TAB_HELP[tab]}</p>

      {/* Read-only notice for staff / suspended accounts */}
      {!canEditSettings && tab !== 'team' && tab !== 'backup' && (
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
            {/* Brand colour on quotes & bills — Premium */}
            <div>
              <label htmlFor="brand-color" className="flex items-center gap-2 text-sm font-medium text-bb-text mb-1.5">
                Brand colour on quotes & bills {!canUse('branding') && <PlanTag feature="branding" />}
              </label>
              <div className="flex items-center gap-3">
                <input id="brand-color" type="color" disabled={!canUse('branding')} value={/^#[0-9a-fA-F]{6}$/.test(form.brandColor || '') ? form.brandColor : '#652D90'}
                  onChange={e => set('brandColor', e.target.value)} className="w-12 h-10 rounded-lg border border-bb-border bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" />
                <span className="text-xs text-bb-muted">{canUse('branding') ? 'Headings and lines on your PDFs use this colour.' : 'Premium: use your own colour, and the “Made with EventScope” line goes away.'}</span>
                {canUse('branding') && form.brandColor && <button type="button" onClick={() => set('brandColor', '')} className="text-xs text-bb-muted hover:text-bb-accent cursor-pointer">Reset</button>}
              </div>
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

      {/* Contract Tab — the company's own terms; they fill the blanks of every agreement */}
      {tab === 'contract' && (
        <Card>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input label="Signed for the company by" value={terms.signatory} onChange={e => setTerm('signatory', e.target.value)} placeholder="Proprietor’s name" />
              <Input label="Place agreements are signed" value={terms.place} onChange={e => setTerm('place', e.target.value)} placeholder="e.g. Kochi" />
              <Input label="Court city (disputes)" value={terms.courtCity} onChange={e => setTerm('courtCity', e.target.value)} placeholder="e.g. Ernakulam" />
            </div>
            <h3 className="text-sm font-semibold text-bb-text pt-1">Cancellation by the client</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input label="Early: more than (days)" type="number" value={terms.farDays} onChange={num('farDays')} />
              <Input label="Early: keep % of price" type="number" value={terms.adminPct} onChange={num('adminPct')} />
              <Input label="Late: less than (days)" type="number" value={terms.nearDays} onChange={num('nearDays')} />
              <Input label="Late: client pays % of price" type="number" value={terms.nearPct} onChange={num('nearPct')} />
            </div>
            <p className="text-xs text-bb-muted">
              Between {terms.nearDays} and {terms.farDays} days, the advance is kept and nothing more is due.
            </p>
            <h3 className="text-sm font-semibold text-bb-text pt-1">Payment and venue</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input label="Balance due (days before)" type="number" value={terms.balanceDaysBefore} onChange={num('balanceDaysBefore')} />
              <Input label="Refund within (days)" type="number" value={terms.refundDays} onChange={num('refundDays')} />
              <Input label="Setup: hours before" type="number" value={terms.setupHours} onChange={num('setupHours')} />
              <Input label="Removal: hours after" type="number" value={terms.removalHours} onChange={num('removalHours')} />
            </div>
            <div className="space-y-3 pt-1">
              <Toggle label="Contract price includes GST" checked={!!terms.gstIncluded} onChange={e => setTerm('gstIncluded', e.target.checked)} />
              <Toggle label="We may photograph our own décor for our portfolio" description="Adds a clause; the client can object in writing." checked={!!terms.portfolioPhotos} onChange={e => setTerm('portfolioPhotos', e.target.checked)} />
            </div>
          </div>
        </Card>
      )}

      {/* Calendar Tab — daily limit (saved with Save Settings) + this device's reminders */}
      {tab === 'calendar' && (
        <div className="space-y-4">
          <Card>
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-bb-text">Events your team can handle in a day</h2>
              <Input
                label="Most events in one day"
                type="number" min="1" max="50"
                value={form.maxEventsPerDay ?? DEFAULT_MAX_PER_DAY}
                onChange={e => set('maxEventsPerDay', e.target.value === '' ? '' : Number(e.target.value))}
                className="max-w-xs"
              />
              <p className="text-xs text-bb-muted">
                Think of how many events your crew, décor stock and vehicles can cover on the same day.
                On the Calendar, days near this number turn orange and full days turn red, and the app asks
                before you confirm an event on a full day. Drafts don’t count until they’re confirmed.
              </p>
            </div>
          </Card>
          {isOwner && (
            <Card>
              <div className="space-y-3">
                <h2 className="text-base font-semibold text-bb-text flex items-center gap-1.5"><Bell size={16} /> Event reminders</h2>
                <p className="text-xs text-bb-muted">
                  A notification on this phone or laptop 2 days before each confirmed event, and again on the day, at 9 am, even when
                  the app is closed. Turn it on separately on each device you use.
                </p>
                <ReminderSwitch />
              </div>
            </Card>
          )}
        </div>
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
                  <button onClick={async () => (await confirm({ title: `Delete “${cat.name}”?`, message: `The category and its ${cat.items.length} items will be removed. Existing quotations aren’t affected.`, confirmLabel: 'Delete', tone: 'danger' })) && deleteCategory(cat.id)} className="p-1.5 rounded text-bb-muted hover:text-red-400 cursor-pointer" title="Delete category">
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
                    Enter their Gmail address. When they open EventScope and sign in with that Google account, they can join your company.
                    Staff work on events, quotes and bills; owners also get settings, team, reports and profit.
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
                    <select
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value)}
                      aria-label="Role"
                      className="bg-bb-input border border-bb-border rounded-lg pl-3 py-2.5 text-sm text-bb-text"
                    >
                      <option value="staff">Staff</option>
                      <option value="owner">Owner</option>
                    </select>
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
                          <>
                            <button
                              onClick={() => handlePromote(m)}
                              disabled={!canEditSettings}
                              className="text-xs text-bb-accent hover:underline cursor-pointer disabled:opacity-40 whitespace-nowrap"
                            >
                              Make owner
                            </button>
                            <button
                              onClick={() => handleRemove(m)}
                              disabled={!canEditSettings}
                              className="text-xs text-red-600 hover:underline cursor-pointer disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                    {invites.map(inv => (
                      <div key={inv.email} className="flex items-center gap-3 px-3 py-2.5 bg-amber-50/50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-bb-text truncate">{inv.email}</p>
                          <p className="text-xs text-bb-muted">Waiting for them to sign in</p>
                        </div>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">Invited · {inv.role === 'owner' ? 'Owner' : 'Staff'}</span>
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

      {/* Backup Tab — owners only; works even while suspended (read-only) */}
      {tab === 'backup' && isOwner && (
        <Card>
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-bb-text">Download a full backup</h2>
            <p className="text-sm text-bb-muted">
              One file with everything for your company — events, quotations, bills, Job Log costs, settings,
              services and team. Keep it somewhere safe (not in a shared folder): it contains your clients’ details and your bank details.
            </p>
            <Button
              icon={Download}
              disabled={backingUp}
              onClick={async () => {
                setBackingUp(true);
                const r = await downloadCompanyBackup();
                setBackingUp(false);
                showToast(r.success ? `Backup downloaded — ${r.counts.events} events` : r.error, r.success ? 'success' : 'error');
              }}
            >
              {backingUp ? 'Preparing…' : 'Download backup'}
            </Button>
          </div>
        </Card>
      )}

      <p className="text-center text-xs text-bb-muted space-x-3 pt-2">
        <a href="#/privacy" target="_blank" rel="noreferrer" className="hover:text-bb-text">Privacy</a>
        <a href="#/terms" target="_blank" rel="noreferrer" className="hover:text-bb-text">Terms</a>
        <a href="#/data-protection" target="_blank" rel="noreferrer" className="hover:text-bb-text">How we protect your data</a>
      </p>
      {/* Start-up timing (diagnostic) — helps pin down slow starts on a phone */}
      {startupText && <p className="text-center text-[11px] text-bb-muted/70" data-testid="startup-timing">{startupText}</p>}

      {/* Save Button - shown for editable tabs, and only to users who can edit (phones: pinned at the bottom) */}
      {savable && !isPhone && (
        <Button icon={Save} fullWidth size="lg" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      )}
      {savable && isPhone && (
        <ActionBar testId="settings-save-bar">
          <Button icon={Save} fullWidth size="lg" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : `Save ${sectionLabel.toLowerCase()}`}
          </Button>
        </ActionBar>
      )}
    </div>
  );
}
