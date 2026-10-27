/**
 * Main Entry Point - Application bootstrap
 *
 * Mounts the React application to the DOM root element.
 * Wraps the app in StrictMode for development warnings
 * and ErrorBoundary to prevent blank white screens on crashes, and
 * ConfirmProvider for the app's own confirmation pop-ups (useConfirm).
 */

// ============================================================
// IMPORTS
// ============================================================
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { ConfirmProvider } from './components/ConfirmDialog'
import { PLAN_INTEREST_KEY, cleanInterest } from './utils/billing'

// ============================================================
// STALE VERSION GUARD
// Parts of the app (PDF maker, Excel, QR code) download only when first
// used. After a new version is published, a page opened earlier asks for
// files that no longer exist — reload once to pick up the new version
// instead of failing ("Couldn't make the PDF").
// ============================================================
window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem('es-reloaded-at') || 0);
  if (Date.now() - last < 60000) return;          // reloaded a moment ago — don't loop
  event.preventDefault();
  sessionStorage.setItem('es-reloaded-at', String(Date.now()));
  window.location.reload();
});

// ============================================================
// PLAN PICKED ON THE WEBSITE — eventscope.in links here as /?plan=standard.
// Remember it until the person creates their company, then tidy the address.
// ============================================================
try {
  const url = new URL(window.location.href);
  const picked = cleanInterest(url.searchParams.get('plan'));
  if (picked) localStorage.setItem(PLAN_INTEREST_KEY, picked);
  if (url.searchParams.has('plan')) {
    url.searchParams.delete('plan');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
} catch { /* private mode etc. — the pick is only a convenience */ }

// ============================================================
// MOUNT — the #root element in index.html
// ============================================================
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ErrorBoundary>
  </StrictMode>,
)
