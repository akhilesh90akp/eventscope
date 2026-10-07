/**
 * AuthBackground — Looping video behind the sign-in, sign-up and invite screens
 *
 * A muted, looping event/concert clip (Pixabay, free for commercial use;
 * cross-faded so the loop is seamless)
 * under a brand-purple overlay so the logo and white card stay readable.
 * Shows only the still image when the person prefers reduced motion or has
 * Data Saver on. Files: public/login-bg.webm (~1.5 MB), login-bg.mp4 (~2.1 MB,
 * Safari) and login-bg.jpg (still frame). The browser downloads only one video.
 *
 * Usage: put <AuthBackground /> inside a full-screen wrapper that has
 * `relative isolate` — it sits behind everything else in that wrapper.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useMemo } from 'react';

// ============================================================
// CONSTANTS
// ============================================================
const BASE = import.meta.env.BASE_URL;

// ============================================================
// HELPERS
// ============================================================

/** True when motion should be avoided: OS "reduce motion" or browser Data Saver */
function preferStill() {
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
    if (navigator.connection?.saveData) return true;
  } catch { /* older browsers — just play the video */ }
  return false;
}

// ============================================================
// AuthBackground — MAIN COMPONENT
// ============================================================

export default function AuthBackground() {
  const still = useMemo(preferStill, []);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-bb-sidebar" aria-hidden="true">
      {still ? (
        <img src={BASE + 'login-bg.jpg'} alt="" className="w-full h-full object-cover" />
      ) : (
        <video
          className="w-full h-full object-cover"
          poster={BASE + 'login-bg.jpg'}
          autoPlay muted loop playsInline preload="auto"
        >
          {/* WebM for Chrome/Edge/Firefox/Android (smaller), MP4 for Safari/iPhone */}
          <source src={BASE + 'login-bg.webm'} type="video/webm" />
          <source src={BASE + 'login-bg.mp4'} type="video/mp4" />
        </video>
      )}
      {/* Brand-purple overlay — keeps text readable over the bright footage */}
      <div className="absolute inset-0 bg-bb-sidebar/70" />
    </div>
  );
}
