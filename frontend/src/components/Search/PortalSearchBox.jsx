import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useHaptics } from "../../hooks/useHaptics";
import { geocode, searchLocal } from "../../services/geocoding";
import { saveRecentSearch, getRecentSearches, clearRecentSearches } from "../../services/recentSearches";
import "./SearchBox.css";

// Type icon map — emoji + label per location category
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
};

function getTypeMeta(type, source) {
  if (source === "locationiq") return { icon: "🌍", label: "Place" };
  if (source === "nominatim")  return { icon: "🌍", label: "Place" };
  return TYPE_META[type] || TYPE_META.place;
}

export default function PortalSearchBox({
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
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

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

  // ── Dropdown positioning ─────────────────────────────────────────────────────
  const updatePosition = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, []);

  useEffect(() => {
    if (!showDropdown) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showDropdown, updatePosition]);

  // ── Cancel pending work ──────────────────────────────────────────────────────
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

  useEffect(() => () => cancelPending(), [cancelPending]);

  // ── Input change ─────────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    setShowDropdown(true);
    cancelPending();

    if (val.length < 2) {
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

    if (localResults.length === 0) setLoading(true);

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const apiResults = await geocode(val, controller.signal);

        if (apiResults === null) return;

        const localNames = new Set(localResults.map((r) => r.name.toLowerCase()));
        const fresh = apiResults.filter((r) => !localNames.has(r.name.toLowerCase()));
        setSuggestions([...localResults, ...fresh].slice(0, 7));
      } catch {
        // silent
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    }, 300);
  };

  // ── Select ───────────────────────────────────────────────────────────────────
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

  const visibleRecent = showAllRecent ? recentSearches : recentSearches.slice(0, 5);
  const hasMoreRecent = recentSearches.length > 5;
  const showRecents = value.length < 1 && recentSearches.length > 0;
  const showSuggestions = suggestions.length > 0;
  const showEmpty = !loading && !showSuggestions && value.length >= 3 && !showCurrentLocationOption;

  const dropdownVisible =
    showDropdown &&
    (showCurrentLocationOption || showRecents || showSuggestions || loading || showEmpty);

  return (
    <div className="portal-search-wrapper">
      {/* Input */}
      <div className="portal-search-input-wrapper">
        <div
          className="portal-search-dot"
          style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
        />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onClick={handleInputClick}
          onFocus={handleInputClick}
          className="portal-search-input"
          style={{ "--accent-color": accentColor }}
        />
        {loading && (
          <div
            className="portal-search-spinner"
            style={{ borderColor: `${accentColor}40`, borderTopColor: accentColor }}
          />
        )}
      </div>

      {/* Dropdown via portal — renders at body level to escape stacking contexts */}
      {dropdownVisible && createPortal(
        <div
          ref={dropdownRef}
          className="portal-search-dropdown"
          style={{
            position: "fixed",
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
            zIndex: 999999,
          }}
        >
          {/* Current location */}
          {showCurrentLocationOption && (
            <div
              className="search-dropdown-cl"
              onMouseDown={(e) => { e.preventDefault(); trigger(12); onUseCurrentLocation(); setShowDropdown(false); }}
            >
              <div className="search-dropdown-cl-dot" />
              Use my current location
            </div>
          )}

          {/* Recent searches */}
          {showRecents && (
            <>
              <div className="search-section-header">
                <span>Recent</span>
                <button className="search-clear-btn" onClick={() => { trigger(10); handleClearAll(); }}>Clear all</button>
              </div>
              {visibleRecent.map((item, i) => (
                  <div
                      key={i}
                      className="search-dropdown-item"
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
                  <span className="search-dropdown-type-icon">🕐</span>
                  <span className="search-dropdown-name">{item.name}</span>
                </div>
              ))}
              {hasMoreRecent && (
                <div
                  className="search-dropdown-showmore"
                  onClick={() => setShowAllRecent(!showAllRecent)}
                >
                  {showAllRecent ? "Show less" : `Show ${recentSearches.length - 5} more`}
                </div>
              )}
              <div className="search-dropdown-divider" />
            </>
          )}

          {/* Loading */}
          {loading && !showSuggestions && (
            <div className="search-dropdown-empty search-dropdown-loading">
              <div
                className="search-dropdown-spinner"
                style={{ borderColor: `${accentColor}40`, borderTopColor: accentColor }}
              />
              Searching…
            </div>
          )}

          {/* Suggestions */}
          {showSuggestions && (
            <>
              <div className="search-section-header">
                <span>Suggestions</span>
                {loading && (
                  <div
                    className="search-section-spinner"
                    style={{ borderColor: `${accentColor}40`, borderTopColor: accentColor }}
                  />
                )}
              </div>
              {suggestions.map((loc, i) => {
                const meta = getTypeMeta(loc.type, loc.source);

                // For locationiq results: show "KFC — Legon" as the primary label
                // For local results: show the plain name as before
                const primaryLabel =
                  loc.source === "locationiq" && loc.displayLabel
                    ? loc.displayLabel
                    : loc.name;

                // Sub-line for locationiq: first 3 segments of the full address
                // so the user can verify which branch this is
                const subLabel =
                  loc.source === "locationiq" && loc.fullAddress
                    ? loc.fullAddress.split(",").slice(0, 3).join(",").trim()
                    : null;

                return (
                  <div
                    key={`${loc.name}-${i}`}
                    className="search-dropdown-item"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(loc); }}
                  >
                    <span className="search-dropdown-type-icon" title={meta.label}>
                      {meta.icon}
                    </span>
                    <div className="search-dropdown-info">
                      <span className="search-dropdown-name">{primaryLabel}</span>
                      {subLabel && (
                        <span className="search-dropdown-address">{subLabel}</span>
                      )}
                    </div>
                    {/* Distance badge on every result */}
                    {loc.dist > 0 && (
                      <span className="search-dropdown-dist">{loc.dist.toFixed(1)} km</span>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* No results */}
          {showEmpty && (
            <div className="search-dropdown-empty">No results — try a different name</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}