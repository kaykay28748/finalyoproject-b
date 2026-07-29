import { useState, useEffect, useRef, useCallback } from "react";
import { useHaptics } from "../../hooks/useHaptics";
import { geocode, searchLocal } from "../../services/geocoding";
import { saveRecentSearch, getRecentSearches, clearRecentSearches } from "../../services/recentSearches";
import "./SearchBox.css";

// ── Type icons ────────────────────────────────────────────────────────────────
const TYPE_META = {
  hall:          { icon: "🏠", label: "Hall" },
  academic:      { icon: "🎓", label: "Academic" },
  library:       { icon: "📚", label: "Library" },
  gate:          { icon: "🚧", label: "Gate" },
  health:        { icon: "🏥", label: "Health" },
  admin:         { icon: "🏛️", label: "Admin" },
  service:       { icon: "🔧", label: "Service" },
  food:          { icon: "🍽️", label: "Food" },
  sport:         { icon: "⚽", label: "Sport" },
  worship:       { icon: "⛪", label: "Worship" },
  research:      { icon: "🔬", label: "Research" },
  landmark:      { icon: "📍", label: "Landmark" },
  road:          { icon: "🛣️", label: "Road" },
  commercial:    { icon: "🏪", label: "Commercial" },
  accommodation: { icon: "🏨", label: "Stay" },
  school:        { icon: "🏫", label: "School" },
  place:         { icon: "📍", label: "Place" },
  locationiq:    { icon: "🌍", label: "Place" },
};

function getTypeMeta(type, source) {
  if (source === "locationiq") return TYPE_META.locationiq;
  return TYPE_META[type] || TYPE_META.place;
}

// Pin SVG used for recent searches
function PinIcon({ color = "#6b7280" }) {
  return (
    <svg width="10" height="14" viewBox="0 0 12 16" fill="none">
      <path d="M6 0C2.686 0 0 2.686 0 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.314-2.686-6-6-6z" fill={color} />
      <circle cx="6" cy="6" r="2" fill="white" />
    </svg>
  );
}

