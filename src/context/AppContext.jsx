/**
 * AppContext — Global state with Firebase Firestore sync
 *
 * All data is stored in Firestore under the user's UID, at:
 *   users/{uid}/events/{eventId}     - one doc per event/draft
 *   users/{uid}/config/settings      - invoice settings singleton
 *   users/{uid}/config/categories    - item categories singleton
 *
 * Every write operation below returns a { success, error? } result instead
 * of firing-and-forgetting — callers (pages) MUST check this result before
 * navigating away or telling the user it worked. See CODE_STRUCTURE.md §3.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { DEFAULT_SETTINGS, DEFAULT_CATEGORIES } from '../constants/data';
import { genId } from '../utils/helpers';

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
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loaded, setLoaded] = useState(false);
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

  // Load data from Firestore when user logs in
  useEffect(() => {
    if (!user) {
      setEvents([]);
      setSettings(DEFAULT_SETTINGS);
      setCategories(DEFAULT_CATEGORIES);
      setLoaded(false);
      return;
    }

    console.log('User logged in:', user.email, user.uid);

    // Real-time listener for events
    const eventsRef = collection(db, 'users', user.uid, 'events');
    const unsubEvents = onSnapshot(eventsRef, (snapshot) => {
      const evs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log('Events loaded from Firestore:', evs.length);
      setEvents(evs);
      setLoaded(true);
    }, (err) => {
      console.error('Firestore events listener error:', err);
      setLoaded(true);
    });

    // Load settings and categories (one-time read)
    const loadConfig = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'users', user.uid, 'config', 'settings'));
        if (settingsDoc.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...settingsDoc.data() });
        }
        const catsDoc = await getDoc(doc(db, 'users', user.uid, 'config', 'categories'));
        if (catsDoc.exists()) {
          setCategories(catsDoc.data().list || DEFAULT_CATEGORIES);
        }
      } catch (err) {
        console.error('Error loading config:', err);
      }
    };
    loadConfig();

    // Cleanup: unsubscribe from events listener
    return () => unsubEvents();
  }, [user]);

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
    if (!user) {
      const error = 'You are signed out — please log in again before saving.';
      console.error('addEvent: no authenticated user');
      showToast(error, 'error');
      return { success: false, error };
    }
    const id = genId();
    const ev = { ...data, status: 'draft', createdAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'users', user.uid, 'events', id), ev);
      console.log('Event saved to Firestore:', id);
      return { success: true, id, event: { id, ...ev } };
    } catch (err) {
      // Common causes: Firestore security rules rejecting the write
      // (err.code === 'permission-denied'), or no network connection.
      console.error('Error adding event:', err.code, err.message);
      const friendly = err.code === 'permission-denied'
        ? 'Save blocked by Firestore security rules — check your rules allow writes to users/{uid}/events.'
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
    if (!user) {
      const error = 'You are signed out — please log in again before saving.';
      console.error('updateEvent: no authenticated user');
      return { success: false, error };
    }
    try {
      const evRef = doc(db, 'users', user.uid, 'events', id);
      const payload = touch ? { ...data, updatedAt: new Date().toISOString() } : data;
      await setDoc(evRef, payload, { merge: true });
      return { success: true };
    } catch (err) {
      console.error('Error updating event:', err.code, err.message);
      const friendly = err.code === 'permission-denied'
        ? 'Save blocked by Firestore security rules — check your rules allow writes to users/{uid}/events.'
        : err.message;
      return { success: false, error: friendly };
    }
  };

  /** Deletes an event by id. Returns { success } or { success: false, error }. */
  const deleteEvent = async (id) => {
    if (!user) return { success: false, error: 'You are signed out.' };
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'events', id));
      return { success: true };
    } catch (err) {
      console.error('Error deleting event:', err.code, err.message);
      showToast('Failed to delete: ' + err.message, 'error');
      return { success: false, error: err.message };
    }
  };

  // ============================================================
  // SETTINGS OPERATIONS
  // ============================================================

  /** Merges and persists invoice settings. Returns { success } or { success: false, error }. */
  const updateSettings = async (data) => {
    if (!user) return { success: false, error: 'You are signed out.' };
    const newSettings = { ...settings, ...data };
    setSettings(newSettings); // optimistic local update
    try {
      await setDoc(doc(db, 'users', user.uid, 'config', 'settings'), newSettings);
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
    if (!user) return { success: false, error: 'You are signed out.' };
    setCategories(cats); // optimistic local update
    try {
      await setDoc(doc(db, 'users', user.uid, 'config', 'categories'), { list: cats });
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
