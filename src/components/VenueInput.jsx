/**
 * VenueInput — venue box with suggestions, for phones (New / Edit event)
 *
 * A tall box (the full venue name and address stay visible) that suggests:
 *   1. "Your venues" — places already used on this company's events, most
 *      used first, so repeat venues are one tap and spelled the same way
 *      (that's what lets you see every event at a venue later);
 *   2. "On the map" — OpenStreetMap search (free, India only), after 3 letters;
 *   3. "Use as typed" — keep exactly what was typed (no map pin needed).
 * Laptops keep LocationInput.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Search, Pencil, Loader2, X } from 'lucide-react';
import { savedVenues } from '../utils/helpers';

// ============================================================
// VenueInput — MAIN COMPONENT
// ============================================================

export default function VenueInput({ label = 'Venue', value, onChange, events = [], placeholder = 'Search or type the venue', testId = 'venue' }) {
  const [focused, setFocused] = useState(false);
  const [map, setMap] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const wrap = useRef(null);
  const q = (value || '').trim().toLowerCase();

  const yours = useMemo(() => {
    const all = savedVenues(events);
    return (q ? all.filter(v => v.name.toLowerCase().includes(q) && v.name.toLowerCase() !== q) : all).slice(0, 4);
  }, [events, q]);

  // Map search after 3 letters (debounced)
  useEffect(() => {
    clearTimeout(timer.current);
    if (!focused || q.length < 3) { setMap([]); return undefined; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=in&limit=4&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
        const data = await res.json();
        setMap((Array.isArray(data) ? data : []).map(it => {
          const a = it.address || {};
          const name = it.name || it.display_name.split(',')[0];
          const area = [a.suburb || a.road, a.city || a.town || a.village, a.state].filter(Boolean).join(', ');
          return { name, area, full: area ? `${name}, ${area}` : name };
        }));
      } catch {
        setMap([]);
      }
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer.current);
  }, [q, focused]);

  // Close when tapping elsewhere
  useEffect(() => {
    const out = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setFocused(false); };
    document.addEventListener('pointerdown', out);
    return () => document.removeEventListener('pointerdown', out);
  }, []);

  const pick = (text) => { onChange(text); setFocused(false); };
  const open = focused && (yours.length > 0 || map.length > 0 || q.length > 0);

  const Row = ({ icon: Icon, title, sub, onPick, tag }) => (
    <button type="button" onMouseDown={e => e.preventDefault()} onClick={onPick}
      className="w-full flex items-center gap-3 min-h-[58px] px-3.5 py-2 text-left border-t border-bb-border hover:bg-violet-50 cursor-pointer">
      <Icon size={18} className="text-bb-accent shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-bb-text">{title}</span>
        {sub && <span className="block text-[12.5px] text-gray-600">{sub}</span>}
      </span>
      {tag}
    </button>
  );

  return (
    <div ref={wrap} className="block" data-testid={testId}>
      <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">{label}</span>
      <div className={`relative flex items-start gap-2.5 rounded-xl border bg-white px-3.5 py-3 ${focused ? 'border-2 border-bb-accent' : 'border-bb-border bg-bb-input'}`}>
        <MapPin size={18} className="text-gray-500 mt-0.5 shrink-0" />
        <textarea rows={2} value={value || ''} placeholder={placeholder} onFocus={() => setFocused(true)}
          onChange={e => onChange(e.target.value.replace(/\n/g, ' '))} data-testid={`${testId}-input`}
          className="flex-1 min-h-[48px] resize-none bg-transparent text-[16px] leading-snug text-bb-text placeholder:text-gray-400 focus:outline-none" />
        {loading ? <Loader2 size={18} className="text-gray-400 animate-spin mt-0.5" />
          : value ? <button type="button" onClick={() => onChange('')} aria-label="Clear venue" className="text-gray-400 mt-0.5 cursor-pointer"><X size={18} /></button> : null}
      </div>
      {open && (
        <div className="mt-1.5 rounded-2xl border border-bb-border bg-white overflow-hidden shadow-[0_12px_26px_-14px_rgba(40,10,70,0.35)]" data-testid={`${testId}-suggestions`}>
          {yours.length > 0 && <p className="px-3.5 pt-2.5 pb-1.5 text-[12px] font-bold tracking-wider uppercase text-bb-muted">Your venues</p>}
          {yours.map(v => (
            <Row key={v.name} icon={MapPin} title={v.name} sub={`Used for ${v.count} event${v.count === 1 ? '' : 's'}`} onPick={() => pick(v.name)}
              tag={<span className="text-[11.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Saved</span>} />
          ))}
          {map.length > 0 && <p className="px-3.5 pt-2.5 pb-1.5 text-[12px] font-bold tracking-wider uppercase text-bb-muted border-t border-bb-border">On the map</p>}
          {map.map((m, i) => <Row key={i} icon={Search} title={m.name} sub={m.area} onPick={() => pick(m.full)} />)}
          {q.length > 0 && <Row icon={Pencil} title={`Use “${value.trim()}” as typed`} sub="Saves the name without a map pin" onPick={() => pick(value.trim())} />}
        </div>
      )}
    </div>
  );
}
