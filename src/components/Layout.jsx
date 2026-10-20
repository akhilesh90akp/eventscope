/**
 * Layout — Application shell with navigation
 *
 * Desktop (1024px+): sidebar (logo, nav, account row with logout).
 * Mobile/tablet: PhoneHeader (page title, or ← back on task screens) with the
 * ☰ slide-in menu (same nav and account row), plus the bottom bar with a
 * floating "new event" button. Task screens (quote, bill, new event…) hide the
 * bottom bar; their own ActionBar sits at the bottom edge instead.
 * Shows a banner when the company is suspended. Page content renders via React Router's Outlet.
 * Menu items marked ownerOnly / adminOnly are hidden from everyone else
 * (firestore.rules still enforce access server-side).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { LayoutDashboard, FilePlus, FileText, CheckCircle2, PartyPopper, Settings, Plus, BarChart3, LogOut, Shield, X, CalendarDays, ShoppingBag, CreditCard } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useConfirm } from './useConfirm';
import { PlanNotice } from './NoticeBar';
import { PlanTag } from './UpgradeCard';
import { countByStatus } from '../utils/helpers';
import { useTyping } from './useTyping';
import PhoneHeader, { PhoneHeaderProvider } from './PhoneHeader';
import { phoneScreenFor, usePhoneHeaderExtra } from './phoneScreens';

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Navigation items for the desktop sidebar and the mobile slide-in menu.
 * `group` puts a thin line between sections: planning, event lists, business.
 */
const sidebarNav = [
  { to: '/', icon: LayoutDashboard, label: 'Home', group: 'plan' },
  { to: '/new', icon: FilePlus, label: 'New Event', group: 'plan' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar', group: 'plan' },
  { to: '/drafts', icon: FileText, label: 'Drafts', group: 'events', count: 'draft' },
  { to: '/confirmed', icon: CheckCircle2, label: 'Confirmed', group: 'events', count: 'confirmed' },
  { to: '/completed', icon: PartyPopper, label: 'Completed', group: 'events', count: 'completed' },
  { to: '/reports', icon: BarChart3, label: 'Reports', ownerOnly: true, group: 'business', feature: 'reports' },
  { to: '/purchases', icon: ShoppingBag, label: 'Purchases', ownerOnly: true, group: 'business', feature: 'purchases' },
  { to: '/billing', icon: CreditCard, label: 'Plan & billing', ownerOnly: true, group: 'business' },
  { to: '/settings', icon: Settings, label: 'Settings', group: 'business' },
  { to: '/admin', icon: Shield, label: 'Admin', adminOnly: true, group: 'business' },
];

/** Mobile bottom bar (the round + in the middle is New Event); Settings is in the ☰ menu */
const mobileNav = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/drafts', icon: FileText, label: 'Drafts' },
  { to: '/confirmed', icon: CheckCircle2, label: 'Confirmed' },
  { to: '/completed', icon: PartyPopper, label: 'Completed' },
];

// ============================================================
// SUB-COMPONENTS
// ============================================================

const LOGO = import.meta.env.BASE_URL + 'eventscope-logo-horizontal.svg';

