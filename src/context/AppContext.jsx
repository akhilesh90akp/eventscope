/**
 * AppContext — Global state and the ONLY place that talks to Firestore
 *
 * Multi-tenant: every company (tenant) has its own data, and each login is
 * linked to exactly one tenant. On sign-in we read users/{uid} to find the
 * tenant, then load only that tenant's data. Firestore layout:
 *
 *   platformAdmins/{uid}                      EventScope staff (added by hand in the console)
 *   users/{uid}                               { tenantId, role: 'owner'|'staff', name, email, joinedAt }
 *   invites/{email}                           pending invite { tenantId, role, ... } (owners invite staff; admins may invite owners)
 *   tenants/{tenantId}                        { name, plan, status, ownerUid, ownerEmail, createdAt } — platform-controlled
 *   tenants/{tenantId}/private/contact        owner's backup email + phone (owner + admins only)
 *   tenants/{tenantId}/config/settings        company profile + invoice settings (owner-editable)
 *   tenants/{tenantId}/config/categories      service categories (owner-editable)
 *   tenants/{tenantId}/config/jobLog          Job Log columns (owner-editable)
 *   tenants/{tenantId}/events/{eventId}       one doc per event/draft
 *   tenants/{tenantId}/financials/{eventId}   { values: { [columnId]: number|string|null } } — costs/income/notes
 *
 * firestore.rules enforces the same boundaries server-side; the permission
 * flags exposed here (isOwner, canEditSettings, …) only drive the UI.
 *
 * Every write returns { success, error? } instead of firing-and-forgetting —
 * callers MUST check it before telling the user it worked (CODE_STRUCTURE.md §3).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, getDoc, getDocs, query, where,
  writeBatch, getCountFromServer, terminate, clearIndexedDbPersistence,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { DEFAULT_SETTINGS, DEFAULT_CATEGORIES, DEFAULT_JOBLOG_COLUMNS } from '../constants/data';
import { genId, inviteKey } from '../utils/helpers';

// ============================================================
// CONSTANTS
// ============================================================

const Ctx = createContext();

/** Firestore batches cap at 500 writes; stay safely under it */
const BATCH_LIMIT = 450;

// ============================================================
// HELPERS
// ============================================================

/** Turns a Firestore error into a message a user can act on */
const friendlyError = (err, what = 'save') => (
  err?.code === 'permission-denied'
    ? `Couldn’t ${what} — you don’t have permission for this (or the account is suspended).`
    : err?.code === 'unavailable'
      ? `Couldn’t ${what} — you appear to be offline. Check your connection and try again.`
      : err?.message || `Couldn’t ${what}.`
);

/** Returns the pending invite for this login's Google email, or null */
async function findInvite(user) {
  if (!user?.email) return null;
  const snap = await getDoc(doc(db, 'invites', inviteKey(user.email)));
  return snap.exists() ? snap.data() : null;
}

/**
 * Joins the invited tenant: creates users/{uid} and deletes the invite in
 * one atomic batch. Only called after the person clicks "Join" — never
 * automatically, so nobody can be pulled into a company they didn't choose.
 * firestore.rules only allow this when the invite matches the signed-in,
 * Google-verified email.
 */
async function joinViaInvite(user, invite) {
  const inviteRef = doc(db, 'invites', inviteKey(user.email));
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', user.uid), {
    tenantId: invite.tenantId,
    role: invite.role,
    name: user.displayName || '',
    email: inviteKey(user.email),
    joinedAt: new Date().toISOString(),
  });
  batch.delete(inviteRef);
  await batch.commit();
}

// ============================================================
// AppProvider — MAIN COMPONENT
// ============================================================

