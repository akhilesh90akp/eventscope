/**
 * LocationInput - Location search input with suggestions
 *
 * Provides auto-complete location search using the OpenStreetMap Nominatim API.
 * Free to use with no API key required. Results are filtered to India.
 * Can be swapped with Google Places API later if needed.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';

/** Renders a location input with debounced search and dropdown suggestions */
export default function LocationInput({ label, value, onChange, placeholder = 'Search location...', required = false }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  // Close dropdown when clicking outside the component
  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Sync local query state when external value prop changes
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  /** Debounced search using OpenStreetMap Nominatim API (400ms delay) */
  const searchLocation = (text) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text || text.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&countrycodes=in&limit=5&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        // Extract a short readable address from the full response
        setSuggestions(data.map(item => ({
          display: item.display_name,
          short: [item.address?.road, item.address?.suburb, item.address?.city || item.address?.town || item.address?.village, item.address?.state].filter(Boolean).join(', '),
          lat: item.lat,
          lon: item.lon,
        })));
        setShowDropdown(true);
      } catch (err) {
        console.error('Location search error:', err);
        setSuggestions([]);
      }
      setLoading(false);
    }, 400);
  };

  /** Handles typing in the input - updates state and triggers search */
  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    searchLocation(val);
  };

  /** Selects a suggestion from the dropdown and closes it */
  const selectSuggestion = (suggestion) => {
    setQuery(suggestion.short || suggestion.display);
    onChange(suggestion.short || suggestion.display);
    setShowDropdown(false);
    setSuggestions([]);
  };

  /** Clears the input and resets all suggestion state */
  const clearInput = () => {
    setQuery('');
    onChange('');
    setSuggestions([]);
    setShowDropdown(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-bb-text mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-muted" />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className="w-full bg-bb-input border border-bb-border rounded-lg pl-10 pr-10 py-2.5 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:ring-2 focus:ring-bb-accent focus:border-transparent"
        />
        {/* Loading spinner while fetching */}
        {loading && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-bb-muted animate-spin" />}
        {/* Clear button when there's text and not loading */}
        {!loading && query && (
          <button onClick={clearInput} className="absolute right-3 top-1/2 -translate-y-1/2 text-bb-muted hover:text-bb-text cursor-pointer">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-bb-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => selectSuggestion(s)}
              className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-bb-accent/10 hover:text-bb-accent border-b border-gray-50 last:border-0 cursor-pointer transition-colors"
            >
              <div className="flex items-start gap-2">
                <MapPin size={14} className="flex-shrink-0 mt-0.5 text-bb-accent" />
                <span className="line-clamp-2">{s.short || s.display}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