/** One bottom-bar tab: icon and label */
function BottomTab({ item }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-0.5 py-2 transition-colors
        ${isActive ? 'text-white font-bold' : 'text-white/60'}`
      }
    >
      <Icon size={22} />
      <span className="text-[11.5px]">{item.label}</span>
    </NavLink>
  );
}

/**
 * Nav links + account row (company, role, logout). Shared by the desktop
 * sidebar and the mobile slide-in menu so both always list the same pages.
 */
function NavPanel({ items, counts, companyName, roleLabel, onLogout, canUse }) {
  return (
    <>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((item, i) => (
          <React.Fragment key={item.to}>
          {/* thin line where a new section starts */}
          {i > 0 && item.group !== items[i - 1].group && <div role="separator" className="!my-2 mx-3 border-t border-white/10" />}
          <NavLink
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
            {item.count && counts[item.count] > 0 && (
              <span className="ml-auto text-[11px] font-semibold tabular-nums bg-white/10 text-white/80 rounded-full px-2 py-0.5" data-testid={`count-${item.count}`}>{counts[item.count]}</span>
            )}
            {item.feature && !canUse(item.feature) && <span className="ml-auto"><PlanTag feature={item.feature} dark /></span>}
          </NavLink>
          </React.Fragment>
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

/** Main layout wrapper: provides the phone title bar's context to every page */
export default function Layout() {
  return <PhoneHeaderProvider><LayoutShell /></PhoneHeaderProvider>;
}

/** Sidebar / title bar + menu, content area, and mobile nav */
function LayoutShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, tenant, tenantStatus, settings, role, isOwner, isPlatformAdmin, events, lockAsked, access, canUse } = useApp();
  const confirm = useConfirm();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [menuOpen, setMenuOpen] = useState(false);   // mobile slide-in menu

  // ------------------------------------------------------------
  // EFFECTS
  // ------------------------------------------------------------

  // Something tried to save while the company is read-only → explain once
  useEffect(() => {
    if (!lockAsked) return;
    const paused = access?.phase === 'suspended';
    (async () => {
      const go = await confirm({
        tone: 'lock',
        title: paused ? 'This account is paused' : 'Your plan has ended',
        message: paused
          ? 'EventScope has paused this account. Everything you saved is safe — contact EventScope support to switch it back on.'
          : isOwner
            ? 'Renew to create events and make changes. Everything you saved is safe — nothing is deleted.'
            : 'Ask your company owner to renew. Everything you saved is safe — nothing is deleted.',
        confirmLabel: !paused && isOwner ? 'See plans & pay' : 'OK',
        cancelLabel: !paused && isOwner ? 'Not now' : null,
      });
      if (go && !paused && isOwner) navigate('/billing');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockAsked]);

  // Phones: hide the bottom bar while the keyboard is open. iPhone shrinks
  // the visible area for the keyboard, which lifts a bottom-fixed bar up into
  // the form. Typing in a text box = keyboard open; leaving it = closed.
  const typing = useTyping();

  // Close the mobile menu whenever the page changes
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // A newly opened page starts at the top (Back keeps where you were)
  const navType = useNavigationType();
  useEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0);
  }, [location.pathname, navType]);

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
  const counts = useMemo(() => countByStatus(events), [events]);
  // Phones: which kind of screen this is (main or task) and its title
  const phoneScreen = adminOnly ? { title: 'EventScope Admin' } : phoneScreenFor(location.pathname);
  const headerExtra = usePhoneHeaderExtra();
  const isTask = !!phoneScreen.task;
  const goBack = () => (((window.history.state?.idx ?? 0) > 0) ? navigate(-1) : navigate(phoneScreen.back || '/'));
  const panelProps = { items: visibleNav, counts, companyName, roleLabel, onLogout: logout, canUse };

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

      {/* === MOBILE TITLE BAR (below 1024px) — page title or ← back, stays on top === */}
      <header className={`lg:hidden sticky top-0 z-40 bg-bb-sidebar border-b ${isTask ? "border-transparent" : "border-bb-sidebar-border"} pt-[env(safe-area-inset-top)]`}>
        <PhoneHeader screen={phoneScreen} extra={headerExtra} logo={LOGO}
          onMenu={() => setMenuOpen(true)} onBack={goBack} onLogo={() => navigate(adminOnly ? '/admin' : '/')} />
      </header>

      {/* === MOBILE SLIDE-IN MENU === */}
      <div className={`lg:hidden fixed inset-0 z-[60] ${menuOpen ? '' : 'pointer-events-none'}`} aria-hidden={!menuOpen}>
        {/* Panel — full screen on phones/tablets, slides in from the right */}
        <aside className={`absolute inset-0 bg-bb-sidebar flex flex-col
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
      <main className={`lg:ml-[240px] ${isTask ? 'pb-[calc(7rem+env(safe-area-inset-bottom))]' : 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]'} lg:pb-6`} data-screen={isTask ? 'task' : 'main'}>
        {/* Plan notice: pilot ending, payment due, read-only… (one at a time) */}
        {!adminOnly && <div className="px-4 pt-4 md:px-6 lg:px-8 lg:pt-5 empty:hidden"><PlanNotice /></div>}
        <div className="p-4 md:p-6 lg:p-8 w-full">
          <Outlet />
        </div>
      </main>

      {/* === MOBILE BOTTOM NAV (below 1024px) — not shown in admin-only mode.
           Task screens hide it (their ActionBar takes the bottom edge).
           Extra bottom padding keeps it clear of the iPhone home bar. === */}
      <nav data-testid="bottom-nav" className={`${adminOnly || typing || isTask ? 'hidden' : 'lg:hidden'} fixed bottom-0 left-0 right-0 h-[calc(4.25rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-bb-sidebar border-t border-bb-sidebar-border z-50`}>
        <div className="grid grid-cols-5 items-center h-full w-full">
          {/* Left 2 items */}
          {mobileNav.slice(0, 2).map(item => <BottomTab key={item.to} item={item} />)}

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
          {mobileNav.slice(2).map(item => <BottomTab key={item.to} item={item} />)}
        </div>
      </nav>
    </div>
  );
}