export function AppProvider({ children }) {
  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------

  // Auth
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Membership — which company this login belongs to
  // tenantStatus: 'loading' | 'ready' | 'invited' (has a pending invite) |
  //               'none' (signed in, no company) | 'error'
  const [membership, setMembership] = useState(null);     // { tenantId, role }
  const [tenant, setTenant] = useState(null);             // tenants/{tenantId} doc
  const [tenantStatus, setTenantStatus] = useState('loading');
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [pendingInvite, setPendingInvite] = useState(null); // invite waiting for Join / Decline

  // Company data
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loaded, setLoaded] = useState(false);            // events have arrived at least once
  const [jobLogColumns, setJobLogColumns] = useState(DEFAULT_JOBLOG_COLUMNS);
  const [financials, setFinancials] = useState({});       // { [eventId]: { values, updatedAt, updatedBy } }
  const [financialsLoaded, setFinancialsLoaded] = useState(false);

  // Team (owner only)
  const [team, setTeam] = useState([]);
  const [invites, setInvites] = useState([]);

  // UI
  const [toast, setToast] = useState({ message: '', type: 'success', visible: false });
  const toastTimer = useRef(null);

  // ------------------------------------------------------------
  // TOAST
  // ------------------------------------------------------------

  /** Shows a toast message that auto-dismisses after 3 seconds */
  const showToast = useCallback((message, type = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type, visible: true });
    toastTimer.current = setTimeout(() => {
      setToast(t => ({ ...t, visible: false }));
      // Clear message after fade-out animation
      setTimeout(() => setToast({ message: '', type: 'success', visible: false }), 300);
    }, 3000);
  }, []);

  // ------------------------------------------------------------
  // AUTH STATE
  // ------------------------------------------------------------

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /**
   * Signs out AND wipes this browser's offline copy of the company's data,
   * so the next person using a shared computer can't see it. Firestore's
   * cache can only be cleared once the client is shut down, so we reload.
   */
  const logout = async () => {
    try {
      await signOut(auth);
      await terminate(db);
      await clearIndexedDbPersistence(db);
    } catch (err) {
      console.warn('Sign-out cleanup:', err.message);
    } finally {
      // Back to the home address, then a full reload (fresh, empty client)
      window.location.hash = '#/';
      window.location.reload();
    }
  };

  // ------------------------------------------------------------
  // DATA LOADING — STEP 1: MEMBERSHIP
  // When the login changes, find which tenant it belongs to. users/{uid}
  // is watched live, so if the owner removes this person they drop out
  // straight away. No users/{uid} but an invite for this Google email?
  // Show it (status 'invited') and let the person Join or Decline.
  // ------------------------------------------------------------

  useEffect(() => {
    setMembership(null);
    setTenant(null);
    setIsPlatformAdmin(false);
    setPendingInvite(null);
    setTenantStatus('loading');
    if (!user) return undefined;

    let cancelled = false;

    getDoc(doc(db, 'platformAdmins', user.uid))
      .then(snap => { if (!cancelled) setIsPlatformAdmin(snap.exists()); })
      .catch(() => {}); // not an admin (or offline) — the Admin menu simply stays hidden

    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
      if (cancelled) return;
      const profile = snap.exists() ? snap.data() : null;
      if (profile?.tenantId) {
        setMembership({ tenantId: profile.tenantId, role: profile.role || 'staff' });
        return;
      }
      setMembership(null);
      setTenant(null);
      try {
        const invite = await findInvite(user);
        if (cancelled) return;
        setPendingInvite(invite);
        setTenantStatus(invite ? 'invited' : 'none');
      } catch (err) {
        console.error('Error checking for an invite:', err.code, err.message);
        if (!cancelled) setTenantStatus('none');
      }
    }, (err) => {
      console.error('Error resolving tenant membership:', err.code, err.message);
      if (!cancelled) setTenantStatus('error');
    });

    return () => { cancelled = true; unsubProfile(); };
  }, [user]);

  // ------------------------------------------------------------
  // DATA LOADING — STEP 2: COMPANY DATA (all live listeners)
  // Live, so edits from another tab (e.g. the Job Log) or another teammate
  // appear without a reload, and a suspension takes effect immediately.
  // ------------------------------------------------------------

  const tenantId = membership?.tenantId || null;

  useEffect(() => {
    if (!tenantId) {
      setEvents([]);
      setSettings(DEFAULT_SETTINGS);
      setCategories(DEFAULT_CATEGORIES);
      setJobLogColumns(DEFAULT_JOBLOG_COLUMNS);
      setFinancials({});
      setFinancialsLoaded(false);
      setLoaded(false);
      return undefined;
    }
    const logErr = (what) => (err) => console.error(`${what} listener error:`, err.code, err.message);

    // Tenant doc (plan / status)
    const unsubTenant = onSnapshot(doc(db, 'tenants', tenantId), (snap) => {
      if (!snap.exists()) {
        console.error('Tenant doc missing for', tenantId);
        setTenantStatus('none');
        return;
      }
      setTenant({ id: snap.id, ...snap.data() });
      setTenantStatus('ready');
    }, (err) => {
      logErr('Tenant')(err);
      setTenantStatus('error');
    });

    // Events
    const unsubEvents = onSnapshot(collection(db, 'tenants', tenantId, 'events'), (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoaded(true);
    }, (err) => {
      logErr('Events')(err);
      setLoaded(true);
    });

    // Settings + categories
    const unsubSettings = onSnapshot(doc(db, 'tenants', tenantId, 'config', 'settings'), (snap) => {
      setSettings(snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : DEFAULT_SETTINGS);
    }, logErr('Settings'));
    const unsubCats = onSnapshot(doc(db, 'tenants', tenantId, 'config', 'categories'), (snap) => {
      setCategories(snap.exists() ? (snap.data().list || DEFAULT_CATEGORIES) : DEFAULT_CATEGORIES);
    }, logErr('Categories'));

    // Job Log columns + per-event costs/income/notes
    const unsubCols = onSnapshot(doc(db, 'tenants', tenantId, 'config', 'jobLog'), (snap) => {
      const cols = snap.exists() ? snap.data().columns : null;
      setJobLogColumns(Array.isArray(cols) && cols.length ? cols : DEFAULT_JOBLOG_COLUMNS);
    }, logErr('Job Log columns'));
    const unsubFin = onSnapshot(collection(db, 'tenants', tenantId, 'financials'), (snap) => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      setFinancials(map);
      setFinancialsLoaded(true);
    }, (err) => {
      logErr('Financials')(err);
      setFinancialsLoaded(true);
    });

    return () => { unsubTenant(); unsubEvents(); unsubSettings(); unsubCats(); unsubCols(); unsubFin(); };
  }, [tenantId]);

  // ------------------------------------------------------------
  // DERIVED PERMISSIONS
  // UI hints only — firestore.rules is what actually enforces these.
  // ------------------------------------------------------------

  const role = membership?.role || null;
  const isOwner = role === 'owner';
  const isSuspended = tenant?.status === 'suspended';
  const canEditEvents = !!tenantId && !isSuspended;
  const canEditSettings = isOwner && !isSuspended;

  /** Job Log columns the owner hasn't removed (removed ones keep their values) */
  const activeJobLogColumns = jobLogColumns.filter(c => !c.hidden);

  /** Shared guard for writes. Returns an error string, or null if the write may proceed. */
  const writeBlockedReason = ({ ownerOnly = false } = {}) => {
    if (!user) return 'You are signed out — please log in again before saving.';
    if (!tenantId) return 'Your login is not linked to a company yet.';
    if (isSuspended) return 'This account is suspended — changes are disabled. Please contact EventScope support.';
    if (ownerOnly && !isOwner) return 'Only the account owner can change this.';
    return null;
  };

  // ------------------------------------------------------------
  // PUBLIC SIGN-UP — create a new company owned by this login
  // ------------------------------------------------------------

  /**
   * Creates tenants/{id}, users/{uid} (as owner) and the owner's private
   * contact record in one atomic batch, then the starting settings.
   * firestore.rules only allow this for a verified login with no company.
   * Returns { success } or { success: false, error }.
   */
  const createCompany = async ({ name, phone, city, recoveryEmail }) => {
    if (!user) return { success: false, error: 'Please sign in first.' };
    const companyName = (name || '').trim();
    if (companyName.length < 2) return { success: false, error: 'Please enter your company name.' };

    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'company';
    const newTenantId = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const ownerEmail = inviteKey(user.email);

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'tenants', newTenantId), {
        name: companyName,
        ownerUid: user.uid,
        ownerEmail,
        plan: 'trial',
        status: 'active',
        createdAt: now,
        acceptedTermsAt: now,
      });
      batch.set(doc(db, 'users', user.uid), {
        tenantId: newTenantId,
        role: 'owner',
        name: user.displayName || '',
        email: ownerEmail,
        joinedAt: now,
      });
      batch.set(doc(db, 'tenants', newTenantId, 'private', 'contact'), {
        phone: (phone || '').trim(),
        recoveryEmail: inviteKey(recoveryEmail),
      });
      await batch.commit();
    } catch (err) {
      console.error('Error creating company:', err.code, err.message);
      return {
        success: false,
        error: err.code === 'permission-denied'
          ? 'This login already belongs to a company, or its email isn’t verified.'
          : friendlyError(err, 'create your company'),
      };
    }

    // Starting settings (we're the owner now). Not fatal if this fails —
    // everything can be filled in from Settings.
    try {
      await setDoc(doc(db, 'tenants', newTenantId, 'config', 'settings'), {
        ...DEFAULT_SETTINGS,
        companyName,
        phone: (phone || '').trim(),
        whatsapp: (phone || '').trim(),
        address: (city || '').trim(),
        email: ownerEmail,
      });
    } catch (err) {
      console.warn('Company created, but starting settings failed:', err.message);
    }
    return { success: true };
  };

  // ------------------------------------------------------------
  // INVITE — JOIN OR DECLINE (for someone who was invited)
  // ------------------------------------------------------------

  /** Joins the company in the pending invite. Returns { success } or { success: false, error }. */
  const acceptPendingInvite = async () => {
    if (!user || !pendingInvite) return { success: false, error: 'No invite to accept.' };
    try {
      await joinViaInvite(user, pendingInvite);
      setPendingInvite(null); // the users/{uid} listener now loads the company
      return { success: true };
    } catch (err) {
      console.error('Error joining via invite:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'join the company') };
    }
  };

  /** Shows the Join screen for an invite that was just created for this login (Admin import) */
  const showPendingInvite = (invite) => {
    if (!invite || membership) return;
    setPendingInvite(invite);
    setTenantStatus('invited');
  };

  /** Declines (deletes) the pending invite, then offers sign-up. Returns { success } or { success: false, error }. */
  const declinePendingInvite = async () => {
    if (!user || !pendingInvite) return { success: false, error: 'No invite to decline.' };
    try {
      await deleteDoc(doc(db, 'invites', inviteKey(user.email)));
      setPendingInvite(null);
      setTenantStatus('none');
      return { success: true };
    } catch (err) {
      console.error('Error declining invite:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'decline the invite') };
    }
  };

  // ------------------------------------------------------------
  // TEAM (owner only): members + pending invites, kept live
  // ------------------------------------------------------------

  useEffect(() => {
    if (!tenantId || !isOwner) {
      setTeam([]);
      setInvites([]);
      return undefined;
    }
    const unsubTeam = onSnapshot(
      query(collection(db, 'users'), where('tenantId', '==', tenantId)),
      (snap) => setTeam(snap.docs.map(d => ({ uid: d.id, ...d.data() }))),
      (err) => console.error('Team listener error:', err.code, err.message),
    );
    const unsubInvites = onSnapshot(
      query(collection(db, 'invites'), where('tenantId', '==', tenantId)),
      (snap) => setInvites(snap.docs.map(d => ({ email: d.id, ...d.data() }))),
      (err) => console.error('Invites listener error:', err.code, err.message),
    );
    return () => { unsubTeam(); unsubInvites(); };
  }, [tenantId, isOwner]);

  /** Invites a teammate by Google email. Returns { success } or { success: false, error }. */
  const inviteTeammate = async (rawEmail) => {
    const blocked = writeBlockedReason({ ownerOnly: true });
    if (blocked) return { success: false, error: blocked };
    const email = inviteKey(rawEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (team.some(m => m.email === email)) {
      return { success: false, error: 'That person is already on your team.' };
    }
    try {
      await setDoc(doc(db, 'invites', email), {
        tenantId,
        role: 'staff',
        tenantName: settings.companyName || tenant?.name || '',
        invitedBy: user.uid,
        invitedByName: user.displayName || user.email || '',
        createdAt: new Date().toISOString(),
      });
      return { success: true };
    } catch (err) {
      console.error('Error inviting teammate:', err.code, err.message);
      return {
        success: false,
        error: err.code === 'permission-denied'
          ? 'That email already has a pending invite to another company.'
          : friendlyError(err, 'add the invite'),
      };
    }
  };

  /** Cancels a pending invite. Returns { success } or { success: false, error }. */
  const cancelInvite = async (email) => {
    const blocked = writeBlockedReason({ ownerOnly: true });
    if (blocked) return { success: false, error: blocked };
    try {
      await deleteDoc(doc(db, 'invites', inviteKey(email)));
      return { success: true };
    } catch (err) {
      console.error('Error cancelling invite:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'cancel the invite') };
    }
  };

  /** Removes a staff member from the company. Returns { success } or { success: false, error }. */
  const removeTeammate = async (uid) => {
    const blocked = writeBlockedReason({ ownerOnly: true });
    if (blocked) return { success: false, error: blocked };
    if (uid === user.uid) return { success: false, error: 'You can’t remove yourself.' };
    try {
      await deleteDoc(doc(db, 'users', uid));
      return { success: true };
    } catch (err) {
      console.error('Error removing teammate:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'remove this teammate') };
    }
  };

  // ------------------------------------------------------------
  // EVENT OPERATIONS (CRUD)
  // ------------------------------------------------------------

  /** Creates a new event/draft. Returns { success, id, event } or { success: false, error }. */
  const addEvent = async (data) => {
    const blocked = writeBlockedReason();
    if (blocked) {
      showToast(blocked, 'error');
      return { success: false, error: blocked };
    }
    const id = genId();
    const ev = { ...data, status: 'draft', createdAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'tenants', tenantId, 'events', id), ev);
      return { success: true, id, event: { id, ...ev } };
    } catch (err) {
      console.error('Error adding event:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'save the event') };
    }
  };

  /**
   * Updates an existing event. Returns { success } or { success: false, error }.
   * Pass { touch: false } for bookkeeping writes that shouldn't bump
   * `updatedAt` (so they don't look like a fresh edit).
   */
  const updateEvent = async (id, data, { touch = true } = {}) => {
    const blocked = writeBlockedReason();
    if (blocked) return { success: false, error: blocked };
    try {
      const payload = touch ? { ...data, updatedAt: new Date().toISOString() } : data;
      await setDoc(doc(db, 'tenants', tenantId, 'events', id), payload, { merge: true });
      return { success: true };
    } catch (err) {
      console.error('Error updating event:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'save the event') };
    }
  };

  /** Deletes an event. Returns { success } or { success: false, error }. */
  const deleteEvent = async (id) => {
    const blocked = writeBlockedReason();
    if (blocked) {
      showToast(blocked, 'error');
      return { success: false, error: blocked };
    }
    try {
      await deleteDoc(doc(db, 'tenants', tenantId, 'events', id));
      return { success: true };
    } catch (err) {
      console.error('Error deleting event:', err.code, err.message);
      const error = friendlyError(err, 'delete the event');
      showToast(error, 'error');
      return { success: false, error };
    }
  };

  // ------------------------------------------------------------
  // SETTINGS OPERATIONS (owner only)
  // ------------------------------------------------------------

  /** Merges and saves company/invoice settings. Returns { success } or { success: false, error }. */
  const updateSettings = async (data) => {
    const blocked = writeBlockedReason({ ownerOnly: true });
    if (blocked) {
      showToast(blocked, 'error');
      return { success: false, error: blocked };
    }
    const newSettings = { ...settings, ...data };
    setSettings(newSettings); // optimistic; the live listener confirms or corrects it
    try {
      await setDoc(doc(db, 'tenants', tenantId, 'config', 'settings'), newSettings);
      return { success: true };
    } catch (err) {
      console.error('Error saving settings:', err.code, err.message);
      const error = friendlyError(err, 'save settings');
      showToast(error, 'error');
      return { success: false, error };
    }
  };

  // ------------------------------------------------------------
  // CATEGORY OPERATIONS (owner only)
  // ------------------------------------------------------------

  /** Saves the full categories list. Returns { success } or { success: false, error }. */
  const saveCategories = async (cats) => {
    const blocked = writeBlockedReason({ ownerOnly: true });
    if (blocked) {
      showToast(blocked, 'error');
      return { success: false, error: blocked };
    }
    setCategories(cats); // optimistic; the live listener confirms or corrects it
    try {
      await setDoc(doc(db, 'tenants', tenantId, 'config', 'categories'), { list: cats });
      return { success: true };
    } catch (err) {
      console.error('Error saving categories:', err.code, err.message);
      const error = friendlyError(err, 'save services');
      showToast(error, 'error');
      return { success: false, error };
    }
  };

  /** Adds a new category. Returns the saveCategories() result. */
  const addCategory = (cat) => saveCategories([...categories, { id: genId(), ...cat }]);

  /** Updates fields on an existing category. Returns the saveCategories() result. */
  const updateCategory = (id, data) => saveCategories(categories.map(c => (c.id === id ? { ...c, ...data } : c)));

  /** Removes a category entirely. Returns the saveCategories() result. */
  const deleteCategory = (id) => saveCategories(categories.filter(c => c.id !== id));

  /** Adds one item to a category. Returns the saveCategories() result. */
  const addItemToCat = (catId, item) => saveCategories(categories.map(c => (c.id === catId ? { ...c, items: [...c.items, item] } : c)));

  /** Removes one item from a category. Returns the saveCategories() result. */
  const removeItemFromCat = (catId, item) => saveCategories(categories.map(c => (c.id === catId ? { ...c, items: c.items.filter(i => i !== item) } : c)));

  // ------------------------------------------------------------
  // JOB LOG / FINANCIALS
  // ------------------------------------------------------------

  /**
   * Saves one or more Job Log cells (costs, income, notes).
   * changes: [{ eventId, columnId, value }] — value is a number, text, or null (blank).
   * Batched, so a paste or Excel upload saves all-or-nothing per batch.
   * Returns { success } or { success: false, error }.
   */
  const saveFinancials = async (changes) => {
    const blocked = writeBlockedReason();
    if (blocked) {
      showToast(blocked, 'error');
      return { success: false, error: blocked };
    }
    if (!changes.length) return { success: true };

    const byEvent = {};
    changes.forEach(({ eventId, columnId, value }) => {
      (byEvent[eventId] = byEvent[eventId] || {})[columnId] = value;
    });
    const now = new Date().toISOString();
    try {
      const ids = Object.keys(byEvent);
      for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        ids.slice(i, i + BATCH_LIMIT).forEach(eventId => {
          batch.set(
            doc(db, 'tenants', tenantId, 'financials', eventId),
            { values: byEvent[eventId], updatedAt: now, updatedBy: user.uid },
            { merge: true }, // merge keeps the event's other columns
          );
        });
        await batch.commit();
      }
      return { success: true };
    } catch (err) {
      console.error('Error saving costs:', err.code, err.message);
      const error = friendlyError(err, 'save costs');
      showToast(error, 'error');
      return { success: false, error };
    }
  };

  /** Saves the tenant's Job Log column setup (owner only). Returns { success } or { success: false, error }. */
  const saveJobLogColumns = async (columns) => {
    const blocked = writeBlockedReason({ ownerOnly: true });
    if (blocked) {
      showToast(blocked, 'error');
      return { success: false, error: blocked };
    }
    try {
      await setDoc(doc(db, 'tenants', tenantId, 'config', 'jobLog'), { columns });
      return { success: true };
    } catch (err) {
      console.error('Error saving Job Log columns:', err.code, err.message);
      const error = friendlyError(err, 'save columns');
      showToast(error, 'error');
      return { success: false, error };
    }
  };

  // ------------------------------------------------------------
  // PLATFORM ADMIN (EventScope staff only — firestore.rules enforces it)
  // ------------------------------------------------------------

  /** Live list of every tenant. Returns an unsubscribe function. */
  const subscribeAllTenants = (onChange, onError) => onSnapshot(
    collection(db, 'tenants'),
    (snap) => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    (err) => { console.error('All-tenants listener error:', err.code, err.message); onError?.(err); },
  );

  /** Team size and event count for one tenant (server-side counts — cheap, no documents downloaded) */
  const getTenantCounts = async (id) => {
    const [members, evs] = await Promise.all([
      getCountFromServer(query(collection(db, 'users'), where('tenantId', '==', id))),
      getCountFromServer(collection(db, 'tenants', id, 'events')),
    ]);
    return { members: members.data().count, events: evs.data().count };
  };

  /** Changes a tenant's platform fields (plan / status). Returns { success } or { success: false, error }. */
  const adminUpdateTenant = async (id, patch) => {
    if (!isPlatformAdmin) return { success: false, error: 'Admins only.' };
    try {
      await setDoc(doc(db, 'tenants', id), { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
      return { success: true };
    } catch (err) {
      console.error('Admin update failed:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'update the company') };
    }
  };

  /**
   * IMPORT COMPANY — creates a brand-new company from a backup of an older
   * app (see utils/tenantImport.js), and invites its owners + staff by email.
   * They join with the normal Join screen on their next sign-in.
   *
   * Order matters: events first, then the company record last — so if the
   * connection drops halfway, no half-made company shows up, and running it
   * again simply overwrites the same events.
   * Returns { success, error? }.
   */
  const adminImportCompany = async ({ tenantId: newId, name, plan, backup, owners, staff }) => {
    if (!isPlatformAdmin) return { success: false, error: 'Admins only.' };
    if (!newId || !name || !backup?.ok) return { success: false, error: 'Missing company name or backup.' };
    if (!owners?.length) return { success: false, error: 'Add at least one owner email.' };
    try {
      // 1. Refuse to touch an existing company
      if ((await getDoc(doc(db, 'tenants', newId))).exists()) {
        return { success: false, error: `A company with the id “${newId}” already exists. Pick another id.` };
      }

      // 2. Everyone must be free to join: not in a company, no invite elsewhere
      const people = [...owners.map(e => [e, 'owner']), ...staff.filter(e => !owners.includes(e)).map(e => [e, 'staff'])];
      const busy = [];
      for (const [email] of people) {
        const inCompany = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
        const invite = await getDoc(doc(db, 'invites', email));
        if (!inCompany.empty) busy.push(`${email} (already in a company)`);
        else if (invite.exists() && invite.data().tenantId !== newId) busy.push(`${email} (has an invite to another company)`);
      }
      if (busy.length) return { success: false, error: `Can’t add: ${busy.join(', ')}.` };

      // 3. Events, in batches
      for (let i = 0; i < backup.events.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        backup.events.slice(i, i + BATCH_LIMIT).forEach(e => batch.set(doc(db, 'tenants', newId, 'events', e.id), e.data));
        await batch.commit();
      }

      // 4. Company record + settings + categories + invites, together
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      batch.set(doc(db, 'tenants', newId), {
        name, plan, status: 'active', ownerUid: null, ownerEmail: owners[0],
        createdAt: now, importedAt: now, importedFrom: backup.sourceProject || 'backup',
      });
      batch.set(doc(db, 'tenants', newId, 'config', 'settings'), { ...DEFAULT_SETTINGS, ...backup.settings, companyName: backup.settings.companyName || name });
      batch.set(doc(db, 'tenants', newId, 'config', 'categories'), { list: backup.categories || DEFAULT_CATEGORIES });
      people.forEach(([email, role]) => batch.set(doc(db, 'invites', email), {
        tenantId: newId, role, tenantName: name,
        invitedBy: user.uid, invitedByName: 'EventScope', createdAt: now,
      }));
      await batch.commit();

      // 5. If the admin invited themselves, hand back their invite so the
      //    dialog can open the Join screen once they click Done
      const mine = people.find(([email]) => email === inviteKey(user.email));
      const selfInvite = mine && !membership
        ? { tenantId: newId, role: mine[1], tenantName: name, invitedByName: 'EventScope' }
        : null;
      return { success: true, invited: people.length, selfInvite };
    } catch (err) {
      console.error('Import failed:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'import the company') };
    }
  };

  // ------------------------------------------------------------
  // CONTEXT VALUE
  // ------------------------------------------------------------

  return (
    <Ctx.Provider value={{
      // Auth & account
      user, authLoading, logout,
      tenant, tenantId, tenantStatus, role, isOwner, isPlatformAdmin,
      isSuspended, canEditEvents, canEditSettings,
      createCompany, pendingInvite, acceptPendingInvite, declinePendingInvite, showPendingInvite,
      // Company data
      events, settings, categories, loaded,
      addEvent, updateEvent, deleteEvent,
      updateSettings,
      addCategory, updateCategory, deleteCategory, addItemToCat, removeItemFromCat,
      // Team
      team, invites, inviteTeammate, cancelInvite, removeTeammate,
      // Job Log
      jobLogColumns: activeJobLogColumns, allJobLogColumns: jobLogColumns,
      financials, financialsLoaded, saveFinancials, saveJobLogColumns,
      // Platform admin
      subscribeAllTenants, getTenantCounts, adminUpdateTenant, adminImportCompany,
      // UI
      toast, showToast,
    }}>
      {children}
    </Ctx.Provider>
  );
}

// ============================================================
// EXPORTS
// ============================================================

/** Hook every page uses to read app state and call operations */
// Exported next to the provider on purpose (one import for every page);
// the only cost is a full reload instead of fast-refresh while developing.
// oxlint-disable-next-line react/only-export-components
export const useApp = () => useContext(Ctx);
