/**
 * ReminderSwitch — owners turn event-reminder notifications on/off for the
 * device they're holding (each phone/laptop is set up separately).
 *
 * Shows the right message for each case: on, off, blocked in settings,
 * iPhone not yet added to the Home Screen, or not supported here.
 * Logic: utils/push.js (device) + AppContext enable/disableReminders (saving).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import Button from './Button';
import { useApp } from '../context/AppContext';
import { pushStatus, showTestNotification } from '../utils/push';

// ============================================================
// CONSTANTS
// ============================================================
const MESSAGES = {
  'ios-install': 'On iPhone, add EventScope to your Home Screen first (Share → Add to Home Screen), open it from there, then turn reminders on.',
  blocked: 'Notifications are blocked for EventScope. Allow them in your browser or phone settings, then come back here.',
  unsupported: 'This browser can’t show reminders. Try Chrome, Edge, or the installed app.',
};

// ============================================================
// ReminderSwitch — MAIN COMPONENT
// ============================================================

export default function ReminderSwitch() {
  const { enableReminders, disableReminders, showToast, isSuspended } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [status, setStatus] = useState(pushStatus);
  const [busy, setBusy] = useState(false);

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const turnOn = async () => {
    setBusy(true);
    const r = await enableReminders();
    setBusy(false);
    setStatus(pushStatus());
    if (r.success) {
      showToast('Reminders are on for this device');
      showTestNotification().catch(() => {});
    } else {
      showToast(r.error, 'error');
    }
  };

  const turnOff = async () => {
    setBusy(true);
    const r = await disableReminders();
    setBusy(false);
    setStatus(pushStatus());
    showToast(r.success ? 'Reminders are off for this device' : r.error, r.success ? 'success' : 'error');
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  if (MESSAGES[status]) return <p className="text-xs text-bb-muted bg-gray-50 rounded-lg px-3 py-2" data-testid="reminder-status">{MESSAGES[status]}</p>;

  if (status === 'on') {
    return (
      <div className="flex items-center justify-between gap-2 text-sm bg-emerald-50 text-emerald-800 rounded-lg px-3 py-2" data-testid="reminder-status">
        <span className="flex items-center gap-1.5"><BellRing size={15} /> On for this device</span>
        <button onClick={turnOff} disabled={busy} className="text-xs underline cursor-pointer">Turn off</button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="reminder-status">
      <Button size="sm" icon={BellRing} onClick={turnOn} disabled={busy || isSuspended} fullWidth>
        {busy ? 'Turning on…' : 'Turn on reminders on this device'}
      </Button>
      <p className="text-[11px] text-bb-muted flex items-start gap-1">
        <BellOff size={12} className="mt-0.5 shrink-0" />
        A notification before each confirmed event (days set in Settings → Calendar) and on the day, at 9 am — even when the app is closed.
      </p>
    </div>
  );
}
