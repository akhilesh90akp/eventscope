/**
 * PhoneHeader — the purple title bar on phones and tablets (below 1024px)
 *
 * Two kinds of screens (see the phone redesign review):
 *   - main screens (Home, Drafts, Confirmed, Completed, Calendar, Reports…):
 *     page title + optional icons + ☰ menu; the bottom menu is shown.
 *   - task screens (New/Edit event, Quote, Bill, Contract, Job Log, a Settings
 *     section): ← back, title with a sub-line (client · event · date) and an
 *     optional action on the right; the bottom menu steps aside.
 *
 * Layout owns the bar. The route decides the title and kind (PHONE_SCREENS);
 * a page adds its sub-line or right-hand buttons with usePhoneHeader()
 * (route table, context and hooks live in phoneScreens.js).
 * Laptops (1024px+) never see this bar — they keep the sidebar.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { PhoneHeaderContext } from './phoneScreens';
import { ArrowLeft, Menu } from 'lucide-react';

// ============================================================
// PROVIDER
// ============================================================

/** Wraps the app shell; holds what the current page added to the bar */
export function PhoneHeaderProvider({ children }) {
  const [extra, setExtra] = useState(null);
  return <PhoneHeaderContext.Provider value={{ extra, setExtra }}>{children}</PhoneHeaderContext.Provider>;
}

// ============================================================
// PhoneHeader — the bar itself (rendered by Layout)
// ============================================================

export default function PhoneHeader({ screen, extra, logo, onMenu, onBack, onLogo }) {
  const title = extra?.title ?? screen.title;
  const task = !!screen.task;

  // --- Task screen: ← back · title + sub-line · right action ---
  if (task) {
    return (
      <div className="min-h-[5.25rem] pl-2 pr-3 pt-3.5 pb-4 flex items-center gap-1" data-testid="phone-header" data-kind="task">
        <button onClick={onBack} aria-label="Back" className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-white hover:bg-white/10 cursor-pointer">
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[1.3rem] leading-tight font-bold text-white truncate">{title}</h1>
          {extra?.sub && <p className="text-[13.5px] text-[#d8c8ec] mt-1 truncate" data-testid="phone-header-sub">{extra.sub}</p>}
        </div>
        {extra?.right && <div className="shrink-0 flex items-center gap-1">{extra.right}</div>}
      </div>
    );
  }

  // --- Main screen: title (or the logo on Home) · icons · ☰ ---
  return (
    <div className="h-16 pl-4 pr-2 flex items-center gap-1" data-testid="phone-header" data-kind="main">
      <div className="flex-1 min-w-0">
        {screen.logo
          ? <button onClick={onLogo} aria-label="Home" className="cursor-pointer"><img src={logo} alt="EventScope" className="h-[20px] w-auto" /></button>
          : <h1 className="text-[1.3rem] font-bold text-white truncate">{title}</h1>}
      </div>
      {extra?.right}
      <button onClick={onMenu} aria-label="Open menu" className="w-11 h-11 rounded-xl flex items-center justify-center text-white hover:bg-white/10 cursor-pointer">
        <Menu size={24} />
      </button>
    </div>
  );
}

/** A white icon button for the bar's right side (search, download, ⋮) */
export function HeaderIconButton({ icon: Icon, label, onClick, ...rest }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} {...rest}
      className="w-11 h-11 rounded-xl flex items-center justify-center text-white hover:bg-white/10 cursor-pointer disabled:opacity-40">
      <Icon size={22} />
    </button>
  );
}

/** A white text button for the bar's right side ("Save", "Save draft") */
export function HeaderTextButton({ children, onClick, disabled, ...rest }) {
  return (
    <button onClick={onClick} disabled={disabled} {...rest}
      className="h-11 px-3 rounded-xl text-white font-bold text-[15px] hover:bg-white/10 cursor-pointer disabled:opacity-40">
      {children}
    </button>
  );
}
