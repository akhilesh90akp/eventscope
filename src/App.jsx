/**
 * App — Root component: decides which screen to show, then the route table
 *
 * Order of gates: public pages (Terms/Privacy/Data protection) → auth
 * loading → login → company loading → pending invite (Join / Decline) →
 * no company (sign-up, or Admin for a platform admin) → error → the main app.
 *
 * Uses HashRouter (not BrowserRouter) on purpose: the app is hosted on
 * GitHub Pages, a static host with no server-side routing. Everything after
 * "#" stays client-side, so a hard refresh on any page (e.g.
 * /eventscope/#/drafts) always works. See CODE_STRUCTURE.md.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Toast from './components/Toast';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewDraft from './pages/NewDraft';
import EditDraft from './pages/EditDraft';
import DraftsList from './pages/DraftsList';
import ConfirmedEvents from './pages/ConfirmedEvents';
import BillGenerator from './pages/BillGenerator';
import QuotationGenerator from './pages/QuotationGenerator';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import JobLog, { JobLogLoader } from './pages/JobLog';
import Admin from './pages/Admin';
import CreateCompany from './pages/CreateCompany';
import JoinInvite from './pages/JoinInvite';
import Legal from './pages/Legal';

// ============================================================
// CONSTANTS
// ============================================================

/** Pages anyone can open without signing in (#/terms, #/privacy, #/data-protection) */
const PUBLIC_PAGES = ['terms', 'privacy', 'data-protection'];

// ============================================================
// HELPERS
// ============================================================

/** Current hash path, kept in sync — lets public pages work before sign-in */
function useHashPath() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#/, '') || '/';
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Full-screen loading state on the brand background */
function LoadingScreen() {
  // The Job Log opens in its own tab; show its loader from the very first paint
  if (window.location.hash.startsWith('#/job-log')) return <JobLogLoader />;
  return (
    <div className="min-h-[100dvh] bg-bb-sidebar flex items-center justify-center">
      <div className="text-center">
        <img src={import.meta.env.BASE_URL + 'eventscope-logo.svg'} alt="EventScope — Every event, in focus" className="h-24 w-auto mx-auto mb-6 animate-pulse" />
        <p className="text-bb-sidebar-muted text-sm">Loading...</p>
      </div>
    </div>
  );
}

/** Shown when the company's data couldn't be loaded (e.g. offline) */
function AccountErrorScreen() {
  const { user, logout } = useApp();
  return (
    <div className="min-h-[100dvh] bg-bb-sidebar flex flex-col items-center justify-center p-4">
      <img src={import.meta.env.BASE_URL + 'eventscope-logo.svg'} alt="EventScope — Every event, in focus" className="h-28 w-auto mb-10 object-contain" />
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Couldn’t load your account</h1>
        <p className="text-sm text-gray-500 mb-2">Something went wrong loading your company’s data. Check your connection and try again.</p>
        <p className="text-xs text-gray-400 mb-6">Signed in as {user?.email}</p>
        <button onClick={() => window.location.reload()} className="w-full mb-2 px-4 py-3 bg-bb-accent text-white rounded-xl text-sm font-semibold cursor-pointer">
          Try again
        </button>
        <button onClick={logout} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
          Sign out
        </button>
      </div>
    </div>
  );
}

// ============================================================
// AppRoutes — MAIN COMPONENT (gates + route table)
// ============================================================

function AppRoutes() {
  const { user, authLoading, tenantStatus, isPlatformAdmin, toast } = useApp();
  const path = useHashPath();

  // ------------------------------------------------------------
  // RENDER — GATES
  // ------------------------------------------------------------

  // Public pages — readable without signing in
  const publicPage = PUBLIC_PAGES.find(p => path === `/${p}`);
  if (publicPage) return <Legal page={publicPage} />;

  if (authLoading) return <LoadingScreen />;
  if (!user) return <Login />;

  // Signed in — wait until we know which company this login belongs to
  if (tenantStatus === 'loading') return <LoadingScreen />;

  // Invited to a company: the person decides (never joined automatically)
  if (tenantStatus === 'invited') return <JoinInvite />;

  // A platform admin without a company of their own still gets the Admin page
  if (tenantStatus === 'none' && isPlatformAdmin) {
    return (
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="*" element={<Admin />} />
          </Route>
        </Routes>
        <Toast message={toast.message} type={toast.type} isVisible={toast.visible} />
      </HashRouter>
    );
  }

  // Not part of any company (and no invite): offer sign-up
  if (tenantStatus === 'none') return <CreateCompany />;
  if (tenantStatus === 'error') return <AccountErrorScreen />;

  // ------------------------------------------------------------
  // RENDER — MAIN APP
  // ------------------------------------------------------------
  return (
    <HashRouter>
      <Routes>
        {/* Full-screen, no sidebar — opened in a new tab from Reports / Completed */}
        <Route path="/job-log" element={<JobLog />} />

        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewDraft />} />
          <Route path="/edit/:eventId" element={<EditDraft />} />
          <Route path="/drafts" element={<DraftsList />} />
          {/* Confirmed and Completed are separate pages sharing one list
              component; distinct keys give each its own state. */}
          <Route path="/confirmed" element={<ConfirmedEvents key="confirmed" status="confirmed" />} />
          <Route path="/completed" element={<ConfirmedEvents key="completed" status="completed" />} />
          <Route path="/bill/:eventId" element={<BillGenerator />} />
          <Route path="/quotation/:eventId" element={<QuotationGenerator />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          {/* Unknown address → Home, instead of a blank page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toast message={toast.message} type={toast.type} isVisible={toast.visible} withSidebar={!path.startsWith('/job-log')} />
    </HashRouter>
  );
}

// ============================================================
// App — ROOT EXPORT
// ============================================================

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}
