/**
 * Layout — Application shell with navigation
 *
 * Desktop (1024px+): sidebar (logo, nav, account row with logout).
 * Mobile/tablet: purple title bar (logo + hamburger → slide-in menu with the
 * same nav and account row) plus the bottom bar with a floating "new event"
 * button. Shows a banner when the company is suspended. Page content renders via React Router's Outlet.
 * Menu items marked ownerOnly / adminOnly are hidden from everyone else
 * (firestore.rules still enforce access server-side).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FilePlus, FileText, CheckCircle2, PartyPopper, Settings, Plus, BarChart3, LogOut, Shield, Menu, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

// ============================================================
// CONSTANTS
// ============================================================

/** Navigation items displayed in the desktop sidebar */
const sidebarNav = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/new', icon: FilePlus, label: 'New Event' },
  { to: '/drafts', icon: FileText, label: 'Drafts' },
  { to: '/confirmed', icon: CheckCircle2, label: 'Confirmed' },
  { to: '/completed', icon: PartyPopper, label: 'Completed' },
  { to: '/reports', icon: BarChart3, label: 'Reports', ownerOnly: true },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/admin', icon: Shield, label: 'Admin', adminOnly: true },
];

/** Condensed navigation items for the mobile bottom bar */
const mobileNav = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/drafts', icon: FileText, label: 'Drafts' },
  { to: '/confirmed', icon: CheckCircle2, label: 'Confirmed' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

// ============================================================
// SUB-COMPONENTS
// ============================================================

const LOGO = import.meta.env.BASE_URL + 'eventscope-logo-horizontal.svg';

/**
 * Nav links + account row (company, role, logout). Shared by the desktop
 * sidebar and the mobile slide-in menu so both always list the same pages.
 */
function NavPanel({ items, companyName, roleLabel, onLogout }) {
  return (
    <>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${isActive
                ? 'bg-bb-sidebar-active text-white'
                : 'text-bb-sidebar-muted hover:text-white hover:bg-bb-sidebar-active'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Account footer: company + role on the left, logout on the right */}
      <div className="px-3 pt-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] border-t border-bb-sidebar-border">
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-white/10 text-[#e3ca7c] font-bold text-sm flex items-center justify-center">
            {(companyName || '?').trim().charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate" title={companyName}>{companyName || 'Your company'}</p>
            <p className="text-[11px] text-bb-sidebar-muted truncate" title={roleLabel}>{roleLabel}</p>
          </div>
          <button
            onClick={onLogout}
            title="Log out"
            aria-label="Log out"
            className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-bb-sidebar-muted hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <LogOut size={18} />
          </button>
        </div>
        <p className="text-[9px] text-bb-sidebar-muted/50 text-center mt-2 tracking-wide">EventScope v1.0</p>
      </div>
    </>
  );
}

// ============================================================
// Layout — MAIN COMPONENT
// ============================================================

/** Main layout wrapper with sidebar / title bar + menu, content area, and mobile nav */
export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, tenant, tenantStatus, settings, role, isSuspended, isOwner, isPlatformAdmin } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [menuOpen, setMenuOpen] = useState(false);   // mobile slide-in menu

  // ------------------------------------------------------------
  // EFFECTS
  // ------------------------------------------------------------

  // Close the mobile menu whenever the page changes
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Lock page scroll behind the open menu
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------
  // A platform admin who isn't in any company yet sees only the Admin page
  const adminOnly = isPlatformAdmin && tenantStatus !== 'ready';
  const companyName = adminOnly ? 'EventScope Admin' : (settings.companyName || tenant?.name || '');
  const roleLabel = adminOnly ? (user?.email || '') : role === 'owner' ? 'Owner' : role === 'staff' ? 'Staff' : '';
  const visibleNav = sidebarNav.filter(item => (adminOnly
    ? item.adminOnly
    : (!item.ownerOnly || isOwner) && (!item.adminOnly || isPlatformAdmin)));
  const panelProps = { items: visibleNav, companyName, roleLabel, onLogout: logout };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  return (
    <div className="min-h-[100dvh] bg-bb-bg overflow-x-clip">
      {/* === SIDEBAR (Desktop only: 1024px+) === */}
      <aside className="hidden lg:flex flex-col fixed top-0 left-0 bottom-0 w-[240px] bg-bb-sidebar border-r border-bb-sidebar-border z-50">
        {/* Logo - EventScope horizontal logo (white + gold star, no tagline) */}
        <div className="px-4 py-5 border-b border-bb-sidebar-border">
          <img src={LOGO} alt="EventScope" className="w-full max-w-[150px] h-auto object-contain" />
        </div>
        <NavPanel {...panelProps} />
      </aside>

      {/* === MOBILE TITLE BAR (below 1024px) — logo + hamburger, stays on top === */}
      <header className="lg:hidden sticky top-0 z-40 bg-bb-sidebar border-b border-bb-sidebar-border pt-[env(safe-area-inset-top)]">
        <div className="h-14 px-4 flex items-center justify-between">
          <button onClick={() => navigate(adminOnly ? '/admin' : '/')} aria-label="Home" className="cursor-pointer">
            <img src={LOGO} alt="EventScope" className="h-[18px] w-auto" />
          </button>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="w-10 h-10 -mr-2 rounded-lg flex items-center justify-center text-white hover:bg-white/10 cursor-pointer"
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* === MOBILE SLIDE-IN MENU === */}
      <div className={`lg:hidden fixed inset-0 z-[60] ${menuOpen ? '' : 'pointer-events-none'}`} aria-hidden={!menuOpen}>
        {/* Backdrop — tap to close */}
        <div
          onClick={() => setMenuOpen(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${menuOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        {/* Panel (slides in from the right, next to the hamburger) */}
        <aside className={`absolute top-0 right-0 bottom-0 w-[78%] max-w-[300px] bg-bb-sidebar flex flex-col shadow-2xl
          transition-transform duration-200 ease-out ${menuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="pt-[env(safe-area-inset-top)] border-b border-bb-sidebar-border">
            <div className="h-14 px-4 flex items-center justify-between">
              <img src={LOGO} alt="EventScope" className="h-[18px] w-auto" />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="w-10 h-10 -mr-2 rounded-lg flex items-center justify-center text-white hover:bg-white/10 cursor-pointer"
              >
                <X size={22} />
              </button>
            </div>
          </div>
          <NavPanel {...panelProps} />
        </aside>
      </div>

      {/* === MAIN CONTENT === */}
      <main className="lg:ml-[240px] pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6">
        {/* Suspended account banner (tenant set to read-only by EventScope) */}
        {isSuspended && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 py-3 text-center">
            This account is suspended — you can view your data, but changes are disabled. Please contact EventScope support.
          </div>
        )}
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 w-full">
          <Outlet />
        </div>
      </main>

      {/* === MOBILE BOTTOM NAV (below 1024px) — not shown in admin-only mode.
           Extra bottom padding keeps it clear of the iPhone home bar. === */}
      <nav className={`${adminOnly ? 'hidden' : 'lg:hidden'} fixed bottom-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-bb-sidebar/95 backdrop-blur-md border-t border-bb-sidebar-border z-50`}>
        <div className="grid grid-cols-5 items-center h-full w-full">
          {/* Left 2 items */}
          {mobileNav.slice(0, 2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 py-2 transition-colors
                  ${isActive ? 'text-bb-accent' : 'text-bb-sidebar-muted'}`
                }
              >
                <Icon size={20} />
                <span className="text-[10px]">{item.label}</span>
              </NavLink>
            );
          })}

          {/* Center: FAB Button */}
          <div className="flex justify-center">
            <button
              onClick={() => navigate('/new')}
              className="w-14 h-14 -mt-7 rounded-full bg-bb-accent hover:bg-bb-accent-hover shadow-lg shadow-bb-accent/40 flex items-center justify-center transition-transform active:scale-90 cursor-pointer"
            >
              <Plus size={26} className="text-white" strokeWidth={2.5} />
            </button>
          </div>

          {/* Right 2 items */}
          {mobileNav.slice(2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 py-2 transition-colors
                  ${isActive ? 'text-bb-accent' : 'text-bb-sidebar-muted'}`
                }
              >
                <Icon size={20} />
                <span className="text-[10px]">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
