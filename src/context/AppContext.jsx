/**
 * AppContext — Global state with Firebase Firestore sync
 *
 * Multi-tenant: every company (tenant) has its own data, and each login
 * is linked to exactly one tenant. On sign-in we read users/{uid} to find
 * the tenant, then load only that tenant's data:
 *   users/{uid}                              - { tenantId, role: 'owner'|'staff', name, email }
 *   tenants/{tenantId}                       - { name, plan, status, ownerUid, createdAt } (platform-controlled)
 *   tenants/{tenantId}/config/settings       - company profile + invoice settings (owner-editable)
 *   tenants/{tenantId}/config/categories     - service categories (owner-editable)
 *   tenants/{tenantId}/events/{eventId}      - one doc per event/draft
 *   tenants/{tenantId}/config/jobLog         - Job Log cost/income columns (owner-editable)
 *   tenants/{tenantId}/financials/{eventId}  - { values: { [columnId]: number|null } } costs/income per event
 *   platformAdmins/{uid}                     - EventScope staff
 *   invites/{email}                          - pending teammate invite { tenantId, role, ... }
 * Firestore rules (firestore.rules) enforce the same boundaries server-side.
 *
 * Every write operation below returns a { success, error? } result instead
 * of firing-and-forgetting — callers (pages) MUST check this result before
 * navigating away or telling the user it worked. See CODE_STRUCTURE.md §3.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDoc, query, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { DEFAULT_SETTINGS, DEFAULT_CATEGORIES, DEFAULT_JOBLOG_COLUMNS } from '../constants/data';
import { genId } from '../utils/helpers';

// ============================================================
// HELPERS — INVITES
// ============================================================

/** Invites are keyed by the invitee's Google email, lower-cased. */
export const inviteKey = (email) => (email || '').trim().toLowerCase();

/**
 * If an invite exists for this user's Google email, join that tenant:
 * create users/{uid} and delete the invite in one atomic batch.
 * firestore.rules only allows this when the invite matches the signed-in,
 * Google-verified email. Returns true if the user joined a tenant.
 */
async function acceptInvite(user) {
  if (!user?.email) return false;
  const inviteRef = doc(db, 'invites', inviteKey(user.email));
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) return false;
  const invite = inviteSnap.data();
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
  return true;
}

// ============================================================
// CONTEXT
// ============================================================

const Ctx = createContext();

