/**
 * Firebase Configuration & Initialization
 *
 * Auth persistence: browserLocalPersistence (localStorage-based, works on all platforms)
 * Firestore: persistent local cache for offline support
 *
 * NOTE: whether reads/writes to Firestore succeed is controlled by the
 * Firestore Security Rules configured in the Firebase console for this
 * project — NOT by anything in this file. See firestore.rules at the repo
 * root for the rules this app expects, and CODE_STRUCTURE.md §7.
 */

// ============================================================
// IMPORTS
// ============================================================
import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from 'firebase/firestore';

// ============================================================
// CONFIG
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDtHNsr6PsItMwzAbEM1bBulqTAYWqa888",
  authDomain: "eventscope-app.firebaseapp.com",
  projectId: "eventscope-app",
  storageBucket: "eventscope-app.firebasestorage.app",
  messagingSenderId: "688826399809",
  appId: "1:688826399809:web:7324299edd89b262a19ac0"
};

const app = initializeApp(firebaseConfig);

// ============================================================
// AUTH
// ============================================================

// Auth: use getAuth (universally compatible, no IndexedDB dependency)
// Then set persistence to localStorage (works on all Android browsers/PWAs)
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Auth persistence setup failed:', err.code);
});

// ============================================================
// FIRESTORE
// ============================================================

// Firestore: try persistent cache, fallback to default if not supported
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (e) {
  // Already initialized or persistence not supported on this device
  console.warn('Firestore persistent cache unavailable, using default:', e.message);
  db = getFirestore(app);
}

// ============================================================
// LOCAL EMULATOR (development/testing only)
//
// Set VITE_USE_EMULATOR=true (e.g. in .env.local, which is git-ignored) to
// point the app at the Firebase Emulator Suite on this machine instead of
// the real project. Never set in production builds.
// ============================================================

if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  console.warn('Using Firebase emulators (VITE_USE_EMULATOR=true)');
}

// ============================================================
// EXPORTS
// ============================================================

export { db };
export default app;
