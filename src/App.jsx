/**
 * App — Root component with routing and auth gating
 *
 * Uses HashRouter (not BrowserRouter) on purpose: this app is hosted on
 * GitHub Pages, a static file host with no server-side routing support.
 * HashRouter keeps everything after "#" purely client-side — the browser
 * never sends it to the server — so a hard refresh on any page (e.g.
 * /bluebell-app/#/drafts) always resolves correctly. No 404/redirect
 * workaround needed. See CODE_STRUCTURE.md.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
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

// ============================================================
// AppRoutes — auth gate + route table
// ============================================================

function AppRoutes() {
  const { user, authLoading, toast } = useApp();

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-[100dvh] bg-bb-sidebar flex items-center justify-center">
        <div className="text-center">
          <img src={import.meta.env.BASE_URL + "logo-gold.png"} alt="Bluebell" className="h-12 mx-auto mb-4 animate-pulse" />
          <p className="text-bb-sidebar-muted text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return <Login />;
  }

  // Authenticated - show main app
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewDraft />} />
          <Route path="/edit/:eventId" element={<EditDraft />} />
          <Route path="/drafts" element={<DraftsList />} />
          {/* Distinct keys force a remount when switching between these two
              routes — they render the same component, and without a key
              React Router reuses the existing instance, leaving its
              internal tab state stuck on whichever was shown first. */}
          <Route path="/confirmed" element={<ConfirmedEvents key="confirmed" />} />
          <Route path="/completed" element={<ConfirmedEvents key="completed" />} />
          <Route path="/bill/:eventId" element={<BillGenerator />} />
          <Route path="/quotation/:eventId" element={<QuotationGenerator />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
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