export function AppProvider({ children }) {
  // ============================================================
  // STATE
  // ============================================================
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Tenant membership, resolved from users/{uid} after sign-in.
  // tenantStatus: 'loading' | 'ready' | 'none' (signed in but not in any company) | 'error'
  const [membership, setMembership] = useState(null); // { tenantId, role }
  const [tenant, setTenant] = useState(null);         // tenants/{tenantId} doc
  const [tenantStatus, setTenantStatus] = useState('loading');
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loaded, setLoaded] = useState(false);
  const [jobLogColumns, setJobLogColumns] = useState(DEFAULT_JOBLOG_COLUMNS);
  const [financials, setFinancials] = useState({});      // { [eventId]: { values, updatedAt, updatedBy } }
  const [financialsLoaded, setFinancialsLoaded] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success', visible: false });
  const toastTimer = useRef(null);

  /** Show a toast message that auto-dismisses after 3 seconds */
  const showToast = useCallback((message, type = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type, visible: true });
    toastTimer.current = setTimeout(() => {
      setToast(t => ({ ...t, visible: false }));
      // Clear message after fade-out animation
      setTimeout(() => setToast({ message: '', type: 'success', visible: false }), 300);
    }, 3000);
  }, []);

  // ============================================================
  // AUTH STATE
  // ============================================================

  // Listen for auth state changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  // ============================================================
  // DATA LOADING (runs whenever the logged-in user changes)
  // ============================================================

  // Step 1: when the login changes, find which tenant it belongs to.
  // users/{uid} is watched live, so if the owner removes this person they
  // drop to the "not part of a company" screen straight away.
  // If there's no users/{uid} yet but an invite exists for this Google
  // email, accept it: create the membership and delete the invite together.
  useEffect(() => {
    setMembership(null);
    setTenant(null);
    setIsPlatformAdmin(false);
    if (!user) {
      setTenantStatus('loading');
      return;
    }
    setTenantStatus('loading');
    let cancelled = false;
    let accepting = false;

    getDoc(doc(db, 'platformAdmins', user.uid))
      .then(snap => { if (!cancelled) setIsPlatformAdmin(snap.exists()); })
      .catch(() => {});

    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
      if (cancelled) return;
      const profile = snap.exists() ? snap.data() : null;
      if (profile?.tenantId) {
        setMembership({ tenantId: profile.tenantId, role: profile.role || 'staff' });
        return;
      }
      setMembership(null);
      setTenant(null);
      if (accepting) return;
      accepting = true;
      try {
        const joined = await acceptInvite(user);
        if (!joined && !cancelled) setTenantStatus('none');
        // if joined, the users/{uid} listener fires again with the new membership
      } catch (err) {
        console.error('Error accepting invite:', err.code, err.message);
        if (!cancelled) setTenantStatus('none');
      } finally {
        accepting = false;
      }
    }, (err) => {
      console.error('Error resolving tenant membership:', err.code, err.message);
      if (!cancelled) setTenantStatus('error');
    });

    return () => { cancelled = true; unsubProfile(); };
  }, [user]);

  // Step 2: once we know the tenant, load its data (and keep it live).
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
      return;
    }

    // Costs/income per event (Job Log + Costs section) — live, so edits in
    // the Job Log tab show up instantly in the main app tab and vice versa
    const unsubFin = onSnapshot(collection(db, 'tenants', tenantId, 'financials'), (snap) => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      setFinancials(map);
      setFinancialsLoaded(true);
    }, (err) => {
      console.error('Financials listener error:', err.code, err.message);
      setFinancialsLoaded(true);
    });

    // Job Log column setup — live too, so a column rename shows everywhere
    const unsubCols = onSnapshot(doc(db, 'tenants', tenantId, 'config', 'jobLog'), (snap) => {
      const cols = snap.exists() ? snap.data().columns : null;
      setJobLogColumns(Array.isArray(cols) && cols.length ? cols : DEFAULT_JOBLOG_COLUMNS);
    }, (err) => console.error('Job Log columns listener error:', err.code, err.message));

    // Tenant doc (plan/status) — live, so a suspension shows up immediately
    const unsubTenant = onSnapshot(doc(db, 'tenants', tenantId), (snap) => {
      if (!snap.exists()) {
        console.error('Tenant doc missing for', tenantId);
        setTenantStatus('none');
        return;
      }
      setTenant({ id: snap.id, ...snap.data() });
      setTenantStatus('ready');
    }, (err) => {
      console.error('Tenant listener error:', err.code, err.message);
      setTenantStatus('error');
    });

    // Real-time listener for events
    const eventsRef = collection(db, 'tenants', tenantId, 'events');
    const unsubEvents = onSnapshot(eventsRef, (snapshot) => {
      const evs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setEvents(evs);
      setLoaded(true);
    }, (err) => {
      console.error('Firestore events listener error:', err);
      setLoaded(true);
    });

    // Load settings and categories (one-time read)
    const loadConfig = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'tenants', tenantId, 'config', 'settings'));
        setSettings(settingsDoc.exists() ? { ...DEFAULT_SETTINGS, ...settingsDoc.data() } : DEFAULT_SETTINGS);
        const catsDoc = await getDoc(doc(db, 'tenants', tenantId, 'config', 'categories'));
        setCategories(catsDoc.exists() ? (catsDoc.data().list || DEFAULT_CATEGORIES) : DEFAULT_CATEGORIES);
      } catch (err) {
        console.error('Error loading config:', err);
      }
    };
    loadConfig();

    // Cleanup: unsubscribe from listeners
    return () => { unsubTenant(); unsubEvents(); unsubFin(); unsubCols(); };
  }, [tenantId]);

  // ============================================================
  // DERIVED PERMISSIONS
  // (UI hints only — firestore.rules is what actually enforces these)
  // ============================================================
  const role = membership?.role || null;
  const isOwner = role === 'owner';
  const isSuspended = tenant?.status === 'suspended';
  const canEditEvents = !!tenantId && !isSuspended;
  const canEditSettings = isOwner && !isSuspended;

  // Columns the owner hasn't removed (removed ones keep their values, hidden)
  const activeJobLogColumns = jobLogColumns.filter(c => !c.hidden);

  /** Shared guard for writes. Returns an error string, or null if the write may proceed. */
  const writeBlockedReason = ({ ownerOnly = false } = {}) => {
    if (!user) return 'You are signed out — please log in again before saving.';
    if (!tenantId) return 'Your login is not linked to a company yet.';
    if (isSuspended) return 'This account is suspended — changes are disabled. Please contact EventScope support.';
    if (ownerOnly && !isOwner) return 'Only the account owner can change settings.';
    return null;
  };

  // ============================================================
  // TEAM (owner only): members + pending invites, kept live
  // ============================================================
  const [team, setTeam] = useState([]);
  const [invites, setInvites] = useState([]);

  useEffect(() => {
    if (!tenantId || !isOwner) {
      setTeam([]);
      setInvites([]);
      return;
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
      const error = err.code === 'permission-denied'
        ? 'That email already has a pending invite to another company, or you don’t have permission.'
        : err.message;
      return { success: false, error };
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
      return { success: false, error: err.message };
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
      return { success: false, error: err.message };
    }
  };

  // ============================================================
  // EVENT OPERATIONS (CRUD)
  //
  // Every function here returns { success, error? } (and `id`/`event` on
  // success where relevant) instead of failing silently. Pages that call
  // these MUST await the result and branch on `success` before showing a
  // toast or navigating — never assume the write worked. See bug notes in
  // CODE_STRUCTURE.md §3.
  // ============================================================

  /** Creates a new event/draft in Firestore. Returns { success, id, event } or { success: false, error }. */
  const addEvent = async (data) => {
    const blocked = writeBlockedReason();
    if (blocked) {
      console.error('addEvent blocked:', blocked);
      showToast(blocked, 'error');
      return { success: false, error: blocked };
    }
    const id = genId();
    const ev = { ...data, status: 'draft', createdAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'tenants', tenantId, 'events', id), ev);
      console.log('Event saved to Firestore:', id);
      return { success: true, id, event: { id, ...ev } };
    } catch (err) {
      // Common causes: Firestore security rules rejecting the write
      // (err.code === 'permission-denied'), or no network connection.
      console.error('Error adding event:', err.code, err.message);
      const friendly = err.code === 'permission-denied'
        ? 'Save blocked by Firestore security rules — check your rules allow writes to tenants/{tenantId}/events.'
        : err.message;
      return { success: false, error: friendly };
    }
  };

  /**
   * Updates an existing event by id. Returns { success } or { success: false, error }.
   * Pass { touch: false } for internal bookkeeping writes (e.g. recording
   * that a sync completed) that shouldn't bump `updatedAt` — otherwise the
   * bookkeeping write would itself look like a fresh edit and immediately
   * re-flag the event as changed to anything comparing against `updatedAt`.
   */
  const updateEvent = async (id, data, { touch = true } = {}) => {
    const blocked = writeBlockedReason();
    if (blocked) {
      console.error('updateEvent blocked:', blocked);
      return { success: false, error: blocked };
    }
    try {
      const evRef = doc(db, 'tenants', tenantId, 'events', id);
      const payload = touch ? { ...data, updatedAt: new Date().toISOString() } : data;
      await setDoc(evRef, payload, { merge: true });
      return { success: true };
    } catch (err) {
      console.error('Error updating event:', err.code, err.message);
      const friendly = err.code === 'permission-denied'
        ? 'Save blocked by Firestore security rules — check your rules allow writes to tenants/{tenantId}/events.'
        : err.message;
      return { success: false, error: friendly };
    }
  };

  /** Deletes an event by id. Returns { success } or { success: false, error }. */
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
      showToast('Failed to delete: ' + err.message, 'error');
      return { success: false, error: err.message };
    }
  };

  // ============================================================
  // JOB LOG / FINANCIALS
  // ============================================================

  /**
   * Saves one or more cost/income cells.
   * changes: [{ eventId, columnId, value }] — value is a number or null (blank).
   * Uses a batch so a paste or Excel upload saves all-or-nothing.
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
      // Firestore batches cap at 500 writes
      for (let i = 0; i < ids.length; i += 450) {
        const batch = writeBatch(db);
        ids.slice(i, i + 450).forEach(eventId => {
          batch.set(doc(db, 'tenants', tenantId, 'financials', eventId),
            { values: byEvent[eventId], updatedAt: now, updatedBy: user.uid },
            { merge: true });
        });
        await batch.commit();
      }
      return { success: true };
    } catch (err) {
      console.error('Error saving costs:', err.code, err.message);
      showToast('Failed to save costs: ' + err.message, 'error');
      return { success: false, error: err.message };
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
      showToast('Failed to save columns: ' + err.message, 'error');
      return { success: false, error: err.message };
    }
  };

  // ============================================================
  // SETTINGS OPERATIONS
  // ============================================================

  /** Merges and persists invoice settings. Returns { success } or { success: false, error }. */
  const updateSettings = async (data) => {
    const blocked = writeBlockedReason({ ownerOnly: true });
    if (blocked) {
      showToast(blocked, 'error');
      return { success: false, error: blocked };
    }
    const newSettings = { ...settings, ...data };
    setSettings(newSettings); // optimistic local update
    try {
      await setDoc(doc(db, 'tenants', tenantId, 'config', 'settings'), newSettings);
      return { success: true };
    } catch (err) {
      console.error('Error saving settings:', err.code, err.message);
      showToast('Failed to save settings: ' + err.message, 'error');
      return { success: false, error: err.message };
    }
  };

  // ============================================================
  // CATEGORY OPERATIONS
  // ============================================================

  /** Persists the full categories list. Returns { success } or { success: false, error }. */
  const saveCategories = async (cats) => {
    const blocked = writeBlockedReason({ ownerOnly: true });
    if (blocked) {
      showToast(blocked, 'error');
      return { success: false, error: blocked };
    }
    setCategories(cats); // optimistic local update
    try {
      await setDoc(doc(db, 'tenants', tenantId, 'config', 'categories'), { list: cats });
      return { success: true };
    } catch (err) {
      console.error('Error saving categories:', err.code, err.message);
      showToast('Failed to save categories: ' + err.message, 'error');
      return { success: false, error: err.message };
    }
  };

  /** Adds a new category. Returns the saveCategories() result. */
  const addCategory = (cat) => {
    const updated = [...categories, { id: genId(), ...cat }];
    return saveCategories(updated);
  };

  /** Updates fields on an existing category. Returns the saveCategories() result. */
  const updateCategory = (id, data) => {
    const updated = categories.map(c => c.id === id ? { ...c, ...data } : c);
    return saveCategories(updated);
  };

  /** Removes a category entirely. Returns the saveCategories() result. */
  const deleteCategory = (id) => {
    const updated = categories.filter(c => c.id !== id);
    return saveCategories(updated);
  };

  /** Adds one item to a category's item list. Returns the saveCategories() result. */
  const addItemToCat = (catId, item) => {
    const updated = categories.map(c => c.id === catId ? { ...c, items: [...c.items, item] } : c);
    return saveCategories(updated);
  };

  /** Removes one item from a category's item list. Returns the saveCategories() result. */
  const removeItemFromCat = (catId, item) => {
    const updated = categories.map(c => c.id === catId ? { ...c, items: c.items.filter(i => i !== item) } : c);
    return saveCategories(updated);
  };

  // ============================================================
  // CONTEXT VALUE
  // ============================================================

  return (
    <Ctx.Provider value={{
      user, authLoading, logout,
      tenant, tenantId, tenantStatus, role, isOwner, isPlatformAdmin,
      isSuspended, canEditEvents, canEditSettings,
      team, invites, inviteTeammate, cancelInvite, removeTeammate,
      jobLogColumns: activeJobLogColumns, allJobLogColumns: jobLogColumns,
      financials, financialsLoaded, saveFinancials, saveJobLogColumns,
      events, settings, categories, loaded,
      addEvent, updateEvent, deleteEvent,
      updateSettings,
      addCategory, updateCategory, deleteCategory,
      addItemToCat, removeItemFromCat,
      toast, showToast,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);
