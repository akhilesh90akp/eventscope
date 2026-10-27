/**
 * AppContext — Global state and the ONLY place that talks to Firestore
 *
 * Multi-tenant: every company (tenant) has its own data, and each login is
 * linked to exactly one tenant. On sign-in we read users/{uid} to find the
 * tenant, then load only that tenant's data. Firestore layout:
 *
 *   platformAdmins/{uid}                      EventScope staff (added by hand in the console)
 *   users/{uid}                               { tenantId, role: 'owner'|'staff', name, email, joinedAt }
 *   invites/{email}                           pending invite { tenantId, role: 'owner'|'staff', ... }
 *   tenants/{tenantId}                        { name, plan, status, ownerUid, ownerEmail, createdAt, interestedPlan? } — platform-controlled
 *   tenants/{tenantId}/private/contact        owner's backup email + phone (owner + admins only)
 *   tenants/{tenantId}/config/settings        company profile + invoice settings (owner-editable)
 *   tenants/{tenantId}/config/categories      service categories (owner-editable)
 *   tenants/{tenantId}/config/jobLog          Job Log columns (owner-editable)
 *   tenants/{tenantId}/events/{eventId}       one doc per event/draft
 *   tenants/{tenantId}/financials/{eventId}   { values: { [columnId]: number|string|null } } — costs/income/notes
 *   tenants/{tenantId}/purchases/{id}         things bought for the business (owners only, see utils/purchases.js)
 *   tenants/{tenantId}/payments/{id}          plan payments; 'pending' = owner's "I've paid" claim (see utils/billing.js)
 *   tenants/{tenantId}/history/{id}           what EventScope changed for the company (admins only)
 *   platform/billing                          EventScope's UPI ID / payee / QR for the Plan & billing page
 *   tenants/{tenantId}/pushTokens/{tokenId}   { uid, token, device, createdAt } — an owner device for reminders (own only)
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
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, getDoc, getDocs, query, where,
  writeBatch, getCountFromServer, terminate, clearIndexedDbPersistence, collectionGroup,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { DEFAULT_SETTINGS, DEFAULT_CATEGORIES, DEFAULT_JOBLOG_COLUMNS } from '../constants/data';
import { genId, inviteKey } from '../utils/helpers';
import { buildCompanyBackup, backupFileName } from '../utils/companyBackup';
import { markStartup } from '../utils/startupTiming';
import { requestPushToken, dropPushToken, rememberTokenId, savedTokenId, deviceLabel } from '../utils/push';
import { useConfirm } from '../components/useConfirm';
import { accessInfo, todayIST, pilotFields, paidFields, DEFAULT_PILOT, hasFeature, PLAN_INTEREST_KEY, cleanInterest } from '../utils/billing';

// ============================================================
// CONSTANTS
// ============================================================

const Ctx = createContext();

/** Firestore batches cap at 500 writes; stay safely under it */
const BATCH_LIMIT = 450;
/** Returned by writeBlockedReason when the company is read-only (no toast — a pop-up explains) */
export const READ_ONLY_MSG = 'This account is read-only — renew your plan to make changes.';

/** A fresh tab can hit a brief sign-in race on its first read; retry this
 *  many times (with a growing pause) before showing "Couldn't load your account" */
const LOAD_RETRIES = 3;
const RETRY_DELAY_MS = 800;

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

/**
 * Quick-start memory: which company this login belongs to (id, name,
 * status, role). Lets the app open straight away on the next visit instead
 * of waiting for two network round trips behind the Loading screen. The
 * live listeners still run and correct it (e.g. if this person was removed
 * from the company, or it was suspended). Holds no client or money data,
 * and is wiped on Log out.
 */
