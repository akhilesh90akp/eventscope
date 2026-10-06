/**
 * App — Root component with routing and auth gating
 *
 * Uses HashRouter (not BrowserRouter) on purpose: this app is hosted on
 * GitHub Pages, a static file host with no server-side routing support.
 * HashRouter keeps everything after "#" purely client-side — the browser
 * never sends it to the server — so a hard refresh on any page (e.g.
 * /eventscope/#/drafts) always resolves correctly. No 404/redirect
 * workaround needed. See CODE_STRUCTURE.md.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
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
import Legal from './pages/Legal';

// ============================================================
// AppRoutes — auth gate + route table
// ============================================================

/** Full-screen loading state on the brand background */
function LoadingScreen() {
  // The Job Log opens in its own tab; show its loader from the very first paint
  if (window.location.hash.startsWith('#/job-log')) return <JobLogLoader />;
  return (
    <div className="min-h-[100dvh] bg-bb-sidebar flex items-center justify-center">
      <div className="text-center">
        <img src={import.meta.env.BASE_URL + "eventscope-logo.svg"} alt="EventScope — Every event, in focus" className="h-24 w-auto mx-auto mb-6 animate-pulse" />
        <p className="text-bb-sidebar-muted text-sm">Loading...</p>
      </div>
    </div>
  );
}

/**
 * Shown when someone signs in but their login isn't linked to any company
 * (no users/{uid} doc), or membership couldn't be loaded. Step 7 (public
 * sign-up) will add a "Create your company" action here.
 */
function AccountStatusScreen({ title, message }) {
  const { user, logout } = useApp();
  return (
    <div className="min-h-[100dvh] bg-bb-sidebar flex flex-col items-center justify-center p-4">
      <img src={import.meta.env.BASE_URL + "eventscope-logo.svg"} alt="EventScope — Every event, in focus" className="h-28 w-auto mb-10 object-contain" />
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-500 mb-2">{message}</p>
        <p className="text-xs text-gray-400 mb-6">Signed in as {user?.email}</p>
        <button
          onClick={logout}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

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

const PUBLIC_PAGES = ['terms', 'privacy', 'data-protection'];

function AppRoutes() {
  const { user, authLoading, tenantStatus, isPlatformAdmin, toast } = useApp();
  const path = useHashPath();

  // Public pages — readable without signing in (linked from login & sign-up)
  const publicPage = PUBLIC_PAGES.find(p => path === `/${p}`);
  if (publicPage) return <Legal page={publicPage} />;

  // Show loading while checking auth
  if (authLoading) return <LoadingScreen />;

  // Show login if not authenticated
  if (!user) {
    return <Login />;
  }

  // Signed in — wait until we know which company this login belongs to
  if (tenantStatus === 'loading') return <LoadingScreen />;
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
  // Signed in but not part of any company (and no invite): offer sign-up
  if (tenantStatus === 'none') return <CreateCompany />;
  if (tenantStatus === 'error') {
    return (
      <AccountStatusScreen
        title="Couldn't load your account"
        message="Something went wrong loading your company's data. Check your connection and try again."
      />
    );
  }

  // Authenticated - show main app
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
        </Route>
      </Routes>
      <Toast message={toast.message} type={toast.type} isVisible={toast.visible} />
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
