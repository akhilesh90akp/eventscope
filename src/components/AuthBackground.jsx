/**
 * AuthBackground — Looping video behind the sign-in, sign-up and invite screens
 *
 * A muted, looping event/concert clip (Pixabay, free for commercial use;
 * cross-faded so the loop is seamless)
 * under a brand-purple overlay so the logo and white card stay readable.
 * Shows only the still image when the person prefers reduced motion, has
 * Data Saver on or is on a slow (2G/3G) connection. Otherwise the still shows
 * first and the video is fetched ~1.5 s later and fades in, so it never
 * slows down opening the app or signing in. Files: public/login-bg.webm (~1.5 MB), login-bg.mp4 (~2.1 MB,
 * Safari) and login-bg.jpg (still frame). The browser downloads only one video.
 *
 * Usage: put <AuthBackground /> inside a full-screen wrapper that has
 * `relative isolate` — it sits behind everything else in that wrapper.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';

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
    if (/(^|-)2g|3g/.test(navigator.connection?.effectiveType || '')) return true;
  } catch { /* older browsers — just play the video */ }
  return false;
}

// ============================================================
// AuthBackground — MAIN COMPONENT
// ============================================================

export default function AuthBackground() {
  const still = useMemo(preferStill, []);
  const [loadVideo, setLoadVideo] = useState(false);   // start fetching the clip
  const [playing, setPlaying] = useState(false);       // fade it in once it plays

  useEffect(() => {
    if (still) return undefined;
    const t = setTimeout(() => setLoadVideo(true), 1500);
    return () => clearTimeout(t);
  }, [still]);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-bb-sidebar" aria-hidden="true">
      <img src={BASE + 'login-bg.jpg'} alt="" className="absolute inset-0 w-full h-full object-cover" />
      {loadVideo && (
        <video
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${playing ? 'opacity-100' : 'opacity-0'}`}
          autoPlay muted loop playsInline preload="auto"
          onPlaying={() => setPlaying(true)}
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