const BOOT_KEY = 'eventscope-boot';
const readBoot = (uid) => {
  try {
    const b = JSON.parse(localStorage.getItem(BOOT_KEY) || 'null');
    return b && b.uid === uid && b.tenantId ? b : null;
  } catch { return null; }
};
const writeBoot = (patch) => {
  try {
    const prev = JSON.parse(localStorage.getItem(BOOT_KEY) || '{}');
    localStorage.setItem(BOOT_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch { /* storage full / blocked — just start the slow way next time */ }
};
const clearBoot = () => { try { localStorage.removeItem(BOOT_KEY); } catch { /* ignore */ } };

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
  const confirm = useConfirm();   // app-style confirmation pop-ups (components/ConfirmDialog)
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
  const [loadAttempt, setLoadAttempt] = useState(0);        // bumps to re-subscribe after a transient error
  const [loadError, setLoadError] = useState('');           // error code shown small on the error screen
  const [signingOut, setSigningOut] = useState(false);       // shows "Signing out…" while we clean up

  // Company data
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loaded, setLoaded] = useState(false);            // events have arrived at least once
  const [jobLogColumns, setJobLogColumns] = useState(DEFAULT_JOBLOG_COLUMNS);
  const [financials, setFinancials] = useState({});       // { [eventId]: { values, updatedAt, updatedBy } }
  const [financialsLoaded, setFinancialsLoaded] = useState(false);
  const [purchases, setPurchases] = useState([]);         // [{ id, mode, date, name, qty, category, amount, note }] — owners only
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null);  // the owner's "I've paid" claim, waiting for EventScope
  const [payments, setPayments] = useState([]);              // confirmed payments (owners: Plan & billing history)
  const [platformBilling, setPlatformBilling] = useState(null); // { upiId, payeeName, qr } from platform/billing
  const [lockAsked, setLockAsked] = useState(0);             // bump → Layout shows the "plan has ended" pop-up

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
    if (message === READ_ONLY_MSG) return;   // the read-only pop-up already says it
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
      markStartup(u ? 'signin' : 'signedOut');
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /**
   * Signs out AND wipes this browser's offline copy of the company's data,
   * so the next person using a shared computer can't see it. Firestore's
   * cache can only be cleared once the client is shut down, so we reload.
   * Always asks first — every Log out / Sign out button goes through here.
   */
  const logout = async () => {
    if (!(await confirm({ title: 'Log out of EventScope?', message: 'You’ll need to sign in with Google again, and this device’s saved copy of your data will be cleared.', confirmLabel: 'Log out', tone: 'logout' }))) return;
    clearBoot();
    setSigningOut(true);
    // Cap the cleanup so a slow phone never sits on "Signing out" for long
    const giveUp = new Promise(resolve => setTimeout(resolve, 4000));
    try {
      // This device should stop getting the company's reminders
      if (savedTokenId()) await Promise.race([disableReminders(), giveUp]);
      await signOut(auth);
      await Promise.race([(async () => { await terminate(db); await clearIndexedDbPersistence(db); })(), giveUp]);
    } catch (err) {
      console.warn('Sign-out cleanup:', err.message);
    } finally {
      // Back to the home address, then a full reload (fresh, empty client)
      window.location.hash = '#/';
      window.location.reload();
    }
  };

  /** On a load error: retry a few times, then give up and show the error screen */
  const retryOrFail = useCallback((err) => {
    if (loadAttempt < LOAD_RETRIES) {
      setTimeout(() => setLoadAttempt(n => n + 1), RETRY_DELAY_MS * (loadAttempt + 1));
    } else {
      setLoadError(err?.code || err?.message || 'unknown');
      setTenantStatus('error');
    }
  }, [loadAttempt]);

  // New login → start the retry count from zero
  useEffect(() => { setLoadAttempt(0); setLoadError(''); }, [user]);

  // ------------------------------------------------------------
  // DATA LOADING — STEP 1: MEMBERSHIP
  // When the login changes, find which tenant it belongs to. users/{uid}
  // is watched live, so if the owner removes this person they drop out
  // straight away. No users/{uid} but an invite for this Google email?
  // Show it (status 'invited') and let the person Join or Decline.
  // ------------------------------------------------------------

  useEffect(() => {
    setPendingInvite(null);
    // Returning on this device? Open the app right away from the quick-start
    // memory; the listeners below confirm (or correct) it in the background.
    const boot = user ? readBoot(user.uid) : null;
    if (boot) {
      markStartup('company');
      setMembership({ tenantId: boot.tenantId, role: boot.role || 'staff' });
      setTenant(boot.tenant || { id: boot.tenantId });
      setIsPlatformAdmin(!!boot.isPlatformAdmin);
      setTenantStatus('ready');
    } else {
      setMembership(null);
      setTenant(null);
      setIsPlatformAdmin(false);
      setTenantStatus('loading');
    }
    if (!user) return undefined;

    let cancelled = false;

    getDoc(doc(db, 'platformAdmins', user.uid))
      .then(snap => {
        if (cancelled) return;
        setIsPlatformAdmin(snap.exists());
        writeBoot({ isPlatformAdmin: snap.exists() });
      })
      .catch(() => {}); // not an admin (or offline) — the Admin menu simply stays hidden

    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
      if (cancelled) return;
      const profile = snap.exists() ? snap.data() : null;
      if (profile?.tenantId) {
        const role = profile.role || 'staff';
        // Same tenant/role as before → keep the same object (no re-render churn)
        setMembership(m => (m && m.tenantId === profile.tenantId && m.role === role) ? m : { tenantId: profile.tenantId, role });
        const prevBoot = readBoot(user.uid);
        if (!prevBoot || prevBoot.tenantId !== profile.tenantId) clearBoot(); // different login/company: start clean
        writeBoot({ uid: user.uid, tenantId: profile.tenantId, role });
        return;
      }
      // Not (or no longer) in a company — forget the quick-start memory
      clearBoot();
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
      console.error('Error resolving tenant membership:', err.code, err.message, `(attempt ${loadAttempt + 1})`);
      if (!cancelled) retryOrFail(err);
    });

    return () => { cancelled = true; unsubProfile(); };
  }, [user, loadAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

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
        clearBoot();
        setTenantStatus('none');
        return;
      }
      const t = { id: snap.id, ...snap.data() };
      setTenant(t);
      setTenantStatus('ready');
      markStartup('company');
      writeBoot({ tenant: { id: t.id, name: t.name || '', status: t.status || 'active' } });
    }, (err) => {
      logErr('Tenant')(err);
      retryOrFail(err);
    });

    // Events
    const unsubEvents = onSnapshot(collection(db, 'tenants', tenantId, 'events'), (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoaded(true);
      markStartup('events');
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
  }, [tenantId, loadAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------
  // DERIVED PERMISSIONS
  // UI hints only — firestore.rules is what actually enforces these.
  // ------------------------------------------------------------

  const role = membership?.role || null;
  const isOwner = role === 'owner';
  // Plan / pilot / paid-until state (utils/billing.js). Read-only when the
  // company is suspended, or its date + grace days have passed and no
  // "I've paid" claim is waiting — the same rule firestore.rules applies.
  const access = { ...accessInfo(tenant, todayIST(), !!pendingPayment), pendingAmount: pendingPayment?.amount || 0 };
  const isSuspended = !!tenant && access.readOnly;
  const canEditEvents = !!tenantId && !isSuspended;
  const canEditSettings = isOwner && !isSuspended;

  // Payments: everyone sees the pending claim (it keeps the app working);
  // owners also get the confirmed list. Plus EventScope's UPI details.
  useEffect(() => {
    if (!tenantId) { setPendingPayment(null); setPayments([]); return undefined; }
    const logErr = (what) => (err) => console.error(`${what} listener error:`, err.code, err.message);
    const unsubPending = onSnapshot(doc(db, 'tenants', tenantId, 'payments', 'pending'),
      (snap) => setPendingPayment(snap.exists() ? { id: snap.id, ...snap.data() } : null), logErr('Pending payment'));
    const unsubPayments = role === 'owner'
      ? onSnapshot(collection(db, 'tenants', tenantId, 'payments'),
        (snap) => setPayments(snap.docs.filter(d => d.id !== 'pending').map(d => ({ id: d.id, ...d.data() }))), logErr('Payments'))
      : () => {};
    return () => { unsubPending(); unsubPayments(); };
  }, [tenantId, role, loadAttempt]);

  useEffect(() => {
    if (!user) { setPlatformBilling(null); return undefined; }
    return onSnapshot(doc(db, 'platform', 'billing'),
      (snap) => setPlatformBilling(snap.exists() ? snap.data() : {}),
      (err) => { console.error('Platform billing listener error:', err.code, err.message); setPlatformBilling({}); });
  }, [user, loadAttempt]);

  // Purchases — owners only (the rules refuse staff, so staff never listen)
  useEffect(() => {
    if (!tenantId || role !== 'owner') {
      setPurchases([]);
      setPurchasesLoaded(false);
      return undefined;
    }
    return onSnapshot(collection(db, 'tenants', tenantId, 'purchases'), (snap) => {
      setPurchases(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPurchasesLoaded(true);
    }, (err) => {
      console.error('Purchases listener error:', err.code, err.message);
      setPurchasesLoaded(true);
    });
  }, [tenantId, role, loadAttempt]);

  /** Job Log columns the owner hasn't removed (removed ones keep their values) */
  const activeJobLogColumns = jobLogColumns.filter(c => !c.hidden);

  /** Shared guard for writes. Returns an error string, or null if the write may proceed. */
  const writeBlockedReason = ({ ownerOnly = false } = {}) => {
    if (!user) return 'You are signed out — please log in again before saving.';
    if (!tenantId) return 'Your login is not linked to a company yet.';
    if (isSuspended) {
      setLockAsked(n => n + 1);              // Layout explains why and offers to renew
      return READ_ONLY_MSG;
    }
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
    let interestedPlan = '';                       // the plan picked on the website, if any
    try { interestedPlan = cleanInterest(localStorage.getItem(PLAN_INTEREST_KEY)); } catch { /* ignore */ }

    // withPlan=false is the fallback if the live security rules don't know interestedPlan yet
    const writeAll = async (withPlan) => {
      const batch = writeBatch(db);
      batch.set(doc(db, 'tenants', newTenantId), {
        name: companyName,
        ...(withPlan && interestedPlan ? { interestedPlan } : {}),
        ownerUid: user.uid,
        ownerEmail,
        plan: 'trial',
        status: 'active',
        createdAt: now,
        acceptedTermsAt: now,
        // free pilot from today (standard length), auto-suspends when it ends
        ...pilotFields({ start: todayIST(), length: DEFAULT_PILOT.length, unit: DEFAULT_PILOT.unit }),
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
    };

    try {
      try {
        await writeAll(true);
      } catch (first) {
        if (!interestedPlan || first.code !== 'permission-denied') throw first;
        await writeAll(false);
      }
      try { localStorage.removeItem(PLAN_INTEREST_KEY); } catch { /* ignore */ }
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

  /** Invites a teammate by Google email, as 'staff' (default) or 'owner'. Returns { success } or { success: false, error }. */
  const inviteTeammate = async (rawEmail, inviteRole = 'staff') => {
    const blocked = writeBlockedReason({ ownerOnly: true });
    if (blocked) return { success: false, error: blocked };
    if (!['staff', 'owner'].includes(inviteRole)) return { success: false, error: 'Unknown role.' };
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
        role: inviteRole,
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

  /**
   * Makes a staff member an owner (one way — owners can't downgrade each
   * other; EventScope admins can). Returns { success } or { success: false, error }.
   */
  const promoteToOwner = async (uid) => {
    const blocked = writeBlockedReason({ ownerOnly: true });
    if (blocked) return { success: false, error: blocked };
    if (uid === user.uid) return { success: false, error: 'You can’t change your own role.' };
    try {
      await updateDoc(doc(db, 'users', uid), { role: 'owner' });
      return { success: true };
    } catch (err) {
      console.error('Error promoting teammate:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'make them an owner') };
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
  // PURCHASES (owner only)
  // ------------------------------------------------------------

  /** Saves one or more new purchases together (already cleaned by cleanPurchase). */
  const addPurchases = async (list) => {
    const blocked = writeBlockedReason({ ownerOnly: true });
    if (blocked) { showToast(blocked, 'error'); return { success: false, error: blocked }; }
    try {
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      list.forEach((p, i) => batch.set(doc(db, 'tenants', tenantId, 'purchases', genId()), {
        ...p, createdAt: new Date(Date.parse(now) + i).toISOString(), createdBy: user.uid,
      }));
      await batch.commit();
      return { success: true };
    } catch (err) {
      console.error('Error adding purchases:', err.code, err.message);
      const error = friendlyError(err, 'save the purchase');
      showToast(error, 'error');
      return { success: false, error };
    }
  };

  /** Replaces one purchase's fields (keeps createdAt/createdBy). */
  const updatePurchase = async (id, data) => {
    const blocked = writeBlockedReason({ ownerOnly: true });
    if (blocked) { showToast(blocked, 'error'); return { success: false, error: blocked }; }
    try {
      await updateDoc(doc(db, 'tenants', tenantId, 'purchases', id), { ...data, updatedAt: new Date().toISOString() });
      return { success: true };
    } catch (err) {
      console.error('Error updating purchase:', err.code, err.message);
      const error = friendlyError(err, 'save the purchase');
      showToast(error, 'error');
      return { success: false, error };
    }
  };

  const deletePurchase = async (id) => {
    const blocked = writeBlockedReason({ ownerOnly: true });
    if (blocked) { showToast(blocked, 'error'); return { success: false, error: blocked }; }
    try {
      await deleteDoc(doc(db, 'tenants', tenantId, 'purchases', id));
      return { success: true };
    } catch (err) {
      console.error('Error deleting purchase:', err.code, err.message);
      const error = friendlyError(err, 'delete the purchase');
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

    // a money cell typed as a sum ("12000+3500") also keeps that sum in
    // formulas[col]; any other change to the cell clears it
    const byEvent = {};
    const formulasByEvent = {};
    changes.forEach(({ eventId, columnId, value, formula }) => {
      (byEvent[eventId] = byEvent[eventId] || {})[columnId] = value;
      if (formula !== undefined) (formulasByEvent[eventId] = formulasByEvent[eventId] || {})[columnId] = formula || null;
    });
    const now = new Date().toISOString();
    try {
      const ids = Object.keys(byEvent);
      for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        ids.slice(i, i + BATCH_LIMIT).forEach(eventId => {
          batch.set(
            doc(db, 'tenants', tenantId, 'financials', eventId),
            { values: byEvent[eventId], ...(formulasByEvent[eventId] ? { formulas: formulasByEvent[eventId] } : {}), updatedAt: now, updatedBy: user.uid },
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
  /**
   * Owners: turn event-reminder notifications on for THIS device. Gets the
   * device's push token (must be called from a tap) and saves it under the
   * company, where the daily reminder script finds it.
   */
  const enableReminders = async () => {
    if (!isOwner || !tenantId || !user) return { success: false, error: 'Only owners get reminders.' };
    try {
      const { id, token } = await requestPushToken();
      await setDoc(doc(db, 'tenants', tenantId, 'pushTokens', id), {
        uid: user.uid, token, device: deviceLabel(), createdAt: new Date().toISOString(),
      });
      rememberTokenId(id);
      return { success: true };
    } catch (err) {
      console.error('Enable reminders failed:', err.code || '', err.message);
      return { success: false, error: err.code ? friendlyError(err, 'turn on reminders') : err.message };
    }
  };

  /** Turns reminders off for THIS device (removes its saved token) */
  const disableReminders = async () => {
    const id = savedTokenId();
    try {
      if (id && tenantId) await deleteDoc(doc(db, 'tenants', tenantId, 'pushTokens', id));
      await dropPushToken();
      rememberTokenId(null);
      return { success: true };
    } catch (err) {
      console.error('Disable reminders failed:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'turn off reminders') };
    }
  };

  /**
   * Owner's "Download full backup": reads everything for this company fresh
   * from the server (events, settings, services, Job Log, team, contact) and
   * saves it as one .json file — the same format as the daily Drive backup,
   * so Admin → Import company can restore it. Works while suspended too.
   */
  const downloadCompanyBackup = async () => {
    if (!isOwner || !tenantId) return { success: false, error: 'Only owners can download a backup.' };
    try {
      const sub = async (name) => (await getDocs(collection(db, 'tenants', tenantId, name))).docs.map(d => ({ id: d.id, data: d.data() }));
      const [tSnap, evs, cfg, fin, priv, pur, mem, inv] = await Promise.all([
        getDoc(doc(db, 'tenants', tenantId)),
        sub('events'), sub('config'), sub('financials'), sub('private'), sub('purchases'),
        getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId))),
        getDocs(query(collection(db, 'invites'), where('tenantId', '==', tenantId))),
      ]);
      const backup = buildCompanyBackup({
        tenantId,
        tenant: tSnap.exists() ? tSnap.data() : {},
        events: evs, config: cfg, financials: fin, private: priv, purchases: pur,
        members: mem.docs.map(d => ({ uid: d.id, ...d.data() })),
        invites: inv.docs.map(d => ({ email: d.id, ...d.data() })),
        sourceProject: db.app?.options?.projectId || '',
      });
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: backupFileName(settings.companyName || tenant?.name) });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return { success: true, counts: { events: evs.length, costs: fin.length } };
    } catch (err) {
      console.error('Backup download failed:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'make the backup') };
    }
  };

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

  // ------------------------------------------------------------
  // BILLING — owner's "I've paid" and EventScope's actions
  // ------------------------------------------------------------

  /**
   * Owner tells EventScope they've paid (UPI reference). Works while
   * read-only — it reopens editing until EventScope confirms or rejects.
   */
  const submitPaymentClaim = async ({ plan, cycle, amount, ref, start, end }) => {
    if (!user || !tenantId) return { success: false, error: 'Please sign in again.' };
    if (!isOwner) return { success: false, error: 'Only the account owner can do this.' };
    try {
      await setDoc(doc(db, 'tenants', tenantId, 'payments', 'pending'), {
        plan, cycle, amount: Number(amount) || 0, ref: String(ref).replace(/\s+/g, ''), start, end,
        createdAt: new Date().toISOString(), createdBy: user.uid, createdByName: user.displayName || user.email || '',
      });
      return { success: true };
    } catch (err) {
      console.error('Payment claim failed:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'send the payment details') };
    }
  };

  /** Writes a history line for a company (in the same batch as the change) */
  const addHistory = (batch, tenantIdArg, action, detail = '') => {
    batch.set(doc(collection(db, 'tenants', tenantIdArg, 'history')), {
      at: new Date().toISOString(), by: user?.email || '', action, detail,
    });
  };

  /**
   * Admin: change a company (pilot dates, plan, suspend, reactivate…) and
   * record it in its history. Returns { success, error? }.
   */
  const adminTenantAction = async (id, patch, action, detail = '') => {
    if (!isPlatformAdmin) return { success: false, error: 'Admins only.' };
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'tenants', id), { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
      addHistory(batch, id, action, detail);
      await batch.commit();
      return { success: true };
    } catch (err) {
      console.error('Admin action failed:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'update the company') };
    }
  };

  /** Admin: set a company's pilot (start, length in days/months, auto-suspend) */
  const adminSetPilot = (t, { start, length, unit, autoSuspend, extended }) =>
    adminTenantAction(t.id, { ...pilotFields({ start, length, unit, autoSuspend, extended }), status: 'active' },
      extended ? 'Pilot extended' : 'Pilot set', `${length} ${unit} from ${start}${autoSuspend ? '' : ' · auto-suspend off'}`);

  /**
   * Admin: record a payment (confirming the owner's claim, or one received
   * another way). Saves it, moves the paid-until date and switches editing
   * back on. Returns { success, error? }.
   */
  const adminRecordPayment = async (t, { plan, cycle, amount, ref, paidOn, start, end, note = '' }, fromClaim = false) => {
    if (!isPlatformAdmin) return { success: false, error: 'Admins only.' };
    try {
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'tenants', t.id, 'payments')), {
        plan, cycle, amount: Number(amount) || 0, ref: ref || '', paidOn, start, end, note,
        tenantId: t.id, status: 'confirmed', confirmedAt: now, confirmedBy: user.email || '',
      });
      if (fromClaim) batch.delete(doc(db, 'tenants', t.id, 'payments', 'pending'));
      batch.set(doc(db, 'tenants', t.id), {
        ...paidFields({ plan, cycle, until: end, autoSuspend: t.autoSuspend !== false }),
        status: 'active', reactivatedAt: t.status === 'suspended' || accessInfo(t).readOnly ? now : (t.reactivatedAt || null), updatedAt: now,
      }, { merge: true });
      addHistory(batch, t.id, fromClaim ? 'Payment confirmed' : 'Payment recorded', `₹${Number(amount).toLocaleString('en-IN')} · ${plan} ${cycle} · until ${end}${ref ? ` · ref ${ref}` : ''}`);
      await batch.commit();
      return { success: true };
    } catch (err) {
      console.error('Record payment failed:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'save the payment') };
    }
  };

  /** Admin: the owner's claim was wrong — remove it (the date rule applies again) */
  const adminRejectClaim = async (t, reason = '') => {
    if (!isPlatformAdmin) return { success: false, error: 'Admins only.' };
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'tenants', t.id, 'payments', 'pending'));
      addHistory(batch, t.id, 'Payment claim rejected', reason);
      await batch.commit();
      return { success: true };
    } catch (err) {
      console.error('Reject claim failed:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'reject the claim') };
    }
  };

  /** Admin: every company's payments (incl. pending claims), live. Returns an unsubscribe function. */
  const subscribeAllPayments = (onChange) => onSnapshot(collectionGroup(db, 'payments'),
    (snap) => onChange(snap.docs.map(d => ({ id: d.id, tenantId: d.ref.parent.parent.id, ...d.data() }))),
    (err) => { console.error('All payments listener error:', err.code, err.message); onChange([]); });

  /** Admin: one company's history, newest first */
  const getTenantHistory = async (id) => {
    const snap = await getDocs(collection(db, 'tenants', id, 'history'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  };

  /** Admin: EventScope's UPI ID / payee name / QR image */
  const savePlatformBilling = async (data) => {
    if (!isPlatformAdmin) return { success: false, error: 'Admins only.' };
    try {
      await setDoc(doc(db, 'platform', 'billing'), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
      return { success: true };
    } catch (err) {
      console.error('Save payment settings failed:', err.code, err.message);
      return { success: false, error: friendlyError(err, 'save the payment settings') };
    }
  };

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

  /** Live members + pending invites of one company (Admin → Team). Returns an unsubscribe function. */
  const subscribeTenantTeam = (id, onChange) => {
    let members = null;
    let pending = null;
    const emit = () => { if (members && pending) onChange({ members, invites: pending }); };
    const logErr = (what) => (err) => console.error(`Admin ${what} listener error:`, err.code, err.message);
    const unsubM = onSnapshot(query(collection(db, 'users'), where('tenantId', '==', id)),
      (snap) => { members = snap.docs.map(d => ({ uid: d.id, ...d.data() })); emit(); }, logErr('team'));
    const unsubI = onSnapshot(query(collection(db, 'invites'), where('tenantId', '==', id)),
      (snap) => { pending = snap.docs.map(d => ({ email: d.id, ...d.data() })); emit(); }, logErr('invites'));
    return () => { unsubM(); unsubI(); };
  };

  /** Admin: change anyone's role, remove anyone, or cancel any invite (support cases). Returns { success, error? }. */
  const adminTeamAction = async (action, target) => {
    if (!isPlatformAdmin) return { success: false, error: 'Admins only.' };
    try {
      if (action === 'setRole') await updateDoc(doc(db, 'users', target.uid), { role: target.role });
      else if (action === 'remove') await deleteDoc(doc(db, 'users', target.uid));
      else if (action === 'cancelInvite') await deleteDoc(doc(db, 'invites', target.email));
      else return { success: false, error: 'Unknown action.' };
      return { success: true };
    } catch (err) {
      console.error('Admin team action failed:', action, err.code, err.message);
      return { success: false, error: friendlyError(err, 'update the team') };
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

      // 3. Events and Job Log costs (full EventScope backups), in batches
      const rows = [
        ...backup.events.map(e => [doc(db, 'tenants', newId, 'events', e.id), e.data]),
        ...(backup.financials || []).map(f => [doc(db, 'tenants', newId, 'financials', f.id), f.data]),
        ...(backup.purchases || []).map(p => [doc(db, 'tenants', newId, 'purchases', p.id), p.data]),
      ];
      for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        rows.slice(i, i + BATCH_LIMIT).forEach(([ref, data]) => batch.set(ref, data));
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
      if (backup.jobLogColumns) batch.set(doc(db, 'tenants', newId, 'config', 'jobLog'), { columns: backup.jobLogColumns });
      if (backup.contact) batch.set(doc(db, 'tenants', newId, 'private', 'contact'), backup.contact);
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
      tenant, tenantId, tenantStatus, loadError, signingOut, role, isOwner, isPlatformAdmin,
      isSuspended, canEditEvents, canEditSettings,
      // Plan & billing
      access, pendingPayment, payments, platformBilling, submitPaymentClaim, lockAsked,
      askUnlock: () => setLockAsked(n => n + 1),
      canUse: (feature) => hasFeature(tenant?.plan, feature),
      createCompany, pendingInvite, acceptPendingInvite, declinePendingInvite, showPendingInvite,
      // Company data
      events, settings, categories, loaded,
      addEvent, updateEvent, deleteEvent,
      updateSettings,
      addCategory, updateCategory, deleteCategory, addItemToCat, removeItemFromCat,
      // Team
      team, invites, inviteTeammate, cancelInvite, removeTeammate, promoteToOwner,
      // Job Log
      jobLogColumns: activeJobLogColumns, allJobLogColumns: jobLogColumns,
      financials, financialsLoaded, saveFinancials, saveJobLogColumns,
      // Purchases (owner only)
      purchases, purchasesLoaded, addPurchases, updatePurchase, deletePurchase,
      // Backup
      downloadCompanyBackup,
      // Reminders (push notifications)
      enableReminders, disableReminders,
      // Platform admin
      subscribeAllTenants, getTenantCounts, adminUpdateTenant, adminImportCompany,
      subscribeTenantTeam, adminTeamAction,
      adminTenantAction, adminSetPilot, adminRecordPayment, adminRejectClaim, subscribeAllPayments,
      getTenantHistory, savePlatformBilling,
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
