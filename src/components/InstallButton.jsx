/**
 * InstallButton — "Install app" on the sign-in screen and Home (phones).
 *
 * Android / Chrome: one tap opens the install box. iPhone: opens a small
 * pop-up with the Add to Home Screen steps. Hidden when the app is already
 * installed, or when this browser can't install it.
 * Logic: utils/install.js.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState, useSyncExternalStore } from 'react';
import { Download, Share, SquarePlus } from 'lucide-react';
import Modal from './Modal';
import { installState, promptInstall, subscribeInstall } from '../utils/install';

// ============================================================
// InstallButton — MAIN COMPONENT
// ============================================================

export default function InstallButton({ className = '' }) {
  const state = useSyncExternalStore(subscribeInstall, installState);
  const [steps, setSteps] = useState(false);

  if (state === 'installed' || state === 'none') return null;

  const onClick = () => (state === 'prompt' ? promptInstall() : setSteps(true));

  return (
    <>
      <button type="button" onClick={onClick} data-testid="install-app"
        className={`w-full flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-white cursor-pointer bg-gradient-to-br from-violet-500 to-violet-700 active:opacity-90 ${className}`}>
        <Download size={17} /> Install app
      </button>

      <Modal isOpen={steps} onClose={() => setSteps(false)} title="Install on your iPhone" size="sm">
        <p className="text-sm text-bb-muted mb-3 text-left">Takes 10 seconds. No App Store.</p>
        <ol className="space-y-3 text-sm text-bb-text text-left">
          {[
            [<>Tap the <b>Share</b> button <Share size={15} className="inline -mt-0.5" /> in Safari (at the bottom, or top right on iPad)</>],
            [<>Scroll down and choose <b>Add to Home Screen</b> <SquarePlus size={15} className="inline -mt-0.5" /></>],
            [<>Tap <b>Add</b>. EventScope is now on your phone</>],
          ].map(([text], i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setSteps(false)} className="mt-5 w-full rounded-full py-3 text-sm font-bold text-violet-800 bg-violet-50 cursor-pointer">Got it</button>
      </Modal>
    </>
  );
}