export default function SearchBox({
  placeholder,
  value,
  onChange,
  onSelect,
  onUseCurrentLocation,
  showCurrentLocationOption,
  accentColor,
  onFocus,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [showAllRecent, setShowAllRecent] = useState(false);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const { trigger } = useHaptics();

  // ── Recent searches ──────────────────────────────────────────────────────────
  useEffect(() => {
    setRecentSearches(getRecentSearches());
    const sync = () => setRecentSearches(getRecentSearches());
    window.addEventListener("recentSearchesUpdated", sync);
    return () => window.removeEventListener("recentSearchesUpdated", sync);
  }, []);

  // ── Cancel pending request ───────────────────────────────────────────────────
  const cancelPending = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  // ── Input change handler ─────────────────────────────────────────────────────
  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    setShowDropdown(true);

    cancelPending();

    if (val.length < 4) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const localResults = searchLocal(val);
    setSuggestions(localResults);

    if (localResults.length >= 3) {
      setLoading(false);
      return;
    }

    if (localResults.length === 0) {
      setLoading(true);
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const apiResults = await geocode(val, controller.signal);

        if (apiResults === null) return;

        const localNames = new Set(localResults.map((r) => r.name.toLowerCase()));
        const fresh = apiResults.filter(
          (r) => !localNames.has(r.name.toLowerCase())
        );

        setSuggestions([...localResults, ...fresh].slice(0, 7));
      } catch {
        // Swallow
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    }, 300);
  };

  // ── Select a suggestion ──────────────────────────────────────────────────────
  const handleSelect = (loc) => {
    trigger(10);
    onChange(loc.name);
    onSelect(loc);
    saveRecentSearch(loc);
    setRecentSearches(getRecentSearches());
    setSuggestions([]);
    setShowDropdown(false);
    cancelPending();
  };

  const handleClearAll = () => {
    clearRecentSearches();
    setRecentSearches([]);
    setShowAllRecent(false);
  };

  const handleInputClick = () => {
    setShowDropdown(true);
    onFocus?.();
  };

  // ── Close on outside click ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (
        inputRef.current && !inputRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => () => cancelPending(), [cancelPending]);

  const visibleRecent = showAllRecent ? recentSearches : recentSearches.slice(0, 5);
  const hasMoreRecent = recentSearches.length > 5;

  const showRecents = value.length < 1 && recentSearches.length > 0;
  const showSuggestions = suggestions.length > 0;
  const showEmpty = !loading && !showSuggestions && value.length >= 4 && !showCurrentLocationOption;

  const dropdownVisible =
    showDropdown &&
    (showCurrentLocationOption || showRecents || showSuggestions || loading || showEmpty);

  return (
    <div className="searchbox-root">

      {/* Input */}
      <div className="searchbox-input-wrap">
        <span
          className="searchbox-accent-dot"
          style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
        />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onClick={handleInputClick}
          className="searchbox-input"
          onFocus={handleInputClick}
        />
        {loading && (
          <span
            className="searchbox-spinner"
            style={{ borderColor: `${accentColor}40`, borderTopColor: accentColor }}
          />
        )}
      </div>

      {/* Dropdown */}
      {dropdownVisible && (
        <div ref={dropdownRef} className="searchbox-dropdown">

          {/* Current location */}
          {showCurrentLocationOption && (
            <button
              className="searchbox-curr-loc"
              onMouseDown={(e) => {
                e.preventDefault();
                trigger(12);
                onUseCurrentLocation();
                setShowDropdown(false);
              }}
            >
              <span className="curr-loc-dot" />
              Use my current location
            </button>
          )}

          {/* Recent searches */}
          {showRecents && (
            <div className="searchbox-section">
              <div className="searchbox-section-header">
                <span>Recent</span>
                <button className="searchbox-clear-btn" onClick={() => { trigger(10); handleClearAll(); }}>
                  Clear all
                </button>
              </div>
              {visibleRecent.map((item, i) => (
                  <button
                      key={i}
                      className="searchbox-row"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelect({
                          name: item.name,
                          lat: item.lat,
                          lng: item.lng,
                          type: item.type,
                          source: item.source,
                        });
                      }}
                    >
                      <span className="searchbox-row-icon">
                        <PinIcon color="#6b7280" />
                      </span>
                      <span className="searchbox-row-name">{item.name}</span>
                    </button>
              ))}
              {hasMoreRecent && (
                <button
                  className="searchbox-show-more"
                  onClick={() => setShowAllRecent(!showAllRecent)}
                >
                  {showAllRecent ? "Show less" : `Show ${recentSearches.length - 5} more`}
                </button>
              )}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && !showSuggestions && (
            <div className="searchbox-loading-row">
              <span
                className="searchbox-spinner-inline"
                style={{ borderColor: `${accentColor}40`, borderTopColor: accentColor }}
              />
              <span>Searching…</span>
            </div>
          )}

          {/* Suggestions */}
          {showSuggestions && (
            <div className="searchbox-section">
              <div className="searchbox-section-header">
                <span>Suggestions</span>
                {loading && (
                  <span
                    className="searchbox-spinner-xs"
                    style={{ borderColor: `${accentColor}40`, borderTopColor: accentColor }}
                  />
                )}
              </div>
              {suggestions.map((loc, i) => {
                const meta = getTypeMeta(loc.type, loc.source);

                // For LocationIQ results: primary line is "KFC — East Legon"
                // For local results: primary line is just the place name as before
                const primaryLabel =
                  loc.source === "locationiq" && loc.displayLabel
                    ? loc.displayLabel
                    : loc.name;

                // Sub-line: for LocationIQ show the first 3 segments of the full
                // address so the user can verify the exact location if needed.
                // Local results don't need this — their type badge is enough.
                const subLabel =
                  loc.source === "locationiq" && loc.fullAddress
                    ? loc.fullAddress.split(",").slice(0, 3).join(",").trim()
                    : null;

                return (
                  <button
                    key={`${loc.name}-${i}`}
                    className="searchbox-row"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(loc); }}
                  >
                    <span className="searchbox-row-emoji" title={meta.label}>
                      {meta.icon}
                    </span>
                    <div className="searchbox-row-info">
                      <span className="searchbox-row-name">{primaryLabel}</span>
                      {subLabel && (
                        <span className="searchbox-row-address">{subLabel}</span>
                      )}
                    </div>
                    {/* Distance badge on every result — local and off-campus */}
                    {loc.dist > 0 && (
                      <span className="searchbox-row-dist">{loc.dist.toFixed(1)} km</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* No results */}
          {showEmpty && (
            <div className="searchbox-empty">No results — try a different name</div>
          )}

        </div>
      )}
    </div>
  );
}